'use client';
import { useEffect, useMemo, useState } from 'react';
import { useTrip } from '@/lib/tripData';
import { CATS, CAT_KEYS, balances, eachDay, fmtDate, fmtRange, fmtTime12, money, parseISO, todayISO, validUpi } from '@/lib/utils';
import type { Member, PermKey } from '@/lib/types';
import { Avatar, Field, Icon, Segmented, Sheet } from './ui';
import { Bars, Diverge, Donut } from './Charts';
import { InstallCard } from './Install';
import { NextUp, NotifyCard } from './Tickets';
import Account from './Account';
import { ACCESS, AccessPanel, MyPermissions, NotifyToggle } from './Access';
import { api } from '@/lib/api';
import { sb } from '@/lib/supabase';

export const PERMS: { k: PermKey; label: string; hint: string }[] = [
  { k: 'members_can_edit_plan', label: 'Edit the itinerary & tickets', hint: 'Add or change plans and tickets' },
  { k: 'members_can_add_expenses', label: 'Add expenses', hint: 'Log bills and split them' },
  { k: 'members_can_add_members', label: 'Add people to the trip', hint: 'Add friends by name' },
  { k: 'members_can_upload_photos', label: 'Upload photos', hint: 'Share to the trip gallery' },
  { k: 'members_can_use_ai', label: 'Use AI', hint: 'Planner, @ai chat, ticket & bill reading' },
];

export default function Home({ goto }: { goto: (t: 'plan' | 'money' | 'chat' | 'photos') => void }) {
  const t = useTrip();
  const { trip, members, expenses, plan } = t;
  const [editing, setEditing] = useState<Member | null>(null);
  const [adding, setAdding] = useState('');
  const [account, setAccount] = useState(false);

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const pct = trip.budget > 0 ? total / trip.budget : 0;
  const byCat = useMemo(() => {
    const m: Record<string, number> = {};
    expenses.forEach((e) => (m[e.category] = (m[e.category] ?? 0) + e.amount));
    return CAT_KEYS.map((k) => ({ label: CATS[k].label, key: k, value: m[k] ?? 0, color: CATS[k].color })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  }, [expenses]);
  const net = balances(members, expenses, t.payments);

  const today = todayISO();
  const days = Math.round((parseISO(trip.start_date).getTime() - parseISO(today).getTime()) / 864e5);
  const dur = Math.round((parseISO(trip.end_date).getTime() - parseISO(trip.start_date).getTime()) / 864e5) + 1;
  const when = days > 0 ? `${days} day${days > 1 ? 's' : ''} to go` : today <= trip.end_date ? `Day ${1 - days} of ${dur}` : 'Trip complete';

  // daily spending across the trip
  const tripDays = useMemo(() => eachDay(trip.start_date, trip.end_date).slice(0, 14), [trip.start_date, trip.end_date]);
  const daily = tripDays.map((d) => ({ key: d, label: String(parseISO(d).getDate()), value: expenses.filter((e) => e.date === d).reduce((s, e) => s + e.amount, 0) }));
  const outside = expenses.filter((e) => !tripDays.includes(e.date)).reduce((s, e) => s + e.amount, 0);

  // spending pace / forecast
  const planLeft = plan.filter((p) => !p.done).reduce((s, p) => s + p.cost, 0);
  const started = days <= 0 && today <= trip.end_date;
  const dayNo = Math.min(dur, Math.max(1, 1 - days));
  const forecast = started && total > 0 ? Math.round((total / dayNo) * dur) : total + planLeft;
  const overBudget = trip.budget > 0 && forecast > trip.budget;

  // what's coming up
  const upcoming = useMemo(() => [...plan].filter((p) => !p.done && p.date >= (today > trip.start_date ? today : trip.start_date)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 4), [plan, today, trip.start_date]);
  const planDone = plan.filter((p) => p.done).length;

  const link = typeof window !== 'undefined' ? `${location.origin}/t/${trip.code}` : '';
  async function share() {
    const text = `Join our ${trip.name} on Wander: plan, split expenses, chat and share photos. Tip: install it as an app from the link (Add to Home Screen).`;
    try { if (navigator.share) { await navigator.share({ title: trip.name, text, url: link }); return; } } catch { return; }
    await navigator.clipboard.writeText(`${text}\n${link}`);
    t.notify('Invite link copied');
  }
  const canEdit = (m: Member) => t.isAdmin || m.id === t.me?.id;
  const editMember = (m: Member) => (m.id === t.me?.id ? setAccount(true) : setEditing(m));
  const waiting = members.filter((m) => !m.user_id).length;

  return (
    <div className="stack">
      <NotifyCard compact />

      <section className="glass hero">
        <div className="row wrap" style={{ marginBottom: 12 }}><span className="badge">📍 {trip.destination || 'Somewhere nice'}</span><span className="badge">{when}</span></div>
        <h1>{trip.name}</h1>
        <p className="hero-sub">{fmtRange(trip.start_date, trip.end_date)} · {members.length} {members.length === 1 ? 'traveller' : 'travellers'}</p>
        <div className="hero-foot">
          <div className="row" style={{ gap: 8, minWidth: 0 }}>
            <div className="avatars">{members.slice(0, 4).map((m) => <Avatar key={m.id} m={m} size={30} />)}</div>
            {members.length > 4 && <span className="muted small">+{members.length - 4}</span>}
          </div>
          <button className="btn primary sm invite-btn" onClick={share}><Icon n="share" size={16} /> Invite friends</button>
        </div>
        <button className="code-chip" onClick={async () => { await navigator.clipboard.writeText(trip.code); t.notify('Invite code copied'); }}>Code <b>{trip.code}</b> <Icon n="copy" size={14} /></button>
      </section>

      {t.tasks.some((x) => x.assignee_id === t.me?.id && !x.done) && (
        <section className="glass pad stack-sm">
          <div className="row between"><div className="section-title">Your tasks</div><button className="small muted" onClick={() => { try { sessionStorage.setItem('wander.planview', 'tasks'); } catch {} goto('plan'); }}>All tasks →</button></div>
          {t.tasks.filter((x) => x.assignee_id === t.me?.id && !x.done).slice(0, 4).map((x) => (
            <div key={x.id} className="card-li" style={{ padding: '10px 12px' }}><button className="check" aria-label="Mark done" onClick={() => t.toggleTask(x.id)} /><span className="grow">{x.title}</span></div>
          ))}
        </section>
      )}

      <NextUp open={() => { try { sessionStorage.setItem('wander.planview', 'tickets'); } catch {} goto('plan'); }} />

      <div className="stat-grid">
        <button className="glass stat" onClick={() => goto('plan')}><span className="muted small">⏳ Countdown</span><b>{days > 0 ? days : started ? dayNo : '✓'}</b><span className="muted tiny">{days > 0 ? 'days to go' : started ? `of ${dur} days` : 'trip done'}</span></button>
        <button className="glass stat" onClick={() => goto('plan')}><span className="muted small">🗓️ Plans</span><b>{planDone}/{plan.length}</b><span className="muted tiny">done · ≈ {money(plan.reduce((s, p) => s + p.cost, 0))}</span></button>
        <button className="glass stat" onClick={() => goto('money')}><span className="muted small">💸 Spent</span><b className="num">{money(total)}</b><span className="muted tiny">{members.length ? `${money(total / members.length)} each` : ''}</span></button>
        <button className="glass stat" onClick={() => goto('money')}><span className="muted small">{trip.budget > 0 ? '🎯 Budget left' : '🎯 Budget'}</span><b className={`num ${overBudget || pct > 1 ? 'bad' : ''}`}>{trip.budget > 0 ? money(Math.max(0, trip.budget - total)) : '–'}</b><span className="muted tiny">{trip.budget > 0 ? `of ${money(trip.budget)}` : 'set it in ⚙️'}</span></button>
      </div>

      <section className="glass pad-lg stack">
        <div className="section-title">Where the money goes</div>
        {byCat.length === 0 ? (
          <p className="muted small">No expenses yet. Add the first one in Split and your chart appears here.</p>
        ) : (
          <div className="row" style={{ gap: 18, alignItems: 'center' }}>
            <Donut data={byCat} size={136}><div><div className="tiny muted">Total</div><b className="num" style={{ fontSize: 17 }}>{money(total)}</b></div></Donut>
            <div className="legend">{byCat.slice(0, 5).map((c) => <div key={c.key}><i style={{ background: c.color }} /><span className="grow ellipsis">{c.label}</span><span className="num muted">{Math.round((c.value / total) * 100)}%</span></div>)}</div>
          </div>
        )}
        {trip.budget > 0 && (
          <div className="stack-sm">
            <div className="bar"><i style={{ width: `${Math.min(100, pct * 100)}%`, background: pct > 1 ? 'linear-gradient(90deg,#ff5e5e,#ff9a5e)' : 'var(--grad)' }} /></div>
            <div className="row between tiny muted"><span>{Math.round(pct * 100)}% of budget used</span><span>{money(trip.budget)}</span></div>
          </div>
        )}
        {(total > 0 || planLeft > 0) && (
          <div className={`inner pad small ${overBudget ? 'bad' : ''}`}>
            {overBudget ? '⚠️ ' : '📈 '}
            {started && total > 0 ? `At this pace you’ll spend about ${money(forecast)} by the end` : `Spent plus planned activities comes to about ${money(forecast)}`}
            {trip.budget > 0 && (overBudget ? `, ${money(forecast - trip.budget)} over budget.` : `, within budget.`)}
          </div>
        )}
      </section>

      {total > 0 && (
        <section className="glass pad-lg stack">
          <div className="section-title">Spending by day</div>
          <Bars data={daily} highlight={today} format={(n) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : String(Math.round(n)))} />
          {outside > 0 && <p className="tiny muted">Plus {money(outside)} spent outside the trip dates.</p>}
        </section>
      )}

      {expenses.length > 0 && (
        <section className="glass pad-lg stack">
          <div className="row between"><div className="section-title">Who’s owed</div><button className="small muted" onClick={() => goto('money')}>Settle up →</button></div>
          <Diverge rows={members.map((m) => ({ name: m.name.split(' ')[0], value: net[m.id] ?? 0 }))} format={(n) => money(n)} />
        </section>
      )}

      <section className="glass pad-lg stack-sm">
        <div className="row between"><div className="section-title">Coming up</div><button className="small muted" onClick={() => goto('plan')}>Full plan →</button></div>
        {upcoming.length === 0 ? <p className="muted small">Nothing planned yet. Open Plan to add things, or let the AI draft your days.</p> : upcoming.map((p) => (
          <div key={p.id} className="soon">
            <span className="when num">{fmtDate(p.date, { day: 'numeric', month: 'short' })}<br /><span className="tiny muted">{fmtTime12(p.time)}</span></span>
            <span className="grow"><b>{CATS[p.category].emoji} {p.title}</b>{p.cost > 0 && <div className="muted tiny">≈ {money(p.cost)}</div>}</span>
          </div>
        ))}
      </section>

      <div className="two">
        <button className="glass pad stack-sm" style={{ textAlign: 'left' }} onClick={() => goto('chat')}><span style={{ fontSize: 24 }}>💬</span><b>Chat & calls</b><span className="muted small">{t.messages.length} messages</span></button>
        <button className="glass pad stack-sm" style={{ textAlign: 'left' }} onClick={() => goto('photos')}><span style={{ fontSize: 24 }}>📸</span><b>Photos & reels</b><span className="muted small">{t.photos.length} shared</span></button>
      </div>

      <InstallCard />

      <section className="glass pad">
        <div className="row between" style={{ padding: '4px 6px 8px' }}>
          <div className="section-title">Crew</div>
          {waiting > 0 && <span className="badge">{waiting} yet to join</span>}
        </div>
        {members.map((m) => {
          const b = net[m.id] ?? 0;
          return (
            <div key={m.id} className="member-row">
              <Avatar m={m} size={40} />
              <div className="grow">
                <b>{m.name}{m.id === t.me?.id && <span className="muted small"> · you</span>}{m.id === t.adminId && <span className="badge" style={{ marginLeft: 6, padding: '2px 8px', fontSize: 11 }}>Admin</span>}</b>
                <div className="tiny muted ellipsis">{m.user_id ? (m.upi_id ? `UPI: ${m.upi_id}` : 'No UPI ID yet') : 'Waiting to join with the invite link'}</div>
              </div>
              <span className={`num small ${b > 0.5 ? 'good' : b < -0.5 ? 'bad' : 'muted'}`}>{b > 0.5 ? `gets ${money(b)}` : b < -0.5 ? `owes ${money(-b)}` : 'settled'}</span>
              {canEdit(m) && <button className="icon-btn sm" aria-label={`Edit ${m.name}`} onClick={() => editMember(m)}><Icon n="edit" size={15} /></button>}
            </div>
          );
        })}
        {t.can('members_can_add_members') && (
          <div className="stack-sm" style={{ padding: '10px 4px 4px' }}>
            <div className="row">
              <input placeholder="Add a friend by name" value={adding} onChange={(e) => setAdding(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && adding.trim()) { t.addMember(adding); setAdding(''); } }} />
              <button className="btn" disabled={!adding.trim()} onClick={() => { t.addMember(adding); setAdding(''); }}>Add</button>
            </div>
            <p className="tiny faint">This holds a spot for them, so you can already split expenses with them. When they open your invite link and sign up, they pick their name from the list and take over that spot.</p>
          </div>
        )}
      </section>

      {account && t.me && <Account color={t.me.color} onClose={() => setAccount(false)} />}
      {editing && <MemberSheet key={editing.id} m={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function TripSettings({ onClose, onEdit }: { onClose: () => void; onEdit: (m: Member) => void }) {
  const t = useTrip();
  const { trip } = t;
  const [tab, setTab] = useState<'details' | 'perms'>('details');
  const [name, setName] = useState(trip.name);
  const [dest, setDest] = useState(trip.destination);
  const [s, setS] = useState(trip.start_date);
  const [e, setE] = useState(trip.end_date);
  const [b, setB] = useState(String(trip.budget || ''));
  const locked = !t.isAdmin;
  return (
    <Sheet open onClose={onClose} title="Trip settings" actions={tab === 'details' && !locked ? (
      <button className="btn primary" onClick={async () => { await t.updateTrip({ name: name.trim() || trip.name, destination: dest.trim(), start_date: s, end_date: e < s ? s : e, budget: Number(b) || 0 }); onClose(); }}>Save changes</button>
    ) : undefined}>
      <Segmented<'details' | 'perms'> value={tab} onChange={setTab} options={[{ v: 'details', label: 'Trip details' }, { v: 'perms', label: 'Permissions' }]} />

      {tab === 'details' && (
        <>
          {!trip.admin_member_id && (
            <div className="inner pad stack-sm"><b>No admin yet</b><span className="muted small">The person who created this trip should be admin.</span>
              <button className="btn sm primary" onClick={t.becomeAdmin}>I created this trip, make me admin</button></div>
          )}
          {locked && trip.admin_member_id && <p className="muted small"><Icon n="lock" size={14} /> Only admins can change trip details.</p>}
          <Field label="Trip name"><input value={name} disabled={locked} onChange={(x) => setName(x.target.value)} /></Field>
          <Field label="Destination"><input value={dest} disabled={locked} onChange={(x) => setDest(x.target.value)} /></Field>
          <div className="two">
            <Field label="From"><input type="date" value={s} disabled={locked} onChange={(x) => setS(x.target.value)} /></Field>
            <Field label="To"><input type="date" value={e} min={s} disabled={locked} onChange={(x) => setE(x.target.value)} /></Field>
          </div>
          <Field label="Group budget (₹)"><input inputMode="numeric" placeholder="e.g. 40000" value={b} disabled={locked} onChange={(x) => setB(x.target.value.replace(/\D/g, ''))} /></Field>
          {t.isAdmin && (
            <button className="btn danger" onClick={async () => { if (confirm(`Delete “${trip.name}” for everyone? Expenses, chat, tickets and plans will be lost.`) && window.prompt('Type DELETE to confirm') === 'DELETE') { if (await t.deleteTrip()) location.href = '/'; } }}><Icon n="trash" size={16} /> Delete this trip</button>
          )}
        </>
      )}

      {tab === 'perms' && (
        t.isAdmin ? (
          <>
            <NotifyToggle />
            <div className="stack-sm">
              <span className="field-label">Default for everyone</span>
              {ACCESS.map((p) => (
                <label key={p.k} className="card-li" style={{ cursor: 'pointer' }}>
                  <span style={{ fontSize: 20 }}>{p.icon}</span>
                  <span className="grow"><b>{p.label}</b></span>
                  <input type="checkbox" checked={(trip.settings?.[p.k] ?? (p.k === 'members_can_upload_photos' || p.k === 'gets_notifications')) === true} onChange={(x) => t.updateSettings({ [p.k]: x.target.checked })} />
                </label>
              ))}
              <p className="tiny faint">These apply to everyone unless you change a person below.</p>
            </div>
            <AccessPanel />
            <People onEdit={onEdit} />
          </>
        ) : (
          <>
            <NotifyToggle />
            <MyPermissions />
          </>
        )
      )}
    </Sheet>
  );
}

export function MemberSheet({ m, onClose }: { m: Member; onClose: () => void }) {
  const { updateMember, notify } = useTrip();
  const [name, setName] = useState(m.name);
  const [upi, setUpi] = useState(m.upi_id ?? '');
  const bad = upi.trim() !== '' && !validUpi(upi);
  return (
    <Sheet open onClose={onClose} title={`Edit ${m.name}`} actions={
      <button className="btn primary" disabled={!name.trim() || bad} onClick={async () => { await updateMember(m.id, { name: name.trim(), upi_id: upi.trim() || null }); notify('Saved'); onClose(); }}>Save</button>
    }>
      <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="UPI ID"><input value={upi} placeholder="name@bank" autoCapitalize="none" autoCorrect="off" onChange={(e) => setUpi(e.target.value)} /></Field>
      {bad && <p className="bad small">That doesn’t look like a UPI ID yet.</p>}
    </Sheet>
  );
}

function People({ onEdit }: { onEdit: (m: Member) => void }) {
  const t = useTrip();
  async function resetPw(m: Member) {
    const pw = window.prompt(`Set a temporary password for ${m.name} (8+ characters). Tell them to change it in My account.`);
    if (!pw) return;
    const r = await api('/api/admin/reset-password', { code: t.trip.code, memberId: m.id, password: pw });
    const j = await r.json().catch(() => ({}));
    t.notify(r.ok ? 'Temporary password set' : j.error || 'Couldn’t change it');
  }
  return (
    <div className="stack-sm">
      <span className="field-label">People · {t.members.length}</span>
      {t.members.map((m) => (
        <div key={m.id} className="inner pad stack-sm">
          <div className="row">
            <Avatar m={m} size={34} />
            <div className="grow"><b>{m.name}</b>{m.role === 'admin' && <span className="badge" style={{ marginLeft: 6, padding: '2px 8px', fontSize: 11 }}>Admin</span>}
              <div className="tiny muted">{m.user_id ? 'Joined' : 'Hasn’t joined yet'}</div></div>
          </div>
          <div className="row wrap">
            <button className="btn sm" onClick={() => onEdit(m)}>Edit name / UPI</button>
            {m.user_id && m.id !== t.me?.id && <button className="btn sm" onClick={() => resetPw(m)}><Icon n="lock" size={14} /> Temp password</button>}
            {m.id !== t.adminId && m.id !== t.me?.id && <button className="btn sm danger" onClick={() => { if (confirm(`Remove ${m.name} from the trip? This can’t be undone.`)) t.removeMember(m.id); }}><Icon n="trash" size={14} /> Remove</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
