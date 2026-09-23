'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sb } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { addDays, makeCode, todayISO, uid } from '@/lib/utils';
import { STARTER } from '@/lib/udaipur';
import { Field, Icon, Sheet } from './ui';

/** Create a brand-new trip from anywhere (used by the trip switcher). */
export default function NewTrip({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const a = useAuth();
  const [name, setName] = useState('');
  const [dest, setDest] = useState('');
  const [start, setStart] = useState(addDays(todayISO(), 14));
  const [end, setEnd] = useState(addDays(todayISO(), 17));
  const [budget, setBudget] = useState('');
  const [friend, setFriend] = useState('');
  const [friends, setFriends] = useState<string[]>([]);
  const [starter, setStarter] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const addFriend = () => { const f = friend.trim(); if (f) { setFriends([...friends, f]); setFriend(''); } };

  async function create() {
    if (!name.trim()) return setErr('Give the trip a name.');
    if (end < start) return setErr('End date is before the start date.');
    setBusy(true); setErr('');
    try {
      const tripId = uid(), code = makeCode();
      const { error } = await sb().rpc('create_trip', { p_id: tripId, p_code: code, p_name: name.trim(), p_destination: dest.trim(), p_start: start, p_end: end, p_budget: Number(budget) || 0, p_my_name: a.profile?.name ?? 'Me', p_upi: a.profile?.upi_id ?? null, p_friends: friends });
      if (error) throw error;
      if (starter) {
        const n = friends.length + 1;
        const span = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 864e5) + 1);
        await sb().from('plan_items').insert(STARTER.map((s) => ({ id: uid(), trip_id: tripId, date: addDays(start, Math.min(s.day, span - 1)), time: s.time, title: s.title, note: s.note ?? null, cost: (s.pp ?? 0) * n + (s.flat ?? 0), category: s.category, done: false })));
      }
      window.location.href = `/t/${code}`;
      void router;
    } catch (e) { setErr((e as Error).message || 'Something went wrong.'); setBusy(false); }
  }

  return (
    <Sheet open onClose={onClose} title="New trip" actions={<button className="btn primary" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create trip'}</button>}>
      <p className="muted small">This creates a separate trip and makes you its admin. You’ll get a new invite code to share.</p>
      <Field label="Trip name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Goa in March" autoFocus /></Field>
      <Field label="Where to?"><input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="City, State" /></Field>
      <div className="two">
        <Field label="From"><input type="date" value={start} onChange={(e) => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }} /></Field>
        <Field label="To"><input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <Field label="Group budget (₹)"><input inputMode="numeric" value={budget} placeholder="e.g. 40000" onChange={(e) => setBudget(e.target.value.replace(/\D/g, ''))} /></Field>
      <Field label="Add friends by name (optional)" hint="They pick their name when they join from your invite link.">
        <div className="member-input"><input placeholder="Friend’s name" value={friend} onChange={(e) => setFriend(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addFriend()} /><button className="btn" onClick={addFriend} type="button">Add</button></div>
      </Field>
      {friends.length > 0 && <div className="row wrap">{friends.map((f, i) => <span key={i} className="tag">{f}<button aria-label={`Remove ${f}`} onClick={() => setFriends(friends.filter((_, j) => j !== i))}><Icon n="x" size={12} /></button></span>)}</div>}
      <label className="row" style={{ cursor: 'pointer' }}><input type="checkbox" checked={starter} onChange={(e) => setStarter(e.target.checked)} /><span className="small">Start with a sample Udaipur itinerary</span></label>
      {err && <p className="bad small">{err}</p>}
    </Sheet>
  );
}
