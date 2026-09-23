import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { SB_SERVICE, SB_URL, svc } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Minutes before departure at which everyone gets a heads-up.
const STAGES = [180, 60, 20];

type Pax = { name: string; coach: string; seat: string; status?: string };
type TicketRow = { id: string; trip_id: string; train_name: string; train_no: string; from_station: string; to_station: string; depart_at: string; passengers: Pax[]; reminded: number[] };

const rest = svc;

const when = (m: number) => (m >= 120 ? `about ${Math.round(m / 60)} hours` : m >= 60 ? 'about an hour' : `${Math.max(1, Math.round(m))} minutes`);
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });

function message(t: TicketRow, mins: number, stage: number) {
  const train = [t.train_no, t.train_name].filter(Boolean).join(' ') || 'your train';
  const seats = (t.passengers || []).filter((p) => p.coach || p.seat).map((p) => `${p.name.split(' ')[0]}: ${[p.coach, p.seat].filter(Boolean).join(' / ')}`).join(' · ');
  const lead = stage === 20 ? '🚨 Time to board!' : stage === 60 ? '⏰ Head to the station now.' : '🧳 Start getting ready.';
  const title = `🚆 ${train} leaves in ${when(mins)}`;
  const body = `${lead} Departs ${t.from_station ? `${t.from_station} ` : ''}at ${clock(t.depart_at)}${t.to_station ? ` for ${t.to_station}` : ''}.${seats ? ` Seats → ${seats}.` : ''}`;
  return { title, body };
}

export async function GET(req: NextRequest) {
  if (!SB_URL || !SB_SERVICE) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set' }, { status: 503 });
  const now = Date.now();
  const code = req.nextUrl.searchParams.get('code');
  let tripFilter = '';
  let code4url = '';
  if (code) {
    if (!/^[A-Z0-9]{6,12}$/i.test(code)) return NextResponse.json({ fired: 0 });
    const r = await rest(`trips?code=eq.${code.toUpperCase()}&select=id`);
    const j = await r.json();
    if (!Array.isArray(j) || !j[0]) return NextResponse.json({ fired: 0 });
    tripFilter = `&trip_id=eq.${j[0].id}`; code4url = code.toUpperCase();
  }
  const lo = new Date(now - 10 * 60000).toISOString(), hi = new Date(now + (STAGES[0] + 5) * 60000).toISOString();
  const tr = await rest(`tickets?depart_at=gt.${lo}&depart_at=lt.${hi}${tripFilter}&select=*`);
  const tickets = (await tr.json()) as TicketRow[];
  if (!Array.isArray(tickets)) return NextResponse.json({ fired: 0 });

  const vapidOk = !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  if (vapidOk) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hello@example.com', process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);

  let fired = 0;
  for (const t of tickets) {
    const mins = (new Date(t.depart_at).getTime() - now) / 60000;
    const done = t.reminded || [];
    // the most urgent stage we've reached that hasn't fired yet
    const reached = STAGES.filter((s) => mins <= s);
    if (!reached.length) continue;
    const stage = Math.min(...reached);
    if (done.includes(stage)) continue;
    // claim it atomically so the cron and open apps never double-send
    const claimed = [...new Set([...done, ...STAGES.filter((s) => s >= stage)])];
    const c = await rest(`tickets?id=eq.${t.id}&reminded=not.cs.{${stage}}`, { method: 'PATCH', body: JSON.stringify({ reminded: claimed }) });
    const won = await c.json();
    if (!Array.isArray(won) || !won.length) continue;

    const { title, body } = message(t, Math.max(mins, 1), stage);
    const ss = await (await rest(`chat_sessions?trip_id=eq.${t.trip_id}&order=created_at.desc&limit=1&select=id`)).json();
    await rest('messages', { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), trip_id: t.trip_id, member_id: null, body: `${title}\n${body}`, is_ai: true, session_id: Array.isArray(ss) && ss[0] ? ss[0].id : null, created_at: new Date().toISOString() }) });

    if (vapidOk) {
      const sr = await rest(`push_subscriptions?trip_id=eq.${t.trip_id}&select=*`);
      const allSubs = (await sr.json()) as { id: string; member_id: string | null; endpoint: string; p256dh: string; auth: string }[];
      const mem = (await (await rest(`members?trip_id=eq.${t.trip_id}&select=id,perms`)).json()) as { id: string; perms: { gets_notifications?: boolean } | null }[];
      const muted = new Set((Array.isArray(mem) ? mem : []).filter((m) => m.perms?.gets_notifications === false).map((m) => m.id));
      const subs = (Array.isArray(allSubs) ? allSubs : []).filter((x) => !(x.member_id && muted.has(x.member_id)));
      let url = '/';
      if (!code4url) { const tt = await (await rest(`trips?id=eq.${t.trip_id}&select=code`)).json(); if (tt?.[0]?.code) url = `/t/${tt[0].code}`; } else url = `/t/${code4url}`;
      await Promise.all((Array.isArray(subs) ? subs : []).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body, url, tag: `train-${t.id}` }), { TTL: 3600, urgency: 'high' });
        } catch (e) {
          const sc = (e as { statusCode?: number }).statusCode;
          if (sc === 404 || sc === 410) await rest(`push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' });
        }
      }));
    }
    fired++;
  }
  return NextResponse.json({ fired, checked: tickets.length });
}
