import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const CATS = 'stay, food, transport, adventure, travel, shopping, other';

type Msg = { role: 'user' | 'assistant'; content: string; image?: { mime: string; data: string } };

// ---- Gemini: pick a model that actually exists for this key (model names change over time) ----
let discovered: string | null = null;
async function discoverModel(key: string): Promise<string | null> {
  try {
    const r = await fetch(`${GEMINI_BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': key }, cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    const names: string[] = (j.models || []).filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent')).map((m: { name: string }) => m.name.replace('models/', ''));
    const ok = names.filter((n) => /^gemini-/.test(n) && !/(tts|image|live|embedding|robotics|computer|audio|thinking-exp)/.test(n));
    const ver = (n: string) => Number((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
    const rank = (n: string) => (n.includes('flash') && !n.includes('lite') ? 3 : n.includes('flash') ? 2 : 1) * 1000 + ver(n) * 10 - (/preview|exp/.test(n) ? 5 : 0);
    ok.sort((x, y) => rank(y) - rank(x));
    return ok[0] ?? null;
  } catch { return null; }
}

async function geminiCall(model: string, key: string, body: unknown) {
  return fetch(`${GEMINI_BASE}/models/${model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
}

/** Uses Gemini if GEMINI_API_KEY is set, otherwise Anthropic. `live` = Google Search grounding (Gemini only). */
async function claudeOnce(system: string, messages: Msg[], max_tokens: number, json = false, live = false): Promise<string> {
  const gKey = process.env.GEMINI_API_KEY;
  if (gKey) {
    const payload: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [...(m.image ? [{ inlineData: { mimeType: m.image.mime, data: m.image.data } }] : []), { text: m.content }] })),
      generationConfig: { maxOutputTokens: Math.max(max_tokens, 2048) * 2, temperature: 0.7, ...(json ? { responseMimeType: 'application/json' } : {}) },
    };
    const withTools = live ? { ...payload, tools: [{ google_search: {} }] } : payload;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const t0 = Date.now();
    const tried = new Set<string>();
    let lastStatus = 0, lastDetail = '';

    const tryModel = async (model: string): Promise<string | null> => {
      tried.add(model);
      for (let attempt = 0; attempt < (live ? 1 : 2); attempt++) {
        if (Date.now() - t0 > (live ? 16000 : 40000)) return null;
        let r = await geminiCall(model, gKey, withTools);
        if (r.status === 400 && live) r = await geminiCall(model, gKey, payload); // search tool not supported by this model
        if (r.ok) {
          const j = await r.json();
          const cand = j?.candidates?.[0];
          let text = ((cand?.content?.parts ?? []) as { text?: string }[]).map((p) => p.text ?? '').join('\n').trim();
          if (!text) return null;
          const chunks = (cand?.groundingMetadata?.groundingChunks ?? []) as { web?: { uri?: string; title?: string } }[];
          const seen = new Set<string>();
          const src = chunks.map((c) => c.web).filter((w): w is { uri: string; title?: string } => !!w?.uri).filter((w) => !seen.has(w.uri) && seen.add(w.uri)).slice(0, 3);
          if (live && src.length) text += `\n\nSources:\n${src.map((w) => `• ${w.title || 'Link'}: ${w.uri}`).join('\n')}`;
          discovered = model;
          return text;
        }
        lastStatus = r.status;
        try { lastDetail = (await r.json())?.error?.message || ''; } catch { lastDetail = ''; }
        if ([429, 500, 502, 503, 504].includes(r.status)) { await sleep(900 * (attempt + 1)); continue; } // busy → retry, then try another model
        return null; // 404 / 400 / 403 → next model
      }
      return null;
    };

    const order = [process.env.GEMINI_MODEL, discovered, 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-lite-latest'].filter(Boolean) as string[];
    for (const m of order) {
      if (tried.has(m)) continue;
      if (live && tried.size >= 2) break;
      const out = await tryModel(m);
      if (out) return out;
      if (lastStatus === 401 || lastStatus === 403) break;
    }
    if (lastStatus !== 401 && lastStatus !== 403) {
      const found = await discoverModel(gKey);
      if (found && !tried.has(found)) { const out = await tryModel(found); if (out) return out; }
    }
    if (lastStatus === 401 || lastStatus === 403) throw new Error('Gemini rejected the API key. Check GEMINI_API_KEY in Vercel.');
    if (lastStatus === 503 || lastStatus === 429) throw new Error('The AI is very busy right now. Please try again in a minute.');
    throw new Error(`Gemini ${lastStatus || 'error'}${lastDetail ? `: ${lastDetail.slice(0, 140)}` : ''}`);
  }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens, system, messages: messages.map((m) => ({ role: m.role, content: m.image ? [{ type: 'image', source: { type: 'base64', media_type: m.image.mime, data: m.image.data } }, { type: 'text', text: m.content }] : m.content })) }),
  });
  if (!r.ok) throw new Error(`AI request failed (${r.status})`);
  const j = await r.json();
  return (j.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n').trim();
}

/** Tries with live web search first; if that is unavailable (quota / busy), answers without it. */
async function claude(system: string, messages: Msg[], max_tokens: number, json = false, live = false): Promise<string> {
  try { return await claudeOnce(system, messages, max_tokens, json, live); }
  catch (e) {
    if (!live) throw e;
    const text = await claudeOnce(system, messages, max_tokens, json, false);
    return `${text}\n\n(Live web search wasn’t available just now, so this is from general knowledge. Please double-check prices and timings.)`;
  }
}

function extractJSON(text: string): unknown {
  const s = text.replace(/```json|```/g, '');
  const a = s.search(/[\[{]/);
  if (a < 0) return null;
  const open = s[a], close = open === '[' ? ']' : '}';
  const b = s.lastIndexOf(close);
  if (b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY && !process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI isn’t switched on yet. Add GEMINI_API_KEY in the Vercel environment variables.' }, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  if (!(await requireMember(req, String(body.code || '')))) return NextResponse.json({ error: 'Please log in to use this trip’s AI.' }, { status: 403 });

  try {
    if (body.mode === 'chat') {
      const history = (Array.isArray(body.history) ? body.history : []).slice(-12) as { who: string; text: string }[];
      const transcript = history.map((h) => `${clip(h.who, 30)}: ${clip(h.text, 800)}`).join('\n');
      const system = `You are Wander AI, a practical travel concierge inside a group trip app used by friends travelling together, mostly in India. You help with itineraries, stays/hotels/hostels, trains and buses, cabs/scooter/car rentals, food, costs and who-owes-what. Use live web search for anything that changes (prices, availability, train options, opening hours) and say when something is an estimate. Give concrete named options with rough ₹ prices and how to book (IRCTC, redBus, official sites, Google Maps). You cannot book anything yourself. Keep answers short and skimmable (under 170 words unless asked for more), plain language, **bold** for names. Use the trip context below.\n\nTRIP CONTEXT\n${clip(body.context, 5000)}`;
      const text = await claude(system, [{ role: 'user', content: `Group chat so far:\n${transcript}\n\nReply to the last message that mentions @ai.` }], 900, false, true);
      return NextResponse.json({ text });
    }

    if (body.mode === 'plan') {
      const days = (Array.isArray(body.days) ? body.days : []).slice(0, 14).map(String);
      const arrive = (body.arrive ?? {}) as { date?: string; time?: string };
      const leave = (body.leave ?? {}) as { date?: string; time?: string };
      const system = `You design realistic, well-paced group itineraries for trips in India. Reply with ONLY valid JSON (an array), no prose, no markdown fences.`;
      const prompt = `Destination: ${clip(body.destination, 80)}
Dates available (use ONLY these): ${days.join(', ')}
Group size: ${Number(body.people) || 4}. Group budget for the whole trip: ₹${Number(body.budget) || 0}.
The group ARRIVES on ${clip(arrive.date, 12)} at ${clip(arrive.time, 6)} (by train) and must LEAVE on ${clip(leave.date, 12)} at ${clip(leave.time, 6)} (train departs).
Mood: ${(Array.isArray(body.vibes) ? body.vibes : []).map((v) => clip(v, 20)).join(', ') || 'balanced'}.
Their own wishes (must-haves, places, food, pace): ${clip(body.extra, 1200) || 'none'}
Already planned (don't duplicate): ${(Array.isArray(body.existing) ? body.existing : []).slice(0, 40).map((x) => clip(x, 80)).join(' | ') || 'nothing'}
${Array.isArray(body.previous) ? `\nCURRENT DRAFT (revise it, keep what still works): ${JSON.stringify(body.previous).slice(0, 9000)}\nCHANGE REQUESTED: ${clip(body.tweak, 500)}\n` : ''}
Rules:
- First item on the arrival day: {"title":"Train arrives at <destination>", time = arrival time, category "travel", cost 0}. Then allow about 1.5 hours to get to the stay, check in and freshen up before any activity. If they arrive early morning, suggest breakfast and an easy first activity instead of a heavy sightseeing one.
- Last day: nothing new after the "head to the station" item. Put "Head to the station" about 2 hours before departure, and a final item "Return train departs" at the departure time (category "travel", cost 0). Leave time for a relaxed final meal or shopping earlier in the day.
- Honour their wishes. For places outside the city (for example Kumbhalgarh, Ranakpur, Mount Abu, Chittorgarh, Jodhpur), give the trip a realistic full or half day including travel time both ways, and don't stack other heavy plans on that day.
- Pace: 4-6 items on full days, fewer on arrival and departure days. Sunrise/sights early, food at meal times, sunsets and dinner in the evening.
- If their text names train dates or times that differ from the fields above, trust the text, but only use dates from the available list.
- Keep costs realistic in ₹ for the WHOLE group (0 if free) and roughly within the budget.
Return a JSON array. Each item: {"date":"YYYY-MM-DD","time":"HH:MM" (24h),"title":"short","note":"one useful tip","cost":number,"category":one of [${CATS}]}.`;
      const text = await claude(system, [{ role: 'user', content: prompt }], 4000, true);
      const data = extractJSON(text);
      return NextResponse.json({ data: Array.isArray(data) ? data : (data as { items?: unknown })?.items ?? null });
    }

    if (body.mode === 'ticket') {
      const img = body.image as { mime?: string; data?: string } | undefined;
      if (!img?.data || !/^image\/(jpeg|png|webp)$/.test(String(img.mime))) return NextResponse.json({ error: 'Send a JPG, PNG or WebP screenshot.' }, { status: 400 });
      if (img.data.length > 4_000_000) return NextResponse.json({ error: 'That image is too large. Try a smaller screenshot.' }, { status: 413 });
      const system = `You read Indian railway ticket screenshots (IRCTC, ConfirmTkt, RailYatri, ixigo, PDFs) and return ONLY valid JSON, no prose.`;
      const prompt = `Read this train ticket. Today is ${clip(body.today, 12)}; if the year is missing assume the next upcoming date.
Return {"trainName":string,"trainNo":string,"from":string (station name),"to":string (station name),"departDate":"YYYY-MM-DD","departTime":"HH:MM" 24h at the FROM station (boarding station departure),"arriveDate":"YYYY-MM-DD" or "","arriveTime":"HH:MM" or "","pnr":string,"travelClass":string (e.g. SL, 3A, 2A, CC),"passengers":[{"name":string,"coach":string (e.g. S4, B2, C1),"seat":string (seat/berth number with berth type if shown, e.g. "32 LB"),"status":string (e.g. CNF, RAC, WL 12; "" if unknown)}]}.
If a field isn't visible use "" (or [] for passengers). For waitlisted/RAC tickets without a coach or seat, leave coach and seat "" and put the status. Never invent values.`;
      const text = await claude(system, [{ role: 'user', content: prompt, image: { mime: String(img.mime), data: img.data } }], 1200, true);
      const data = extractJSON(text);
      return NextResponse.json({ data: data && !Array.isArray(data) ? data : null });
    }

    if (body.mode === 'expense') {
      const members = (Array.isArray(body.members) ? body.members : []).map((m) => clip(m, 40));
      const system = `You turn a casual sentence into a structured expense. Reply with ONLY valid JSON, no prose.`;
      const prompt = `Members: ${members.join(', ')}. The person typing is "${clip(body.me, 40)}". Today: ${clip(body.today, 12)}.
Sentence: "${clip(body.text, 300)}"
Return {"title":string,"amount":number,"category":one of [${CATS}],"paidBy":one member name exactly as listed (default to the person typing),"splitAmong":[member names exactly as listed; all members unless the sentence says otherwise]}.`;
      const text = await claude(system, [{ role: 'user', content: prompt }], 400, true);
      return NextResponse.json({ data: extractJSON(text) });
    }
    if (body.mode === 'receipt') {
      const img = body.image as { mime?: string; data?: string } | undefined;
      if (!img?.data || !/^image\/(jpeg|png|webp)$/.test(String(img.mime))) return NextResponse.json({ error: 'Send a JPG, PNG or WebP photo.' }, { status: 400 });
      if (img.data.length > 4_000_000) return NextResponse.json({ error: 'That image is too large.' }, { status: 413 });
      const system = `You read shop/restaurant bills and payment screenshots (UPI, Swiggy, Zomato, hotel invoices). Reply with ONLY valid JSON.`;
      const prompt = `Today is ${clip(body.today, 12)}. Return {"title":string (merchant or what it was for),"amount":number (the FINAL total paid in rupees),"category":one of [${CATS}],"date":"YYYY-MM-DD" or ""}. Never invent values; use "" or 0 if unreadable.`;
      const text = await claude(system, [{ role: 'user', content: prompt, image: { mime: String(img.mime), data: img.data } }], 500, true);
      return NextResponse.json({ data: extractJSON(text) });
    }

    if (body.mode === 'caption') {
      const system = `You write Instagram captions for friends' trip posts. Warm, witty, a little Indian-English flavour when it fits. No cringe. Reply with ONLY JSON.`;
      const prompt = `Trip: ${clip(body.trip, 80)} in ${clip(body.destination, 80)}, ${clip(body.dates, 60)}. ${Number(body.count) || 0} photos, format: ${clip(body.format, 30)}. Mood: ${clip(body.mood, 60) || 'fun'}.
Use current travel hashtag trends where you can. Return {"captions":[3 different caption options, each 1-3 short lines with tasteful emoji],"hashtags":[12 relevant hashtags including a few currently popular travel/reels ones, each starting with #]}.`;
      const text = await claude(system, [{ role: 'user', content: prompt }], 700, false, true);
      return NextResponse.json({ data: extractJSON(text) });
    }

    return NextResponse.json({ error: 'Unknown mode' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || 'AI error' }, { status: 502 });
  }
}
