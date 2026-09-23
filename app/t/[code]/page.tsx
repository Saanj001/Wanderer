'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { TripProvider } from '@/lib/tripData';
import { hasSupabase, sb } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import TripApp from '@/components/TripApp';
import Setup from '@/components/Setup';
import AuthForm from '@/components/AuthForm';
import { Icon } from '@/components/ui';
import { InstallCard } from '@/components/Install';

type Preview = { id: string; name: string; destination: string; start_date: string; end_date: string; crew_count: number; unclaimed: { id: string; name: string; color: string }[] };

export default function TripPage() {
  const { code } = useParams<{ code: string }>();
  const a = useAuth();
  const [state, setState] = useState<'checking' | 'member' | 'join' | 'notfound'>('checking');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!hasSupabase || a.loading) return;
    let alive = true;
    (async () => {
      const { data: pv } = await sb().rpc('trip_preview', { p_code: code });
      if (!alive) return;
      setPreview((pv as Preview) ?? null);
      if (!pv) return setState('notfound');
      if (!a.user) return setState('join');
      const { data: t } = await sb().from('trips').select('id').eq('code', code.toUpperCase()).maybeSingle();
      if (!alive) return;
      setState(t ? 'member' : 'join');
    })();
    return () => { alive = false; };
  }, [code, a.loading, a.user]);

  if (!hasSupabase) return <Setup />;
  if (a.loading || state === 'checking') return <div className="center-screen"><div className="spinner" /></div>;
  if (state === 'notfound') return (
    <div className="center-screen"><div className="glass pad-lg stack" style={{ maxWidth: 420, textAlign: 'center' }}>
      <h2 className="serif big">Trip not found</h2><p className="muted">Check the invite code or link and try again.</p><a className="btn primary" href="/">Back home</a></div></div>
  );
  if (state === 'member' && a.user) return <TripProvider code={code}><TripApp /></TripProvider>;

  async function join(memberId: string | null) {
    setBusy(true); setErr('');
    const { error } = await sb().rpc('join_trip', { p_code: code, p_member: memberId, p_name: memberId ? null : newName || a.profile?.name, p_upi: a.profile?.upi_id ?? null });
    if (error) { setErr(error.message); setBusy(false); return; }
    setState('member');
  }

  return (
    <main className="landing">
      <div className="stack-sm">
        <span className="badge" style={{ alignSelf: 'flex-start' }}>🧳 You’re invited</span>
        <h1 style={{ fontSize: 'clamp(42px, 12vw, 68px)' }}>{preview?.name}</h1>
        <p className="muted">{preview?.destination} · {preview?.crew_count} {preview?.crew_count === 1 ? 'person' : 'people'} so far</p>
      </div>
      {!a.user ? (
        <>
          <p className="muted small">Create an account (or log in) to join. Only people in the trip can see it.</p>
          <AuthForm start="signup" />
          <InstallCard />
        </>
      ) : (
        <>
          <div className="glass pad stack-sm">
            <div className="section-title" style={{ padding: '2px 4px' }}>Which one are you?</div>
            {(preview?.unclaimed?.length ?? 0) === 0 && <p className="muted small" style={{ padding: 4 }}>Everyone on the list has already joined.</p>}
            {preview?.unclaimed.map((m) => (
              <button key={m.id} className="card-li" disabled={busy} onClick={() => join(m.id)}>
                <span className="avatar" style={{ width: 34, height: 34, background: m.color }}>{m.name[0]?.toUpperCase()}</span><b className="grow">{m.name}</b><Icon n="arrow" />
              </button>
            ))}
          </div>
          <div className="glass pad stack">
            <div className="section-title">I’m not on the list</div>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={a.profile?.name ?? 'Your name'} />
            <button className="btn primary" disabled={busy} onClick={() => join(null)}>Join as new</button>
          </div>
          {err && <p className="bad small">{err}</p>}
          <button className="small muted" onClick={() => a.signOut()}>Not you? Log out</button>
        </>
      )}
    </main>
  );
}
