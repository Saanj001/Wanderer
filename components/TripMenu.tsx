'use client';
import { useEffect, useState } from 'react';
import { sb } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useTrip } from '@/lib/tripData';
import { fmtRange, todayISO } from '@/lib/utils';
import { Icon, Sheet } from './ui';
import NewTrip from './NewTrip';

type MyTrip = { code: string; name: string; destination: string; start_date: string; end_date: string };

/** Header trip switcher: a tidy sheet with your trips, join-by-code and new trip. */
export default function TripMenu({ compact = false }: { compact?: boolean }) {
  const t = useTrip();
  const a = useAuth();
  const [open, setOpen] = useState(false);
  const [trips, setTrips] = useState<MyTrip[] | null>(null);
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open || !a.user) return;
    sb().from('members').select('trips(code,name,destination,start_date,end_date)').eq('user_id', a.user.id).then(({ data }) => {
      const list = ((data ?? []) as unknown as { trips: MyTrip | MyTrip[] | null }[]).map((r) => (Array.isArray(r.trips) ? r.trips[0] : r.trips)).filter(Boolean) as MyTrip[];
      setTrips(list.sort((x, y) => y.start_date.localeCompare(x.start_date)));
    });
  }, [open, a.user]);

  function join() {
    const c = code.trim().split('/').filter(Boolean).pop()?.toUpperCase();
    if (!c || c.length < 6) return setErr('Paste an invite link or the 8-letter code.');
    window.location.href = `/t/${c}`;
  }
  const today = todayISO();
  const status = (x: MyTrip) => (x.end_date < today ? 'Finished' : x.start_date <= today ? 'Happening now' : 'Upcoming');

  return (
    <>
      {compact ? (
        <button className="btn sm" onClick={() => setOpen(true)} aria-label="Switch trip">🧳 My trips <Icon n="chevron" size={16} /></button>
      ) : (
        <button className="trip-pill" onClick={() => setOpen(true)} aria-label="Switch trip">
          <span className="ellipsis">{t.trip.name}</span><Icon n="chevron" size={18} />
        </button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Your trips">
        {trips === null ? <div className="spinner" /> : trips.map((x) => (
          <a key={x.code} className={`trip-card ${x.code === t.trip.code ? 'on' : ''}`} href={`/t/${x.code}`} onClick={(e) => { if (x.code === t.trip.code) { e.preventDefault(); setOpen(false); } }}>
            <span className="tc-accent" />
            <span className="grow" style={{ minWidth: 0 }}>
              <b className="tc-name ellipsis">{x.name}</b>
              <span className="muted small ellipsis" style={{ display: 'block' }}>{x.destination}{x.destination ? ' · ' : ''}{fmtRange(x.start_date, x.end_date)}</span>
            </span>
            <span className={`badge ${x.code === t.trip.code ? 'good' : ''}`}>{x.code === t.trip.code ? 'Current' : status(x)}</span>
          </a>
        ))}
        <div className="two" style={{ marginTop: 4 }}>
          <button className="btn" onClick={() => { setOpen(false); setCreating(true); }}><Icon n="plus" size={18} /> New trip</button>
          <button className={`btn ${joining ? 'primary' : ''}`} onClick={() => { setJoining(!joining); setErr(''); }}><Icon n="link" size={18} /> Join with code</button>
        </div>
        {joining && (
          <div className="stack-sm">
            <div className="row"><input placeholder="Invite link or 8-letter code" value={code} autoFocus autoCapitalize="characters" onChange={(e) => { setCode(e.target.value); setErr(''); }} onKeyDown={(e) => e.key === 'Enter' && join()} />
              <button className="btn primary" disabled={!code.trim()} onClick={join}>Go</button></div>
            {err && <p className="bad small">{err}</p>}
          </div>
        )}
      </Sheet>
      {creating && <NewTrip onClose={() => setCreating(false)} />}
    </>
  );
}
