'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sb, hasSupabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { MEMBER_COLORS, addDays, makeCode, todayISO, uid } from '@/lib/utils';
import { STARTER } from '@/lib/udaipur';
import { Avatar, Field, Icon } from '@/components/ui';
import Setup from '@/components/Setup';
import AuthForm from '@/components/AuthForm';
import Account from '@/components/Account';
import { InstallCard } from '@/components/Install';

type MyTrip = { code: string; name: string; destination: string; start_date: string; end_date: string };

export default function Landing() {
  const a = useAuth();
  if (!hasSupabase) return <Setup />;
  if (a.loading) return <div className="center-screen"><div className="spinner" /></div>;
  return a.user ? <Dashboard /> : <Welcome />;
}

function Welcome() {
  return (
    <main className="landing">
      <div className="stack-sm">
        <span className="badge" style={{ alignSelf: 'flex-start' }}>🪔 Group trips, sorted</span>
        <h1>Wander</h1>
        <p className="muted" style={{ fontSize: 17, maxWidth: 460 }}>Plan the days, split the bills, settle up on UPI, chat, and keep every photo in one shared place. Private to your crew.</p>
      </div>
      <InstallCard />
      <AuthForm start="login" />
      <div className="feature-grid">
        <div className="feature"><b>Private to your crew</b>Only people you invite can open the trip.</div>
        <div className="feature"><b>Split + UPI</b>Fair splits, then pay each other in one tap.</div>
        <div className="feature"><b>Chat, calls, AI</b>Ask @ai for stays, trains and food.</div>
        <div className="feature"><b>Shared photos</b>Everyone uploads, anyone downloads.</div>
      </div>
    </main>
  );
}

function Dashboard() {
  const router = useRouter();
  const a = useAuth();
  const [trips, setTrips] = useState<MyTrip[] | null>(null);
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home');
  const [account, setAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const [name, setName] = useState('Udaipur trip');
  const [dest, setDest] = useState('Udaipur, Rajasthan');
  const [start, setStart] = useState(addDays(todayISO(), 14));
  const [end, setEnd] = useState(addDays(todayISO(), 17));
  const [budget, setBudget] = useState('40000');
  const [friend, setFriend] = useState('');
  const [friends, setFriends] = useState<string[]>([]);
  const [starter, setStarter] = useState(true);
  const [joinCode, setJoinCode] = useState('');

  useEffect(() => {
    if (!a.user) return;
    sb().from('members').select('trips(code,name,destination,start_date,end_date)').eq('user_id', a.user.id).then(({ data }) => {
      const list = ((data ?? []) as unknown as { trips: MyTrip | MyTrip[] | null }[]).map((r) => (Array.isArray(r.trips) ? r.trips[0] : r.trips)).filter(Boolean) as MyTrip[];
      setTrips(list.sort((x, y) => y.start_date.localeCompare(x.start_date)));
    });
  }, [a.user]);

  // Open the nearest trip straight away (upcoming/ongoing first, else the most recent). "All trips" (?all=1) shows the list.
  const showAll = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('all') === '1';
  useEffect(() => {
    if (trips === null || trips.length === 0 || showAll) return;
    const today = todayISO();
    const upcoming = trips.filter((x) => x.end_date >= today).sort((x, y) => x.start_date.localeCompare(y.start_date));
    const pick = upcoming[0] ?? [...trips].sort((x, y) => y.end_date.localeCompare(x.end_date))[0];
    router.replace(`/t/${pick.code}`);
  }, [trips, showAll, router]);

  const addFriend = () => { const f = friend.trim(); if (f) { setFriends([...friends, f]); setFriend(''); } };

  async function create() {
    if (end < start) return setErr('End date is before the start date.');
    setBusy(true); setErr('');
    try {
      const tripId = uid(), code = makeCode();
      const { data, error } = await sb().rpc('create_trip', {
        p_id: tripId, p_code: code, p_name: name.trim() || 'Our trip', p_destination: dest.trim(), p_start: start, p_end: end,
        p_budget: Number(budget) || 0, p_my_name: a.profile?.name ?? 'Me', p_upi: a.profile?.upi_id ?? null, p_friends: friends,
      });
      if (error) throw error;
      if (starter) {
        const n = friends.length + 1;
        const span = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 864e5) + 1);
        const plan = STARTER.map((s) => ({ id: uid(), trip_id: tripId, date: addDays(start, Math.min(s.day, span - 1)), time: s.time, title: s.title, note: s.note ?? null, cost: (s.pp ?? 0) * n + (s.flat ?? 0), category: s.category, done: false }));
        const r = await sb().from('plan_items').insert(plan);
        if (r.error) throw r.error;
      }
      void data; void MEMBER_COLORS;
      router.push(`/t/${code}`);
    } catch (e) { setErr((e as Error).message || 'Something went wrong.'); setBusy(false); }
  }

  function join() {
    const c = joinCode.trim().split('/').filter(Boolean).pop()?.toUpperCase();
    if (!c || c.length < 6) return setErr('Paste the invite link or the 8-letter code.');
    router.push(`/t/${c}`);
  }

  if (trips === null || (trips.length > 0 && !showAll)) return <div className="center-screen"><div className="stack-sm" style={{ textAlign: 'center' }}><div className="spinner" /><span className="muted small">Opening your trip…</span></div></div>;

  return (
    <main className="landing">
      <div className="row between">
        <div className="stack-sm"><span className="muted small">Welcome back</span><h1 style={{ fontSize: 'clamp(38px, 11vw, 60px)' }}>{a.profile?.name?.split(' ')[0] ?? 'Hi'}</h1></div>
        <button onClick={() => setAccount(true)} aria-label="My account"><Avatar m={{ name: a.profile?.name ?? '?', color: '#ffb36b', avatar_path: a.profile?.avatar_path }} size={52} /></button>
      </div>

      {mode === 'home' && (
        <>
          <div className="glass pad stack-sm">
            <div className="section-title" style={{ padding: '2px 4px' }}>Your trips</div>
            {trips === null && <div className="spinner" />}
            {trips?.length === 0 && <p className="muted small" style={{ padding: 4 }}>No trips yet. Start one, or join a friend’s with their invite.</p>}
            {trips?.map((r) => (
              <a key={r.code} className="card-li" href={`/t/${r.code}`}>
                <span className="emoji-tile">🧳</span>
                <span className="grow"><b className="ellipsis" style={{ display: 'block' }}>{r.name}</b><span className="muted small">{r.destination}</span></span>
                <Icon n="arrow" />
              </a>
            ))}
          </div>
          <div className="stack-sm">
            <button className={`btn block ${trips?.length === 0 ? 'primary' : ''}`} style={{ height: 56 }} onClick={() => { setMode('join'); setErr(''); }}><Icon n="link" /> I have an invite link or code</button>
            <button className="btn block" style={{ height: 56 }} onClick={() => { setMode('create'); setErr(''); }}><Icon n="plus" /> Start a new trip</button>
            <p className="tiny faint" style={{ textAlign: 'center' }}>Friends already made a trip? Join it with their link. Only start a new trip if you’re the organizer.</p>
          </div>
        </>
      )}

      {mode === 'join' && (
        <div className="glass pad-lg stack">
          <h2 className="serif big">Join a trip</h2>
          <Field label="Invite link or code"><input placeholder="e.g. K7M2QX9A" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} autoFocus autoCapitalize="characters" /></Field>
          {err && <p className="bad small">{err}</p>}
          <div className="row"><button className="btn" onClick={() => setMode('home')}>Back</button><button className="btn primary grow" onClick={join}>Open trip</button></div>
        </div>
      )}

      {mode === 'create' && (
        <div className="glass pad-lg stack">
          <h2 className="serif big">New trip</h2>
          <p className="muted small">This creates a brand-new trip and makes you its admin. If your friends already have one, go back and use their invite instead.</p>
          <Field label="Trip name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Where to?"><input value={dest} onChange={(e) => setDest(e.target.value)} /></Field>
          <div className="two">
            <Field label="From"><input type="date" value={start} onChange={(e) => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }} /></Field>
            <Field label="To"><input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></Field>
          </div>
          <Field label="Group budget (₹)"><input inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Add friends by name (optional)" hint="They claim their name when they sign up from your invite link.">
            <div className="member-input">
              <input placeholder="Friend’s name" value={friend} onChange={(e) => setFriend(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addFriend()} />
              <button className="btn" onClick={addFriend} type="button">Add</button>
            </div>
          </Field>
          {friends.length > 0 && <div className="row wrap">{friends.map((f, i) => <span key={i} className="tag">{f}<button aria-label={`Remove ${f}`} onClick={() => setFriends(friends.filter((_, j) => j !== i))}><Icon n="x" size={12} /></button></span>)}</div>}
          <label className="row" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={starter} onChange={(e) => setStarter(e.target.checked)} style={{ width: 22, height: 22, accentColor: '#ffb36b', flex: 'none' }} />
            <span>Start with a sample Udaipur itinerary</span>
          </label>
          {err && <p className="bad small">{err}</p>}
          <div className="row"><button className="btn" onClick={() => setMode('home')}>Back</button><button className="btn primary grow" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create trip'}</button></div>
        </div>
      )}
      {account && <Account onClose={() => setAccount(false)} />}
    </main>
  );
}
