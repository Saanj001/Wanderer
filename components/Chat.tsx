'use client';
import { api } from '@/lib/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTrip, compress } from '@/lib/tripData';
import { photoUrl } from '@/lib/supabase';
import { balances, chatDay, chatTime, fmtDate, mentionHandle, money, parseMentions, uid } from '@/lib/utils';
import type { Message, PollData } from '@/lib/types';
import { Avatar, Field, Icon, RichText, Sheet } from './ui';
import { useCall } from './Call';

const STICKERS = ['🔥', '😂', '🥳', '😍', '🤯', '👏', '🙏', '💸', '🍛', '☕', '🛺', '🚂', '🏰', '🌅', '🚣', '📸', '😴', '🥵', '🤝', '❤️', '🎉', '🍕', '🧳', '🕺'];
const TEXT_STICKERS = ['Chai time ☕', 'Paisa vasool 💸', 'Are we there yet? 🚂', 'Bill split karo 🧾', 'Sunset ho gaya 🌅', 'Photo lo! 📸', 'Bhook lagi hai 🍛', 'Let’s goooo 🚀'];

export default function Chat() {
  const t = useTrip();
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [tray, setTray] = useState(false);
  const [sheet, setSheet] = useState<'stickers' | 'gif' | 'poll' | 'history' | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [tasked, setTasked] = useState<string[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const aiOk = t.can('members_can_use_ai');
  const call = useCall();
  const cur = t.currentSession;
  const readOnly = viewing !== null;
  const visible = useMemo(() => t.messages.filter((m) => (viewing === 'legacy' ? !m.session_id : viewing ? m.session_id === viewing : !cur ? true : m.session_id === cur.id)), [t.messages, viewing, cur]);
  const mq = /(^|\s)@([^\s@]*)$/.exec(text);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [visible.length, thinking, viewing]);

  const context = useMemo(() => {
    const net = balances(t.members, t.expenses, t.payments);
    const tk = t.tickets.map((x) => `${x.direction}: ${x.train_no} ${x.train_name} ${x.from_station}→${x.to_station} departs ${x.depart_at}`).join('; ');
    return [
      `Trip: ${t.trip.name} to ${t.trip.destination}, ${t.trip.start_date} to ${t.trip.end_date}. Budget ₹${t.trip.budget}. Group size ${t.members.length}.`,
      `Travellers: ${t.members.map((m) => m.name).join(', ')}.`,
      tk ? `Trains: ${tk}.` : '',
      `Itinerary:\n${[...t.plan].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map((p) => `- ${fmtDate(p.date)} ${p.time} ${p.title} (≈₹${p.cost})`).join('\n') || '- (empty)'}`,
      `Spent so far: ${money(t.expenses.reduce((s, e) => s + e.amount, 0))}. Balances: ${t.members.map((m) => `${m.name} ${Math.round(net[m.id] ?? 0)}`).join(', ')} (+ is owed to them).`,
    ].filter(Boolean).join('\n');
  }, [t.trip, t.members, t.plan, t.expenses, t.payments, t.tickets]);

  async function askAi(body: string) {
    setThinking(true);
    try {
      const history = visible.slice(-10).map((m) => ({ who: m.is_ai ? 'Wander AI' : t.member(m.member_id)?.name ?? 'Someone', text: m.kind === 'text' ? m.body : `[${m.kind}]` }));
      history.push({ who: t.me?.name ?? 'Someone', text: body });
      const r = await api('/api/ai', { mode: 'chat', code: t.trip.code, context, history });
      const j = await r.json();
      await t.sendMessage(r.ok && j.text ? j.text : `Sorry, the AI hit a problem: ${j.error || 'try again'}`, true);
    } catch { await t.sendMessage('Sorry, I couldn’t reach the AI just now.', true); }
    setThinking(false);
  }

  async function send(raw?: string) {
    const body = (raw ?? text).trim();
    if (!body) return;
    if (raw === undefined) setText('');
    await t.sendMessage(body);
    if (aiOk && /(^|\s)@ai\b/i.test(body)) await askAi(body);
  }

  const n = t.members.length, b = t.trip.budget;
  const ask = (label: string, q: string) => ({ label, q: `@ai ${q}` });
  const quick = [
    ask('🏨 Stays', `Suggest 3 places to stay in ${t.trip.destination} for ${n} people ${b ? `within a total trip budget of ₹${b}` : ''} for ${t.trip.start_date} to ${t.trip.end_date}. Include rough price per night and how to book.`),
    ask('🚆 Trains', `What are the best train options between our home city and ${t.trip.destination} around ${t.trip.start_date} and back on ${t.trip.end_date}? Include train numbers, timings and rough fares.`),
    ask('🛵 Rentals', `Where and how can we rent scooters or a cab for ${n} people in ${t.trip.destination}? Give rough daily prices and safety tips.`),
    ask('🍽️ Food', `Where should we eat in ${t.trip.destination}? Suggest 5 places across budgets with what to order.`),
  ];

  async function sendImage(f: File | undefined) {
    if (!f) return;
    setTray(false);
    const { blob } = await compress(f, 1600, 0.82);
    await t.sendMessage('', false, { kind: 'image', image: blob });
    if (file.current) file.current.value = '';
  }

  function shareLocation() {
    if (!navigator.geolocation) return t.notify('Location isn’t available on this device.');
    navigator.geolocation.getCurrentPosition(
      (p) => t.sendMessage(`📍 My location\nhttps://www.google.com/maps?q=${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}`),
      () => t.notify('Couldn’t get your location. Allow location access and try again.'),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function startCall() { if (call.active) call.join(); else call.start(); }

  let lastDay = '', lastWho: string | null = '__', lastAt = 0;
  return (
    <div className="chat-wrap">
      <div className="chips" style={{ marginBottom: 6 }}>
        <button className="chip" onClick={() => setSheet('history')}>🕘 History</button>
        {t.isAdmin && <button className="chip" onClick={async () => { if (confirm('Start a new chat? Everyone gets a clean chat. The old messages stay saved under History.')) { setViewing(null); await t.newChat(); t.notify('New chat started. Old messages are saved in History.'); } }}>🗂️ New chat</button>}
        <button className="chip" onClick={startCall}><Icon n="video" size={15} /> {call.active ? 'Return to call' : 'Video call'}</button>
        {(t.isAdmin || t.can('members_can_announce')) && <button className="chip" onClick={() => { const a = window.prompt('Announcement to everyone (they get a notification):'); if (a && a.trim()) t.sendMessage(`📣 ${a.trim()}`); }}>📣 Announce</button>}
        {aiOk && quick.map((x) => <button key={x.label} className="chip" onClick={() => send(x.q)}>{x.label}</button>)}
      </div>
      <div className="chat-scroll" ref={scroller}>
        {visible.length === 0 && (
          <div className="glass empty stack-sm" style={{ margin: 'auto 0' }}><span style={{ fontSize: 32 }}>💬</span>
            <b>Say hi to the group</b><span className="small">Mention <b>@ai</b> for stays, trains, rentals and food ideas, or tap a shortcut above.</span></div>
        )}
        {visible.map((m) => {
          const d = chatDay(m.created_at);
          const showDay = d !== lastDay; lastDay = d;
          const who = m.is_ai ? 'ai' : m.member_id;
          const prevAt = lastAt; lastAt = new Date(m.created_at).getTime();
          const cont = !showDay && who === lastWho && lastAt - prevAt < 5 * 60000; lastWho = who;
          const mine = !m.is_ai && m.member_id === t.me?.id;
          const sender = t.member(m.member_id);
          const kind = m.kind ?? 'text';
          const bare = kind === 'sticker' || kind === 'gif' || kind === 'image';
          const poll = kind === 'poll' ? parsePoll(m.body) : null;
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              {showDay && <div className="chat-day">{d}</div>}
              <div className={`msg ${mine ? 'me' : ''} ${m.is_ai ? 'ai' : ''} ${cont ? 'cont' : ''}`}>
                {!mine && (cont ? <span style={{ width: 30, flex: 'none' }} /> : <Avatar m={sender} ai={m.is_ai} size={30} />)}
                <div className={bare ? 'bare' : 'bubble'}>
                  {!cont && <span className="who" style={{ color: mine ? 'rgba(20,9,12,.75)' : m.is_ai ? '#ffc46b' : sender?.color }}>{m.is_ai ? 'Wander AI' : mine ? 'You' : sender?.name ?? 'Someone'}</span>}
                  {kind === 'text' && <RichText text={m.body} />}
                  {kind === 'text' && !m.is_ai && !readOnly && t.can('members_can_assign_tasks') && (() => {
                    const ids = parseMentions(m.body, t.members);
                    if (!ids.length) return null;
                    const title = m.body.replace(/@[\p{L}\p{N}_]+/gu, '').replace(/\s+/g, ' ').trim();
                    if (!title) return null;
                    const made = tasked.includes(m.id) || t.tasks.some((x) => x.title === title && x.assignee_id === ids[0]);
                    return made ? <span className="mk-task done">✅ Task added</span> : (
                      <button className="mk-task" onClick={async () => { await t.saveTask({ id: uid(), title: title[0].toUpperCase() + title.slice(1), assignee_id: ids[0] }); setTasked((x) => [...x, m.id]); t.notify(`Task added for ${t.member(ids[0])?.name}`); }}>✅ Make task for {t.member(ids[0])?.name.split(' ')[0]}</button>
                    );
                  })()}
                  {kind === 'poll' && poll && <PollCard m={m} poll={poll} />}
                  {kind === 'sticker' && (m.body.length <= 2 ? <div className="sticker-big">{m.body}</div> : <div className="sticker-text">{m.body}</div>)}
                  {kind === 'gif' && /* eslint-disable-next-line @next/next/no-img-element */ <img className="chat-img" src={m.body} alt="GIF" loading="lazy" />}
                  {kind === 'image' && m.image_path && /* eslint-disable-next-line @next/next/no-img-element */ <a href={photoUrl(m.image_path)} target="_blank" rel="noreferrer"><img className="chat-img" src={photoUrl(m.image_path)} alt="Shared photo" loading="lazy" /></a>}
                  {kind === 'call' && (
                    <div className="stack-sm" style={{ minWidth: 190 }}>
                      <b>📹 Video call</b>
                      {m.body.startsWith('http')
                        ? <a className="btn sm primary" href={m.body} target="_blank" rel="noreferrer">Join now</a>
                        : call.active ? <span className="small">You’re in the call</span> : <button className="btn sm primary" onClick={() => call.join()}>Join call</button>}
                    </div>
                  )}
                  <time>{chatTime(m.created_at)}</time>
                </div>
              </div>
            </div>
          );
        })}
        {thinking && <div className="msg ai"><Avatar ai size={30} /><div className="bubble"><span className="typing"><i /><i /><i /></span></div></div>}
      </div>

      {!readOnly && tray && (
        <div className="tray glass">
          <button onClick={() => file.current?.click()}><Icon n="camera" size={22} />Photo</button>
          <button onClick={() => { setSheet('stickers'); setTray(false); }}><span style={{ fontSize: 22 }}>😄</span>Stickers</button>
          <button onClick={() => { setSheet('gif'); setTray(false); }}><span style={{ fontSize: 18, fontWeight: 800 }}>GIF</span>GIFs</button>
          <button onClick={() => { setSheet('poll'); setTray(false); }}><span style={{ fontSize: 22 }}>📊</span>Poll</button>
          <button onClick={() => { setTray(false); shareLocation(); }}><span style={{ fontSize: 22 }}>📍</span>Location</button>
        </div>
      )}
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => sendImage(e.target.files?.[0])} />
      {readOnly ? (
        <div className="glass pad row between small"><span className="muted">Viewing an older chat</span><button className="btn sm primary" onClick={() => setViewing(null)}>Back to current chat</button></div>
      ) : (<>
      {mq && (
        <div className="mention-bar">
          {[...(mq[2].length <= 2 && 'ai'.startsWith(mq[2].toLowerCase()) && aiOk ? [{ id: 'ai', label: '@ai', sub: 'Ask the AI' }] : []),
            ...t.members.filter((m) => m.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(mq[2].toLowerCase())) || !mq[2]).map((m) => ({ id: m.id, label: mentionHandle(m.name, t.members), sub: m.name }))].slice(0, 8).map((o) => (
            <button key={o.id} className="chip" onPointerDown={(e) => e.preventDefault()} onClick={() => { setText(text.replace(/@([^\s@]*)$/, o.label + ' ')); box.current?.focus(); }}>
              {o.id !== 'ai' && <Avatar m={t.member(o.id)} size={20} />} {o.label}
            </button>
          ))}
        </div>
      )}
      <div className="composer glass">
        <button className={`icon-btn ${tray ? 'on' : ''}`} onPointerDown={(e) => e.preventDefault()} onClick={() => setTray(!tray)} aria-label="Attach"><Icon n="plus" size={20} /></button>
        <textarea ref={box} rows={1} placeholder={aiOk ? 'Message · @ai for help' : 'Message'} value={text} onChange={(e) => { setText(e.target.value); e.target.style.height = '44px'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); send(); } }} />
        <button className="send" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={() => { send(); if (box.current) box.current.style.height = '44px'; box.current?.focus(); }} disabled={!text.trim()} aria-label="Send"><Icon n="send" size={20} /></button>
      </div>
      </>)}

      <Sheet open={sheet === 'stickers'} onClose={() => setSheet(null)} title="Stickers">
        <div className="sticker-grid">{STICKERS.map((s) => <button key={s} onClick={() => { t.sendMessage(s, false, { kind: 'sticker' }); setSheet(null); }}>{s}</button>)}</div>
        <div className="chips wrap">{TEXT_STICKERS.map((s) => <button key={s} className="chip" onClick={() => { t.sendMessage(s, false, { kind: 'sticker' }); setSheet(null); }}>{s}</button>)}</div>
      </Sheet>
      {sheet === 'history' && <HistorySheet onClose={() => setSheet(null)} onPick={(id) => { setViewing(id); setSheet(null); }} viewing={viewing} />}
      {sheet === 'poll' && <PollSheet onClose={() => setSheet(null)} />}
      {sheet === 'gif' && <GifSheet onClose={() => setSheet(null)} onPick={(url) => { t.sendMessage(url, false, { kind: 'gif' }); setSheet(null); }} />}
    </div>
  );
}

function GifSheet({ onClose, onPick }: { onClose: () => void; onPick: (url: string) => void }) {
  const [q, setQ] = useState('');
  const [gifs, setGifs] = useState<{ id: string; url: string; preview: string }[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'nokey'>('loading');
  useEffect(() => {
    const h = setTimeout(async () => {
      try {
        const r = await fetch(`/api/gifs?q=${encodeURIComponent(q)}`);
        if (r.status === 503) return setState('nokey');
        setGifs((await r.json()).gifs ?? []); setState('ok');
      } catch { setState('ok'); }
    }, 300);
    return () => clearTimeout(h);
  }, [q]);
  return (
    <Sheet open onClose={onClose} title="GIFs">
      {state === 'nokey' ? <p className="muted">GIFs need a free GIPHY key. Add <b>GIPHY_API_KEY</b> in Vercel to switch them on. Stickers and photos work without it.</p> : (
        <>
          <input placeholder="Search GIFs (chai, sunset, dance…)" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="gif-grid">{gifs.map((g) => /* eslint-disable-next-line @next/next/no-img-element */ <button key={g.id} onClick={() => onPick(g.url)}><img src={g.preview} alt="" loading="lazy" /></button>)}</div>
        </>
      )}
    </Sheet>
  );
}

function parsePoll(body: string): PollData | null {
  try { const p = JSON.parse(body); return p && Array.isArray(p.options) ? { question: String(p.question || 'Poll'), options: p.options.map(String), multi: !!p.multi } : null; } catch { return null; }
}

function PollCard({ m, poll }: { m: Message; poll: PollData }) {
  const t = useTrip();
  const votes = t.pollVotes.filter((v) => v.message_id === m.id);
  const voters = new Set(votes.map((v) => v.member_id)).size;
  return (
    <div className="poll">
      <b>📊 {poll.question}</b>
      <span className="tiny muted">{poll.multi ? 'Select one or more' : 'Select one'}</span>
      {poll.options.map((o, i) => {
        const vs = votes.filter((v) => v.option_index === i);
        const mine = vs.some((v) => v.member_id === t.me?.id);
        const pct = voters ? Math.round((vs.length / voters) * 100) : 0;
        return (
          <button key={i} className={`poll-opt ${mine ? 'on' : ''}`} onClick={() => t.vote(m.id, i, poll.multi)}>
            <i style={{ width: `${pct}%` }} />
            <span className="grow">{mine ? '✓ ' : ''}{o}</span>
            <span className="poll-voters">{vs.slice(0, 3).map((v) => <Avatar key={v.id} m={t.member(v.member_id)} size={16} />)}</span>
            <b className="num">{vs.length}</b>
          </button>
        );
      })}
      <span className="tiny muted">{voters} {voters === 1 ? 'vote' : 'votes'}</span>
    </div>
  );
}

function PollSheet({ onClose }: { onClose: () => void }) {
  const t = useTrip();
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const clean = opts.map((o) => o.trim()).filter(Boolean);
  return (
    <Sheet open onClose={onClose} title="New poll" actions={
      <button className="btn primary" disabled={!q.trim() || clean.length < 2} onClick={async () => { await t.sendMessage(JSON.stringify({ question: q.trim(), options: clean, multi }), false, { kind: 'poll' }); onClose(); }}>Send poll</button>
    }>
      <Field label="Question"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Where should we have dinner?" autoFocus /></Field>
      <div className="stack-sm">
        <span className="field-label">Options</span>
        {opts.map((o, i) => (
          <div key={i} className="row"><input value={o} placeholder={`Option ${i + 1}`} onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} />
            {opts.length > 2 && <button className="icon-btn sm" aria-label="Remove option" onClick={() => setOpts(opts.filter((_, j) => j !== i))}><Icon n="x" size={14} /></button>}</div>
        ))}
        {opts.length < 8 && <button className="btn sm" onClick={() => setOpts([...opts, ''])}><Icon n="plus" size={14} /> Add option</button>}
      </div>
      <label className="card-li" style={{ cursor: 'pointer' }}><span className="grow"><b>Allow multiple answers</b></span><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} /></label>
    </Sheet>
  );
}

function HistorySheet({ onClose, onPick, viewing }: { onClose: () => void; onPick: (id: string | null) => void; viewing: string | null }) {
  const t = useTrip();
  const rows: { id: string | null; key: string; title: string; msgs: Message[] }[] = [];
  const sess = [...t.sessions].reverse();
  sess.forEach((s, i) => rows.push({ id: i === 0 ? null : s.id, key: s.id, title: i === 0 ? 'Current chat' : 'Older chat', msgs: t.messages.filter((m) => m.session_id === s.id) }));
  const legacy = t.messages.filter((m) => !m.session_id);
  if (legacy.length && sess.length) rows.push({ id: 'legacy', key: 'legacy', title: 'Earlier messages', msgs: legacy });
  const range = (ms: Message[]) => {
    if (!ms.length) return 'No messages yet';
    const a = fmtDate(ms[0].created_at.slice(0, 10)), b = fmtDate(ms[ms.length - 1].created_at.slice(0, 10));
    return a === b ? a : `${a} – ${b}`;
  };
  return (
    <Sheet open onClose={onClose} title="Chat history">
      {rows.length === 0 ? <p className="muted">Nothing archived yet. When the admin starts a <b>New chat</b>, the old messages are saved here and can always be opened.</p> : rows.map((r) => (
        <button key={r.key} className={`trip-card ${(r.id ?? null) === viewing ? 'on' : ''}`} onClick={() => onPick(r.id)}>
          <span className="tc-accent" />
          <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
            <b className="tc-name ellipsis" style={{ fontSize: 20 }}>{r.title}</b>
            <span className="muted small ellipsis" style={{ display: 'block' }}>{range(r.msgs)} · {r.msgs.length} messages</span>
            {r.msgs[0] && <span className="tiny faint ellipsis" style={{ display: 'block' }}>{r.msgs.find((m) => m.kind === 'text')?.body.slice(0, 60)}</span>}
          </span>
          <Icon n="arrow" size={18} />
        </button>
      ))}
    </Sheet>
  );
}
