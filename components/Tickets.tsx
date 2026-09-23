'use client';
import { api } from '@/lib/api';
import { useEffect, useRef, useState } from 'react';
import { useTrip, compress } from '@/lib/tripData';
import { photoUrl } from '@/lib/supabase';
import { enablePush, isIos, isStandalone, pushEnabled, pushSupported } from '@/lib/push';
import { countdown, fixArrival, fmtIST, istDateTime, todayISO, toISTiso, uid } from '@/lib/utils';
import type { Passenger, Ticket } from '@/lib/types';
import { Field, Icon, Sheet } from './ui';

type Draft = {
  id: string; direction: Ticket['direction']; train_name: string; train_no: string; from_station: string; to_station: string;
  depart_date: string; depart_time: string; arrive_date: string; arrive_time: string; pnr: string; travel_class: string; passengers: Passenger[];
  image_path: string | null; reminded: number[];
};

const toBase64 = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(b); });

function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return now;
}

function draftFromTicket(t: Ticket): Draft {
  const d = istDateTime(t.depart_at), a = t.arrive_at ? istDateTime(t.arrive_at) : { date: '', time: '' };
  return { id: t.id, direction: t.direction, train_name: t.train_name, train_no: t.train_no, from_station: t.from_station, to_station: t.to_station, depart_date: d.date, depart_time: d.time, arrive_date: a.date, arrive_time: a.time, pnr: t.pnr ?? '', travel_class: t.travel_class ?? '', passengers: t.passengers, image_path: t.image_path, reminded: t.reminded };
}

/* ---------------- tickets tab ---------------- */
export default function Tickets() {
  const t = useTrip();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<{ draft: Draft; blob: Blob | null }[]>([]);
  const [editing, setEditing] = useState<Ticket | null>(null);
  const [manual, setManual] = useState(false);
  const now = useNow();
  const canEdit = t.can('members_can_edit_plan');
  const aiOk = t.can('members_can_use_ai');

  const list = [...t.tickets].sort((a, b) => a.depart_at.localeCompare(b.depart_at));
  const dest = (t.trip.destination || '').split(',')[0].trim().toLowerCase();

  function blank(direction: Ticket['direction'] = 'outbound'): Draft {
    return { id: uid(), direction, train_name: '', train_no: '', from_station: '', to_station: '', depart_date: t.trip.start_date, depart_time: '', arrive_date: '', arrive_time: '', pnr: '', travel_class: '', passengers: [{ name: t.me?.name ?? '', coach: '', seat: '' }], image_path: null, reminded: [] };
  }

  async function extract(blob: Blob): Promise<Draft> {
    const r = await api('/api/ai', { mode: 'ticket', code: t.trip.code, today: todayISO(), image: { mime: blob.type || 'image/jpeg', data: await toBase64(blob) } });
    const j = await r.json();
    if (!r.ok || !j.data) throw new Error(j.error || 'Couldn’t read that ticket');
    const d = j.data as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    const from = str(d.from).toLowerCase();
    const direction: Ticket['direction'] = dest && from.includes(dest) ? 'return' : 'outbound';
    const pax = Array.isArray(d.passengers) ? (d.passengers as Record<string, unknown>[]).map((p) => ({ name: str(p.name), coach: str(p.coach), seat: str(p.seat), status: str(p.status) || undefined })) : [];
    const dDate = str(d.departDate) || t.trip.start_date;
    return { ...blank(direction), train_name: str(d.trainName), train_no: str(d.trainNo), from_station: str(d.from), to_station: str(d.to), depart_date: dDate, depart_time: str(d.departTime), arrive_date: fixArrival(dDate, str(d.departTime), str(d.arriveDate), str(d.arriveTime)), arrive_time: str(d.arriveTime), pnr: str(d.pnr), travel_class: str(d.travelClass), passengers: pax.length ? pax : blank().passengers };
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const out: { draft: Draft; blob: Blob | null }[] = [];
    for (const f of Array.from(files).slice(0, 4)) {
      const { blob } = await compress(f, 1600, 0.82).catch(() => ({ blob: null as Blob | null }));
      try {
        if (!blob) throw new Error('Couldn’t open that image');
        out.push({ blob, draft: await extract(blob) });
      } catch (e) {
        t.notify(`${(e as Error).message}. You can retry or enter it by hand.`);
        out.push({ draft: blank(), blob });
      }
    }
    setQueue(out); setBusy(false);
    if (input.current) input.current.value = '';
  }

  return (
    <div className="stack">
      <section className="glass pad-lg stack-sm">
        <h2 className="serif big">Train tickets</h2>
        <p className="muted small">Upload a screenshot of your ticket. AI reads the train, times, coach and seats, and everyone gets a reminder before boarding.</p>
        {canEdit ? (
          <div className="row wrap" style={{ marginTop: 6 }}>
            {aiOk && <button className="btn primary" disabled={busy} onClick={() => input.current?.click()}><Icon n="camera" size={18} /> {busy ? 'Reading ticket…' : 'Add ticket screenshot'}</button>}
            <button className={`btn ${aiOk ? '' : 'primary'}`} onClick={() => setManual(true)}>Enter by hand</button>
          </div>
        ) : <p className="muted small"><Icon n="lock" size={14} /> The admin has limited who can add tickets.</p>}
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        <p className="tiny faint">The screenshot is sent to the AI to read it and is saved to your trip so everyone can see it.</p>
      </section>

      <NotifyCard />

      {list.length === 0 ? (
        <div className="glass empty stack-sm"><span style={{ fontSize: 30 }}>🎫</span>No tickets yet.<br />Add your going and return trains.</div>
      ) : list.map((tk) => {
        const ms = new Date(tk.depart_at).getTime() - now;
        const past = ms <= -15 * 60000;
        return (
          <article key={tk.id} className="glass pad stack" style={{ opacity: past ? 0.6 : 1 }}>
            <div className="row between">
              <span className="badge">{tk.direction === 'return' ? '↩ Return' : tk.direction === 'outbound' ? '➜ Going' : 'Ticket'}</span>
              <span className={`badge ${past ? '' : 'good'}`}>{past ? 'Departed' : `in ${countdown(ms)}`}</span>
            </div>
            <div>
              <div className="section-title">{[tk.train_no, tk.train_name].filter(Boolean).join(' · ') || 'Train'}</div>
              <div className="muted">{tk.from_station || '—'} → {tk.to_station || '—'}</div>
              <div className="small" style={{ marginTop: 4 }}>Departs <b>{fmtIST(tk.depart_at)}</b>{tk.arrive_at && <> · arrives {fmtIST(tk.arrive_at)}</>}</div>
            </div>
            {tk.passengers.length > 0 && (
              <div className="inner pad stack-sm">
                {tk.passengers.map((p, i) => (
                  <div key={i} className="row small">
                    <span className="grow"><b>{p.name || 'Passenger'}</b>{p.status && <span className="muted"> · {p.status}</span>}</span>
                    <span className="num"><b>{[p.coach, p.seat].filter(Boolean).join(' · ') || '—'}</b></span>
                  </div>
                ))}
              </div>
            )}
            <div className="row wrap">
              {tk.pnr && <button className="btn sm" onClick={async () => { await navigator.clipboard.writeText(tk.pnr!); t.notify('PNR copied'); }}><Icon n="copy" size={14} /> PNR {tk.pnr}</button>}
              {tk.image_path && <a className="btn sm" href={photoUrl(tk.image_path)} target="_blank" rel="noreferrer"><Icon n="image" size={14} /> Screenshot</a>}
              {canEdit && <button className="btn sm" onClick={() => setEditing(tk)}><Icon n="edit" size={14} /> Edit</button>}
            </div>
          </article>
        );
      })}

      {queue[0] && <TicketSheet key={queue[0].draft.id} draft={queue[0].draft} blob={queue[0].blob} reread={queue[0].blob ? () => extract(queue[0].blob!) : undefined} onClose={() => setQueue(queue.slice(1))} />}
      {manual && <TicketSheet draft={blank()} blob={null} onClose={() => setManual(false)} />}
      {editing && <TicketSheet key={editing.id} draft={draftFromTicket(editing)} blob={null} existing={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/* ---------------- review / edit sheet ---------------- */
function TicketSheet({ draft, blob, existing, reread, onClose }: { draft: Draft; blob: Blob | null; existing?: Ticket; reread?: () => Promise<Draft>; onClose: () => void }) {
  const t = useTrip();
  const [d, setD] = useState<Draft>(draft);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setPax = (i: number, p: Partial<Passenger>) => set('passengers', d.passengers.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const valid = d.depart_date && d.depart_time;
  const [rereading, setRereading] = useState(false);

  async function save() {
    await t.saveTicket({
      id: d.id, member_id: existing?.member_id ?? t.me?.id ?? null, direction: d.direction, train_name: d.train_name.trim(), train_no: d.train_no.trim(),
      from_station: d.from_station.trim(), to_station: d.to_station.trim(), depart_at: toISTiso(d.depart_date, d.depart_time),
      arrive_at: d.arrive_date && d.arrive_time ? toISTiso(fixArrival(d.depart_date, d.depart_time, d.arrive_date, d.arrive_time), d.arrive_time) : null, pnr: d.pnr.trim() || null, travel_class: d.travel_class.trim() || null,
      passengers: d.passengers.filter((p) => p.name || p.coach || p.seat), image_path: d.image_path,
      // if the departure time changed, allow reminders to fire again
      reminded: existing && existing.depart_at === toISTiso(d.depart_date, d.depart_time) ? d.reminded : [],
    }, blob);
    t.notify(existing ? 'Ticket updated' : 'Ticket saved. Everyone can see it.');
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={existing ? 'Edit ticket' : 'Check the ticket'} actions={
      <>
        {existing && <button className="btn danger" onClick={async () => { if (confirm('Delete this ticket for everyone?')) { await t.deleteTicket(existing); onClose(); } }}><Icon n="trash" size={17} /></button>}
        <button className="btn primary" disabled={!valid} onClick={save}>{existing ? 'Save changes' : 'Save ticket'}</button>
      </>
    }>
      {!existing && <p className="muted small">AI filled this in from your screenshot. Please double-check the times, coach and seats.</p>}
      {reread && !existing && !d.depart_time && (
        <button className="btn sm" disabled={rereading} onClick={async () => { setRereading(true); try { const n = await reread(); setD((x) => ({ ...n, id: x.id })); } catch (e) { t.notify((e as Error).message); } setRereading(false); }}><Icon n="sparkle" size={15} /> {rereading ? 'Reading…' : 'Try reading the screenshot again'}</button>
      )}
      <div className="chips wrap">
        {(['outbound', 'return'] as const).map((k) => <button key={k} className={`chip ${d.direction === k ? 'on' : ''}`} onClick={() => set('direction', k)}>{k === 'outbound' ? '➜ Going' : '↩ Return'}</button>)}
      </div>
      <div className="two">
        <Field label="Train no."><input value={d.train_no} onChange={(e) => set('train_no', e.target.value)} placeholder="12991" inputMode="numeric" /></Field>
        <Field label="Train name"><input value={d.train_name} onChange={(e) => set('train_name', e.target.value)} placeholder="Udaipur City Exp" /></Field>
      </div>
      <div className="two">
        <Field label="From"><input value={d.from_station} onChange={(e) => set('from_station', e.target.value)} placeholder="Station" /></Field>
        <Field label="To"><input value={d.to_station} onChange={(e) => set('to_station', e.target.value)} placeholder="Station" /></Field>
      </div>
      <div className="two">
        <Field label="Departs on"><input type="date" value={d.depart_date} onChange={(e) => set('depart_date', e.target.value)} /></Field>
        <Field label="Departs at"><input type="time" value={d.depart_time} onChange={(e) => set('depart_time', e.target.value)} /></Field>
      </div>
      <div className="two">
        <Field label="Arrives on"><input type="date" value={d.arrive_date} onChange={(e) => set('arrive_date', e.target.value)} /></Field>
        <Field label="Arrives at"><input type="time" value={d.arrive_time} onChange={(e) => set('arrive_time', e.target.value)} /></Field>
      </div>
      <div className="two">
        <Field label="PNR"><input value={d.pnr} onChange={(e) => set('pnr', e.target.value)} inputMode="numeric" /></Field>
        <Field label="Class"><input value={d.travel_class} onChange={(e) => set('travel_class', e.target.value)} placeholder="SL / 3A / 2A" /></Field>
      </div>
      <div className="stack-sm">
        <span className="field-label">Passengers, coach and seat</span>
        {d.passengers.map((p, i) => (
          <div key={i} className="inner pad stack-sm">
            <div className="row"><input placeholder="Name" value={p.name} onChange={(e) => setPax(i, { name: e.target.value })} />
              <button className="icon-btn sm" aria-label="Remove passenger" onClick={() => set('passengers', d.passengers.filter((_, j) => j !== i))}><Icon n="x" size={14} /></button></div>
            <div className="two"><input placeholder="Coach (S4)" value={p.coach} onChange={(e) => setPax(i, { coach: e.target.value })} /><input placeholder="Seat (32 LB)" value={p.seat} onChange={(e) => setPax(i, { seat: e.target.value })} /></div>
            {p.status && <span className="tiny muted">Status: {p.status}</span>}
          </div>
        ))}
        <button className="btn sm" onClick={() => set('passengers', [...d.passengers, { name: '', coach: '', seat: '' }])}><Icon n="plus" size={14} /> Add passenger</button>
      </div>
    </Sheet>
  );
}

/* ---------------- notifications opt-in ---------------- */
export function NotifyCard({ compact = false }: { compact?: boolean }) {
  const t = useTrip();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushEnabled().then(setOn); }, []);

  if (on) return compact ? null : <div className="glass pad row small"><Icon n="check" size={18} /> <span>Train reminders are on for this phone.</span></div>;
  const ios = isIos();
  if (ios && !isStandalone()) return <div className="glass pad small muted">🔔 To get train reminders on iPhone, first tap Share → <b>Add to Home Screen</b>, then open Wander from your home screen.</div>;
  if (!pushSupported()) return <div className="glass pad small muted">🔔 This browser can’t show reminders. Reminders will still appear in the group chat.</div>;

  return (
    <div className="glass pad row">
      <span style={{ fontSize: 24 }}>🔔</span>
      <div className="grow"><b>Get train reminders</b><div className="muted small">A heads-up on this phone 3 hours, 1 hour and 20 minutes before boarding.</div></div>
      <button className="btn primary sm" disabled={busy} onClick={async () => {
        setBusy(true);
        const r = await enablePush(t.trip.id, t.me?.id ?? null);
        setBusy(false);
        if (r === 'ok') { setOn(true); t.notify('Reminders on 🔔'); }
        else if (r === 'denied') t.notify('Notifications are blocked. Turn them on in your phone’s site settings.');
        else if (r === 'nokey') t.notify('Notifications aren’t set up on the server yet.');
        else t.notify('Couldn’t turn on reminders. Try again.');
      }}>{busy ? '…' : 'Turn on'}</button>
    </div>
  );
}

/* ---------------- "next up" card for the Trip tab ---------------- */
export function NextUp({ open }: { open: () => void }) {
  const { tickets } = useTrip();
  const now = useNow(20000);
  const next = [...tickets].filter((x) => new Date(x.depart_at).getTime() > now - 15 * 60000).sort((a, b) => a.depart_at.localeCompare(b.depart_at))[0];
  if (!next) return null;
  const ms = new Date(next.depart_at).getTime() - now;
  return (
    <button className="glass pad-lg stack-sm" style={{ textAlign: 'left' }} onClick={open}>
      <div className="row between"><span className="badge">🚆 Next train</span><span className="badge good">{ms <= 0 ? countdown(ms) : `in ${countdown(ms)}`}</span></div>
      <div className="section-title">{[next.train_no, next.train_name].filter(Boolean).join(' · ') || 'Train'}</div>
      <div className="muted small">{next.from_station} → {next.to_station} · departs {fmtIST(next.depart_at)}</div>
      {next.passengers.some((p) => p.coach || p.seat) && (
        <div className="kv">{next.passengers.filter((p) => p.coach || p.seat).map((p, i) => <span key={i}>{p.name.split(' ')[0] || 'Seat'}: {[p.coach, p.seat].filter(Boolean).join(' ')}</span>)}</div>
      )}
    </button>
  );
}
