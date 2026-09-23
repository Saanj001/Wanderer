'use client';
import { useEffect, useState } from 'react';
import { useTrip } from '@/lib/tripData';
import { sb } from '@/lib/supabase';
import type { Member, PermKey } from '@/lib/types';
import { Avatar } from './ui';
import { disablePush, enablePush, isIos, isStandalone, pushEnabled, pushSupported } from '@/lib/push';

export const ACCESS: { k: PermKey; label: string; icon: string; hint: string }[] = [
  { k: 'members_can_edit_plan', label: 'Edit plan & tickets', icon: '🗓️', hint: 'Itinerary and train tickets' },
  { k: 'members_can_add_expenses', label: 'Add expenses', icon: '💸', hint: 'Log bills and split them' },
  { k: 'members_can_add_members', label: 'Add people', icon: '👥', hint: 'Add friends by name' },
  { k: 'members_can_upload_photos', label: 'Upload photos', icon: '📸', hint: 'Share to the gallery' },
  { k: 'members_can_use_ai', label: 'Use AI', icon: '✨', hint: 'Planner, @ai, ticket & bill reading' },
  { k: 'members_can_assign_tasks', label: 'Assign tasks', icon: '✅', hint: 'Who brings what' },
  { k: 'members_can_announce', label: 'Send announcements', icon: '📣', hint: 'Notify everyone at once' },
  { k: 'gets_notifications', label: 'Receives notifications', icon: '🔔', hint: 'Chat, calls and train reminders' },
];

/** Multi-select people, then allow / block things for all of them at once (or just one person). */
export function AccessPanel() {
  const t = useTrip();
  const [sel, setSel] = useState<string[]>([]);
  const [bells, setBells] = useState<Set<string>>(new Set());
  const people = t.members;
  const eff = (m: Member, k: PermKey) => m.role === 'admin' || (m.perms?.[k] ?? t.trip.settings?.[k] ?? (k === 'members_can_upload_photos' || k === 'gets_notifications')) === true;
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const editable = people.filter((m) => m.id !== t.adminId);
  const picked = sel.filter((id) => editable.some((m) => m.id === id));

  useEffect(() => {
    sb().from('push_subscriptions').select('member_id').eq('trip_id', t.trip.id).then(({ data }) => setBells(new Set((data ?? []).map((r: { member_id: string | null }) => r.member_id ?? ''))));
  }, [t.trip.id]);

  return (
    <>
      <div className="stack-sm">
        <div className="row between"><span className="field-label">1 · Choose people</span>
          <span className="row" style={{ gap: 12 }}>
            <button className="small muted" onClick={() => setSel(editable.map((m) => m.id))}>Everyone</button>
            <button className="small muted" onClick={() => setSel(editable.filter((m) => m.role !== 'admin').map((m) => m.id))}>Non-admins</button>
            <button className="small muted" onClick={() => setSel([])}>Clear</button>
          </span></div>
        <div className="chips wrap">
          {editable.map((m) => (
            <button key={m.id} className={`chip ${sel.includes(m.id) ? 'on' : ''}`} onClick={() => toggle(m.id)}>
              <Avatar m={m} size={20} /> {m.name}{m.role === 'admin' ? ' · admin' : ''}
            </button>
          ))}
        </div>
        <p className="tiny faint">The trip creator always has full access, so they aren’t listed.</p>
      </div>

      <div className="stack-sm">
        <span className="field-label">2 · Allow or block for {picked.length ? `${picked.length} selected` : 'the people you picked'}</span>
        {ACCESS.map((p) => (
          <div key={p.k} className="card-li">
            <span style={{ fontSize: 20 }}>{p.icon}</span>
            <span className="grow"><b>{p.label}</b><div className="muted small">{p.hint}</div></span>
            <button className="btn sm primary" disabled={!picked.length} onClick={() => t.bulkAccess(picked, { [p.k]: true })}>Allow</button>
            <button className="btn sm" disabled={!picked.length} onClick={() => t.bulkAccess(picked, { [p.k]: false })}>Block</button>
          </div>
        ))}
        <div className="card-li">
          <span style={{ fontSize: 20 }}>🛡️</span>
          <span className="grow"><b>Admin</b><div className="muted small">Full control like you</div></span>
          <button className="btn sm primary" disabled={!picked.length} onClick={() => t.bulkAccess(picked, { role: 'admin' })}>Make</button>
          <button className="btn sm" disabled={!picked.length} onClick={() => t.bulkAccess(picked, { role: 'member' })}>Remove</button>
        </div>
      </div>

      <div className="stack-sm">
        <span className="field-label">Who can do what right now</span>
        <div className="matrix">
          <div className="mx-row mx-head"><span className="mx-name" />{ACCESS.map((p) => <span key={p.k} title={p.label}>{p.icon}</span>)}</div>
          {people.map((m) => (
            <div key={m.id} className="mx-row">
              <span className="mx-name ellipsis">{m.name}{m.role === 'admin' ? ' 🛡️' : ''}{t.members.length && m.user_id ? (bells.has(m.id) ? '' : ' 🔕') : ''}</span>
              {ACCESS.map((p) => <span key={p.k} className={eff(m, p.k) ? 'yes' : 'no'}>{eff(m, p.k) ? '✓' : '–'}</span>)}
            </div>
          ))}
        </div>
        <p className="tiny faint">🔕 = hasn’t turned notifications on for their phone yet. Ask them to tap the bell on their Trip tab. Only they can switch it on.</p>
      </div>
    </>
  );
}

/** This phone's notifications: on/off for the signed-in person. */
export function NotifyToggle() {
  const t = useTrip();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushEnabled().then(setOn); }, []);
  const blocked = !t.can('gets_notifications');
  const needsInstall = isIos() && !isStandalone();

  async function change(next: boolean) {
    setBusy(true);
    if (next) {
      const r = await enablePush(t.trip.id, t.me?.id ?? null);
      if (r === 'ok') { setOn(true); t.notify('Notifications on 🔔'); }
      else if (r === 'denied') t.notify('Notifications are blocked in your phone’s site settings.');
      else if (r === 'nokey') t.notify('Notifications aren’t set up on the server yet.');
      else t.notify('Couldn’t turn them on. Try again.');
    } else {
      const ok = await disablePush();
      if (ok) { setOn(false); t.notify('Notifications off for this phone 🔕'); }
    }
    setBusy(false);
  }

  return (
    <div className="stack-sm">
      <label className="card-li" style={{ cursor: 'pointer' }}>
        <span style={{ fontSize: 22 }}>{on ? '🔔' : '🔕'}</span>
        <span className="grow"><b>Notifications on this phone</b>
          <div className="muted small">{blocked ? 'The admin has turned notifications off for you.' : needsInstall ? 'On iPhone: tap Share → Add to Home Screen first, then open Wander from there.' : !pushSupported() ? 'This browser can’t show notifications.' : 'Chat messages, calls and train reminders.'}</div></span>
        <input type="checkbox" checked={!!on} disabled={busy || blocked || needsInstall || !pushSupported() || on === null} onChange={(e) => change(e.target.checked)} />
      </label>
    </div>
  );
}

/** What the signed-in (non-admin) person can currently do. */
export function MyPermissions() {
  const t = useTrip();
  return (
    <div className="stack-sm">
      <span className="field-label">What you can do in this trip</span>
      {ACCESS.filter((p) => p.k !== 'gets_notifications').map((p) => {
        const ok = t.can(p.k);
        return (
          <div key={p.k} className="card-li">
            <span style={{ fontSize: 20 }}>{p.icon}</span>
            <span className="grow"><b>{p.label}</b><div className="muted small">{p.hint}</div></span>
            <span className={`badge ${ok ? 'good' : ''}`}>{ok ? 'Allowed' : 'Not allowed'}</span>
          </div>
        );
      })}
      <p className="tiny faint">You can always see the crew, chat, and edit your own details and photos. Ask {t.member(t.adminId)?.name ?? 'the admin'} if you need more access.</p>
    </div>
  );
}
