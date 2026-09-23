'use client';
import { api } from '@/lib/api';
import { useMemo, useState } from 'react';
import { useTrip } from '@/lib/tripData';
import { CATS, CAT_KEYS, eachDay, fmtDate, fmtTime12, istDateTime, money, todayISO, uid } from '@/lib/utils';
import { LOCAL_COSTS, SPOTS, type Spot } from '@/lib/udaipur';
import type { Category, PlanItem } from '@/lib/types';
import { Field, Icon, Segmented, Sheet } from './ui';
import Tickets from './Tickets';
import Tasks from './Tasks';

type View = 'plan' | 'tickets' | 'tasks' | 'explore' | 'ai';

export default function Plan() {
  const t = useTrip();
  const [view, setView] = useState<View>(() => {
    try { const v = sessionStorage.getItem('wander.planview') as View | null; if (v) { sessionStorage.removeItem('wander.planview'); return v; } } catch {}
    return 'plan';
  });
  return (
    <div className="stack">
      <Segmented<View> value={view} onChange={setView} options={[{ v: 'plan', label: 'Days' }, { v: 'tickets', label: 'Tickets' }, { v: 'tasks', label: 'Tasks' }, { v: 'explore', label: 'Explore' }, ...(t.can('members_can_use_ai') ? [{ v: 'ai' as View, label: '✨ AI' }] : [])]} />
      {view === 'plan' && <Itinerary />}
      {view === 'tickets' && <Tickets />}
      {view === 'tasks' && <Tasks />}
      {view === 'explore' && <Explore />}
      {view === 'ai' && <AiPlanner done={() => setView('plan')} />}
    </div>
  );
}

function Itinerary() {
  const t = useTrip();
  const tk = t.tickets;
  const days = useMemo(() => eachDay(t.trip.start_date, t.trip.end_date), [t.trip.start_date, t.trip.end_date]);
  const today = todayISO();
  const [dayRaw, setDay] = useState(days.includes(today) ? today : days[0]);
  const day = days.includes(dayRaw) ? dayRaw : days[0];
  const [sheet, setSheet] = useState<PlanItem | 'new' | null>(null);
  const canEdit = t.can('members_can_edit_plan');
  const items = t.plan.filter((p) => p.date === day).sort((a, b) => a.time.localeCompare(b.time));
  const trains = tk.flatMap((x) => {
    const out: { key: string; time: string; title: string; note: string }[] = [];
    const seats = x.passengers.filter((p) => p.coach || p.seat).map((p) => `${p.name.split(' ')[0]}: ${[p.coach, p.seat].filter(Boolean).join(' ')}`).join(' · ');
    const name = [x.train_no, x.train_name].filter(Boolean).join(' ') || 'Train';
    const d = istDateTime(x.depart_at); if (d.date === day) out.push({ key: x.id + 'd', time: d.time, title: `Train departs · ${name}`, note: `${x.from_station || ''} → ${x.to_station || ''}${seats ? ' · ' + seats : ''}` });
    if (x.arrive_at) { const a = istDateTime(x.arrive_at); if (a.date === day) out.push({ key: x.id + 'a', time: a.time, title: `Train arrives · ${x.to_station || name}`, note: name }); }
    return out;
  }).sort((a, b) => a.time.localeCompare(b.time));
  const dayCost = items.reduce((s, i) => s + i.cost, 0);
  const tripCost = t.plan.reduce((s, i) => s + i.cost, 0);

  return (
    <div className="stack">
      <div className="days">
        {days.map((d, i) => (
          <button key={d} className={`day ${d === day ? 'on' : ''}`} onClick={() => setDay(d)}>
            <small>{fmtDate(d, { weekday: 'short' })}</small><b>{fmtDate(d, { day: 'numeric' })}</b>
            <small>{fmtDate(d, { month: 'short' })}</small>
            <span className={`pip ${t.plan.some((p) => p.date === d) ? 'has' : ''}`} aria-label={`Day ${i + 1}`} />
          </button>
        ))}
      </div>
      <div className="row between" style={{ padding: '0 4px' }}>
        <div><div className="section-title">{fmtDate(day, { weekday: 'long' })}</div><div className="muted small">{items.length + trains.length} plan{items.length + trains.length === 1 ? '' : 's'} · est. {money(dayCost)} for the group</div></div>
        {canEdit && <button className="btn sm primary" onClick={() => setSheet('new')}><Icon n="plus" size={16} /> Add</button>}
      </div>

      {trains.length > 0 && (
        <div className="tl">{trains.map((x) => (
          <div key={x.key} className="tl-item"><div className="tl-time num">{fmtTime12(x.time)}</div>
            <div className="tl-card train"><span style={{ fontSize: 20 }}>🚆</span><div className="grow"><b>{x.title}</b><div className="muted small">{x.note}</div></div></div></div>
        ))}</div>
      )}
      {items.length === 0 && trains.length === 0 ? (
        <div className="glass empty stack-sm"><span style={{ fontSize: 30 }}>🗓️</span>Nothing planned for this day.<br />Add something, or browse Explore and the AI planner.</div>
      ) : (
        <div className="tl">
          {items.map((i) => (
            <div key={i.id} className="tl-item">
              <div className="tl-time num">{fmtTime12(i.time)}</div>
              <div className={`tl-card ${i.done ? 'done' : ''}`}>
                <button className={`check ${i.done ? 'on' : ''}`} aria-label={i.done ? 'Mark not done' : 'Mark done'} onClick={() => canEdit && t.savePlan({ ...i, done: !i.done })}>{i.done && <Icon n="check" size={15} />}</button>
                <button className="grow" style={{ textAlign: 'left' }} onClick={() => canEdit && setSheet(i)}>
                  <b className="tl-title">{CATS[i.category].emoji} {i.title}</b>
                  {i.note && <div className="muted small">{i.note}</div>}
                  {i.cost > 0 && <div className="small" style={{ color: CATS[i.category].color }}>≈ {money(i.cost)}</div>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {tripCost > 0 && <p className="muted small" style={{ textAlign: 'center' }}>Whole-trip plan estimate: {money(tripCost)} · about {money(tripCost / Math.max(1, t.members.length))} each</p>}
      {sheet && <PlanSheet key={sheet === 'new' ? 'new' : sheet.id} initial={sheet === 'new' ? null : sheet} day={day} days={days} onClose={() => setSheet(null)} />}
    </div>
  );
}

function PlanSheet({ initial, day, days, onClose }: { initial: PlanItem | null; day: string; days: string[]; onClose: () => void }) {
  const t = useTrip();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.date ?? day);
  const [time, setTime] = useState(initial?.time ?? '10:00');
  const [cost, setCost] = useState(initial ? String(initial.cost || '') : '');
  const [cat, setCat] = useState<Category>(initial?.category ?? 'adventure');
  const [note, setNote] = useState(initial?.note ?? '');
  return (
    <Sheet open onClose={onClose} title={initial ? 'Edit plan' : 'Add to plan'} actions={
      <>
        {initial && <button className="btn danger" onClick={async () => { await t.deletePlan(initial.id); onClose(); }}><Icon n="trash" size={17} /></button>}
        <button className="btn primary" disabled={!title.trim()} onClick={async () => {
          await t.savePlan({ id: initial?.id ?? uid(), date, time: time || '09:00', title: title.trim(), note: note.trim() || null, cost: Number(cost) || 0, category: cat, done: initial?.done ?? false });
          onClose();
        }}>{initial ? 'Save changes' : 'Add to plan'}</button>
      </>
    }>
      <Field label="What are we doing?"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sunset at Sajjangarh" autoFocus /></Field>
      <div className="two">
        <Field label="Day"><select value={date} onChange={(e) => setDate(e.target.value)}>{days.map((d) => <option key={d} value={d}>{fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}</option>)}</select></Field>
        <Field label="Time"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
      </div>
      <Field label="Estimated cost for the group (₹)"><input inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.replace(/\D/g, ''))} placeholder="0" /></Field>
      <div className="stack-sm"><span className="field-label">Type</span>
        <div className="chips wrap">{CAT_KEYS.map((k) => <button key={k} type="button" className={`chip ${cat === k ? 'on' : ''}`} onClick={() => setCat(k)}>{CATS[k].emoji} {CATS[k].label}</button>)}</div></div>
      <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Book tickets online, carry ID…" /></Field>
    </Sheet>
  );
}

function Explore() {
  const t = useTrip();
  const days = eachDay(t.trip.start_date, t.trip.end_date);
  const [pick, setPick] = useState<Spot | null>(null);
  const [day, setDay] = useState(days[0]);
  const [time, setTime] = useState('16:00');
  const n = Math.max(1, t.members.length);
  return (
    <div className="stack">
      <p className="muted small" style={{ padding: '0 4px' }}>Ideas for Udaipur. Prices are rough per-person estimates; check current rates before you go.</p>
      {SPOTS.map((s) => (
        <article key={s.id} className="glass spot">
          <div className="spot-top"><span className="emoji-tile" style={{ width: 50, height: 50, fontSize: 24 }}>{s.emoji}</span><div className="grow"><h4>{s.name}</h4><p className="muted small">{s.blurb}</p></div></div>
          <div className="kv"><span>{s.pp ? `≈ ${money(s.pp)} / person` : 'Free entry'}</span><span>{s.dur}</span><span>Best: {s.best}</span></div>
          <p className="small muted">💡 {s.tip}</p>
          {t.can('members_can_edit_plan') && <button className="btn sm" onClick={() => { setPick(s); setDay(days[0]); }}><Icon n="plus" size={15} /> Add to plan</button>}
        </article>
      ))}
      <section className="glass pad-lg stack-sm">
        <div className="section-title">Local costs cheat sheet</div>
        {LOCAL_COSTS.map((c) => <div key={c.label} className="row between small" style={{ padding: '6px 0', borderTop: '1px solid rgba(255,255,255,.07)' }}><span className="muted grow">{c.label}</span><b className="num">{c.range}</b></div>)}
      </section>
      <Sheet open={!!pick} onClose={() => setPick(null)} title={pick?.name ?? ''} actions={
        <button className="btn primary" onClick={async () => {
          if (!pick) return;
          await t.savePlan({ id: uid(), date: day, time, title: pick.name, note: pick.tip, cost: pick.pp * n, category: pick.cat, done: false });
          t.notify('Added to your plan'); setPick(null);
        }}>Add to plan</button>
      }>
        <div className="two">
          <Field label="Day"><select value={day} onChange={(e) => setDay(e.target.value)}>{days.map((d) => <option key={d} value={d}>{fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}</option>)}</select></Field>
          <Field label="Time"><input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        </div>
        <p className="muted small">Estimated {money((pick?.pp ?? 0) * n)} for {n} {n === 1 ? 'person' : 'people'}.</p>
      </Sheet>
    </div>
  );
}

type Suggestion = { date: string; time: string; title: string; note?: string; cost?: number; category: Category };
const VIBES = ['Relaxed', 'Adventure', 'Foodie', 'Heritage', 'Photography', 'Nightlife'];

function AiPlanner({ done }: { done: () => void }) {
  const t = useTrip();
  const going = t.tickets.filter((x) => x.direction === 'outbound' && x.arrive_at).sort((a, b) => a.depart_at.localeCompare(b.depart_at))[0];
  const back = t.tickets.filter((x) => x.direction === 'return').sort((a, b) => b.depart_at.localeCompare(a.depart_at))[0];
  const gA = going?.arrive_at ? istDateTime(going.arrive_at) : null, bD = back ? istDateTime(back.depart_at) : null;
  const [arriveDate, setArriveDate] = useState(gA?.date ?? t.trip.start_date);
  const [arriveTime, setArriveTime] = useState(gA?.time ?? '06:00');
  const [leaveDate, setLeaveDate] = useState(bD?.date ?? t.trip.end_date);
  const [leaveTime, setLeaveTime] = useState(bD?.time ?? '20:00');
  const [vibes, setVibes] = useState<string[]>(['Relaxed', 'Foodie']);
  const [extra, setExtra] = useState('');
  const [tweak, setTweak] = useState('');
  const [replace, setReplace] = useState(t.plan.length > 0);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Suggestion[] | null>(null);
  const [err, setErr] = useState('');

  const days = useMemo(() => eachDay(arriveDate, leaveDate < arriveDate ? arriveDate : leaveDate), [arriveDate, leaveDate]);

  async function go(refine: boolean) {
    setBusy(true); setErr('');
    try {
      const r = await api('/api/ai', {
        mode: 'plan', code: t.trip.code, destination: t.trip.destination, days, people: t.members.length, budget: t.trip.budget, vibes, extra,
        arrive: { date: arriveDate, time: arriveTime }, leave: { date: leaveDate, time: leaveTime },
        existing: replace ? [] : t.plan.map((p) => `${p.date} ${p.time} ${p.title}`),
        previous: refine ? res : undefined, tweak: refine ? tweak : undefined,
      });
      const j = await r.json();
      if (!r.ok || !Array.isArray(j.data)) throw new Error(j.error || 'The AI didn’t return a plan. Try again.');
      const clean = (j.data as Suggestion[]).filter((x) => x && x.title && days.includes(x.date)).map((x) => ({ ...x, time: /^\d{1,2}:\d{2}$/.test(x.time) ? x.time.padStart(5, '0') : '10:00', category: CAT_KEYS.includes(x.category) ? x.category : ('adventure' as Category) }));
      if (!clean.length) throw new Error('No usable suggestions came back. Try again.');
      setRes(clean); if (refine) setTweak('');
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="stack">
      <section className="glass pad-lg stack">
        <h2 className="serif big">Plan it with AI</h2>
        <p className="muted">Tell me when your train gets in and when you head back. I’ll fit the days around it, and include the places you want to go.</p>
        {(gA || bD) && <p className="small good">✓ Times filled in from your train tickets.</p>}
        <div className="stack-sm"><b>🚆 Getting there</b>
          <div className="two">
            <Field label="Arrive on"><input type="date" value={arriveDate} onChange={(e) => { setArriveDate(e.target.value); if (leaveDate < e.target.value) setLeaveDate(e.target.value); }} /></Field>
            <Field label="Train arrives at"><input type="time" value={arriveTime} onChange={(e) => setArriveTime(e.target.value)} /></Field>
          </div>
        </div>
        <div className="stack-sm"><b>🚉 Getting back</b>
          <div className="two">
            <Field label="Leave on"><input type="date" min={arriveDate} value={leaveDate} onChange={(e) => setLeaveDate(e.target.value)} /></Field>
            <Field label="Train leaves at"><input type="time" value={leaveTime} onChange={(e) => setLeaveTime(e.target.value)} /></Field>
          </div>
        </div>
        <div className="stack-sm"><span className="field-label">Mood</span>
          <div className="chips wrap">{VIBES.map((v) => <button key={v} className={`chip ${vibes.includes(v) ? 'on' : ''}`} onClick={() => setVibes(vibes.includes(v) ? vibes.filter((x) => x !== v) : [...vibes, v])}>{v}</button>)}</div>
        </div>
        <Field label="Where do you want to go? Anything else?">
          <textarea rows={4} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Kumbhalgarh for a day, sunset at Sajjangarh, one lazy morning, vegetarian food, rooftop dinner on the last night…" />
        </Field>
        <button className="btn primary" disabled={busy} onClick={() => go(false)}><Icon n="sparkle" size={18} /> {busy && !res ? 'Drafting your days…' : res ? 'Start over' : 'Build my itinerary'}</button>
        {err && <p className="bad small">{err}</p>}
      </section>

      {res && (
        <section className="stack">
          <div className="section-title" style={{ padding: '0 4px' }}>Here’s your draft</div>
          {days.map((d) => {
            const list = res.filter((x) => x.date === d).sort((a, b) => a.time.localeCompare(b.time));
            if (!list.length) return null;
            return (
              <div key={d} className="glass pad stack-sm">
                <b>{fmtDate(d, { weekday: 'long', day: 'numeric', month: 'short' })}</b>
                {list.map((x, i) => (
                  <div key={i} className="row small" style={{ alignItems: 'flex-start' }}>
                    <span className="muted num" style={{ width: 62, flex: 'none' }}>{fmtTime12(x.time)}</span>
                    <span className="grow"><b>{CATS[x.category].emoji} {x.title}</b>{x.note && <span className="muted"> · {x.note}</span>}</span>
                    {!!x.cost && <span className="num muted">{money(x.cost)}</span>}
                  </div>
                ))}
              </div>
            );
          })}
          <div className="glass pad stack-sm">
            <Field label="Want changes?"><div className="tweak"><input placeholder="Make day 2 lighter, add Mount Abu…" value={tweak} onChange={(e) => setTweak(e.target.value)} /><button className="btn" disabled={busy || !tweak.trim()} onClick={() => go(true)}>{busy ? '…' : 'Update'}</button></div></Field>
          </div>
          {t.plan.length > 0 && (
            <label className="row" style={{ cursor: 'pointer', padding: '0 4px' }}>
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} style={{ width: 22, height: 22, accentColor: '#ffb36b', flex: 'none' }} />
              <span className="small">Replace the current plan ({t.plan.length} items) with this one</span>
            </label>
          )}
          <button className="btn primary" disabled={busy} onClick={async () => {
            if (replace) await t.clearPlan();
            if (arriveDate !== t.trip.start_date || leaveDate !== t.trip.end_date) await t.updateTrip({ start_date: arriveDate, end_date: leaveDate < arriveDate ? arriveDate : leaveDate });
            await t.savePlans(res.map((x) => ({ id: uid(), date: x.date, time: x.time, title: x.title, note: x.note ?? null, cost: Math.max(0, Number(x.cost) || 0), category: x.category, done: false })));
            t.notify('Itinerary added for everyone'); done();
          }}>Add to the shared plan</button>
        </section>
      )}
    </div>
  );
}
