'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTrip } from '@/lib/tripData';
import { useAuth } from '@/lib/auth';
import { getSeen, setSeen } from '@/lib/identity';
import { Avatar, Icon } from './ui';
import Account from './Account';
import { NotifyCard } from './Tickets';
import Home, { MemberSheet, TripSettings } from './Home';
import type { Member } from '@/lib/types';
import Plan from './Plan';
import Money from './Money';
import Chat from './Chat';
import Photos from './Photos';
import { CallProvider } from './Call';
import TripMenu from './TripMenu';
import { InstallRow } from './Install';

type Tab = 'home' | 'plan' | 'money' | 'chat' | 'photos';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Trip', icon: 'home' },
  { id: 'plan', label: 'Plan', icon: 'calendar' },
  { id: 'money', label: 'Split', icon: 'wallet' },
  { id: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'photos', label: 'Photos', icon: 'image' },
];

export default function TripApp() {
  const t = useTrip();
  const a = useAuth();
  const [tab, setTab] = useState<Tab>('home');
  const pushed = useRef(false);

  // Tabs live in the URL (?tab=plan) so the phone's back gesture goes to the Trip home, not out of the trip.
  const readTab = (): Tab => { const v = new URLSearchParams(window.location.search).get('tab'); return TABS.some((x) => x.id === v) ? (v as Tab) : 'home'; };
  useEffect(() => {
    setTab(readTab());
    const h = () => { const nt = readTab(); if (nt === 'home') pushed.current = false; setTab(nt); };
    window.addEventListener('popstate', h);
    return () => window.removeEventListener('popstate', h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((next: Tab) => {
    if (next === tab) return;
    const base = window.location.pathname;
    if (next === 'home') {
      if (pushed.current) { pushed.current = false; window.history.back(); } else { window.history.replaceState(null, '', base); setTab('home'); }
      return;
    }
    if (tab === 'home') { window.history.pushState(null, '', `${base}?tab=${next}`); pushed.current = true; }
    else window.history.replaceState(null, '', `${base}?tab=${next}`);
    setTab(next);
  }, [tab]);
  const [account, setAccount] = useState(false);
  const [settings, setSettings] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  // unread chat badge
  const [seen, setSeenState] = useState(0);
  useEffect(() => setSeenState(getSeen(t.trip.id)), [t.trip.id]);
  useEffect(() => {
    if (tab !== 'chat') return;
    const last = t.messages.length ? new Date(t.messages[t.messages.length - 1].created_at).getTime() : Date.now();
    setSeen(t.trip.id, last); setSeenState(last);
  }, [tab, t.messages, t.trip.id]);
  const unread = useMemo(
    () => (tab === 'chat' ? 0 : t.messages.filter((m) => new Date(m.created_at).getTime() > seen && m.member_id !== t.me?.id).length),
    [t.messages, seen, tab, t.me?.id],
  );

  useEffect(() => { window.scrollTo({ top: 0 }); }, [tab]);

  // carry the account's UPI ID / photo over to this trip's crew entry if it's still empty
  useEffect(() => {
    if (!t.me || !a.profile) return;
    const patch: { upi_id?: string; avatar_path?: string } = {};
    if (!t.me.upi_id && a.profile.upi_id) patch.upi_id = a.profile.upi_id;
    if (!t.me.avatar_path && a.profile.avatar_path) patch.avatar_path = a.profile.avatar_path;
    if (Object.keys(patch).length) t.updateMember(t.me.id, patch);
  }, [t.me?.id, t.me?.upi_id, t.me?.avatar_path, a.profile?.upi_id, a.profile?.avatar_path]); // eslint-disable-line react-hooks/exhaustive-deps

  // While the app is open, check every minute for train reminders that are due (the server does the same in the background).
  const hasTickets = t.tickets.length > 0;
  useEffect(() => {
    if (!hasTickets) return;
    const tick = () => { if (!document.hidden) fetch(`/api/cron/reminders?code=${t.trip.code}`).catch(() => {}); };
    tick(); const i = setInterval(tick, 60000);
    return () => clearInterval(i);
  }, [hasTickets, t.trip.code]);

  if (!t.me) {
    return (
      <div className="center-screen"><div className="glass pad-lg stack" style={{ maxWidth: 420, textAlign: 'center' }}>
        <h2 className="serif big">Almost there</h2><p className="muted">Your account isn’t part of this trip yet.</p>
        <a className="btn primary" href={`/t/${t.trip.code}`} onClick={() => location.reload()}>Join the trip</a>
        <button className="small muted" onClick={() => a.signOut()}>Log out</button></div></div>
    );
  }

  return (
    <CallProvider>
      <div className="app">
        <header className="topbar">
          <TripMenu compact={tab === 'home'} />
          <div className="row" style={{ gap: 10 }}>
            <button className="icon-btn" onClick={() => setSettings(true)} aria-label="Trip settings"><Icon n="gear" size={20} /></button>
            <button onClick={() => setAccount(true)} aria-label="My account"><Avatar m={t.me} size={40} /></button>
          </div>
        </header>
        {tab === 'home' && <Home goto={go} />}
        {tab === 'plan' && <Plan />}
        {tab === 'money' && <Money />}
        {tab === 'chat' && <Chat />}
        {tab === 'photos' && <Photos />}
      </div>

      <nav className="nav glass" aria-label="Sections">
        {TABS.map((x) => (
          <button key={x.id} className={tab === x.id ? 'on' : ''} onClick={() => go(x.id)} aria-current={tab === x.id}>
            <Icon n={x.icon} size={21} />{x.label}
            {x.id === 'chat' && unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
          </button>
        ))}
      </nav>
      {settings && <TripSettings onClose={() => setSettings(false)} onEdit={(m) => { setSettings(false); setEditing(m); }} />}
      {editing && <MemberSheet key={editing.id} m={editing} onClose={() => setEditing(null)} />}
      {account && <Account color={t.me.color} onClose={() => setAccount(false)} extra={<><InstallRow /><NotifyCard /></>} />}
      {t.toast && <div className="toast" role="status">{t.toast}</div>}
    </CallProvider>
  );
}
