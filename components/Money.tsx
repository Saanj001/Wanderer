'use client';
import { api } from '@/lib/api';
import { useMemo, useRef, useState } from 'react';
import { useTrip } from '@/lib/tripData';
import { CATS, CAT_KEYS, balances, fmtDate, money, pairwiseDebts, settle, todayISO, upiLink, uid, type ExpenseDebt, type Transfer } from '@/lib/utils';
import type { Category, Expense } from '@/lib/types';
import { Avatar, Field, Icon, Sheet } from './ui';
import { compress } from '@/lib/tripData';

export default function Money() {
  const t = useTrip();
  const { members, expenses, payments, trip, me } = t;
  const [sheet, setSheet] = useState<Expense | 'new' | null>(null);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const canAdd = t.can('members_can_add_expenses');

  const net = useMemo(() => balances(members, expenses, payments), [members, expenses, payments]);
  const [detailed, setDetailed] = useState(true);
  const debts = useMemo(() => pairwiseDebts(expenses, payments), [expenses, payments]);
  const pairs = useMemo(
    () => Object.keys(debts)
      .map((key) => { const [from, to] = key.split('=>'); return { from, to, amount: (debts[key] ?? []).reduce((s, l) => s + (l.amount - l.paid), 0) }; })
      .filter((p) => p.amount > 0.5)
      .sort((a, b) => b.amount - a.amount),
    [debts],
  );
  const simplified = useMemo(() => settle(net), [net]);
  const transfers = detailed ? pairs : simplified;
  const mine = me ? net[me.id] ?? 0 : 0;

  const grouped = useMemo(() => {
    const list = [...expenses].filter((e) => filter === 'all' || e.category === filter).sort((a, b) => (a.date === b.date ? b.created_at.localeCompare(a.created_at) : b.date.localeCompare(a.date)));
    const g: Record<string, Expense[]> = {};
    list.forEach((e) => (g[e.date] ??= []).push(e));
    return Object.entries(g);
  }, [expenses, filter]);

  return (
    <div className="stack">
      <section className="glass pad-lg stack-sm">
        <span className="muted small">{mine > 0.5 ? 'You’re owed' : mine < -0.5 ? 'You owe' : 'Your balance'}</span>
        <span className={`balance-big num ${mine > 0.5 ? 'good' : mine < -0.5 ? 'bad' : ''}`}>{Math.abs(mine) < 0.5 ? 'All settled' : money(Math.abs(mine))}</span>
        <span className="muted small">{expenses.length} expenses · {money(expenses.reduce((s, e) => s + e.amount, 0))} total</span>
      </section>

      <section className="stack-sm">
        <div className="row between" style={{ padding: '0 4px' }}>
          <div className="section-title">Settle up</div>
          <div className="seg" style={{ width: 168 }}>
            <button className={detailed ? 'on' : ''} onClick={() => setDetailed(true)}>By expense</button>
            <button className={!detailed ? 'on' : ''} onClick={() => setDetailed(false)}>Fewest payments</button>
          </div>
        </div>
        {transfers.length === 0 ? (
          <div className="glass empty">Nobody owes anybody. Add an expense to get started.</div>
        ) : transfers.map((tr) => <TransferCard key={tr.from + tr.to} tr={tr} lines={detailed ? debts[`${tr.from}=>${tr.to}`]?.filter((l) => l.amount - l.paid > 0.5) : undefined} />)}
        {detailed && <p className="tiny faint" style={{ padding: '0 4px' }}>Each row here traces back to the exact expenses. Switch to “Fewest payments” for the smallest number of transfers overall.</p>}
        {payments.length > 0 && (
          <details className="glass pad">
            <summary className="small muted" style={{ cursor: 'pointer' }}>{payments.length} payment{payments.length > 1 ? 's' : ''} marked as paid</summary>
            <div className="stack-sm" style={{ marginTop: 10 }}>
              {[...payments].reverse().map((p) => (
                <div key={p.id} className="row small">
                  <span className="grow">{t.member(p.from_member)?.name} paid {t.member(p.to_member)?.name} <b className="num">{money(p.amount)}</b></span>
                  <button className="icon-btn sm" aria-label="Undo payment" onClick={() => t.deletePayment(p.id)}><Icon n="trash" size={15} /></button>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      <section className="stack-sm">
        <div className="section-title" style={{ padding: '0 4px' }}>Expenses</div>
        <div className="chips">
          <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All</button>
          {CAT_KEYS.map((k) => <button key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{CATS[k].emoji} {CATS[k].label}</button>)}
        </div>
        {grouped.length === 0 && <div className="glass empty">No expenses here yet. Tap “Add expense”.</div>}
        {grouped.map(([date, list]) => (
          <div key={date} className="stack-sm">
            <div className="day-head"><span>{fmtDate(date, { weekday: 'long', day: 'numeric', month: 'short' })}</span><span className="num">{money(list.reduce((s, e) => s + e.amount, 0))}</span></div>
            {list.map((e) => {
              const payer = t.member(e.paid_by);
              return (
                <button key={e.id} className="card-li" onClick={() => canAdd && setSheet(e)}>
                  <span className="emoji-tile" style={{ background: `${CATS[e.category].color}26` }}>{CATS[e.category].emoji}</span>
                  <span className="grow"><b className="ellipsis" style={{ display: 'block' }}>{e.title}</b>
                    <span className="muted small">{payer?.name ?? 'Someone'} paid · split {e.split_among.length === members.length ? 'with all' : `${e.split_among.length} ways`}</span></span>
                  <b className="num">{money(e.amount, trip.currency)}</b>
                </button>
              );
            })}
          </div>
        ))}
      </section>

      {canAdd ? <button className="fab" onClick={() => setSheet('new')}><Icon n="plus" size={22} /> Add expense</button> : <p className="muted small" style={{ textAlign: 'center' }}><Icon n="lock" size={14} /> The admin has limited who can add expenses.</p>}
      {sheet && <ExpenseSheet key={sheet === 'new' ? 'new' : sheet.id} initial={sheet === 'new' ? null : sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

function TransferCard({ tr, lines }: { tr: Transfer; lines?: ExpenseDebt[] }) {
  const t = useTrip();
  const from = t.member(tr.from), to = t.member(tr.to);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [payLine, setPayLine] = useState<ExpenseDebt | null>(null);
  if (!from || !to) return null;
  const involvesMe = t.me && (tr.from === t.me.id || tr.to === t.me.id);
  const iPay = t.me?.id === tr.from;
  const link = to.upi_id ? upiLink({ pa: to.upi_id, pn: to.name, am: tr.amount, tn: `${t.trip.name} settle-up` }) : '';
  return (
    <div className={`transfer ${involvesMe ? 'mine' : ''}`}>
      <div className="row">
        <Avatar m={from} /><Icon n="arrow" size={18} /><Avatar m={to} />
        <span className="grow small"><b>{iPay ? 'You' : from.name}</b> {iPay ? 'pay' : 'pays'} <b>{t.me?.id === tr.to ? 'you' : to.name}</b></span>
        <b className="num" style={{ fontSize: 18 }}>{money(tr.amount)}</b>
      </div>
      {lines && lines.length > 0 && (
        <button className="row small breakdown-toggle" onClick={() => setExpanded(!expanded)}>
          <Icon n={expanded ? 'chevron' : 'arrow'} size={14} />
          <span className="grow muted" style={{ textAlign: 'left' }}>{lines.length} expense{lines.length > 1 ? 's' : ''} · {lines.map((l) => l.title).slice(0, 2).join(', ')}{lines.length > 2 ? '…' : ''}</span>
        </button>
      )}
      {expanded && lines && (
        <div className="stack-sm">
          {lines.map((l) => (
            <div key={l.expenseId} className="row small breakdown-line">
              <span style={{ fontSize: 15 }}>{CATS[l.category].emoji}</span>
              <span className="grow ellipsis">{l.title}<span className="muted"> · {fmtDate(l.date)}</span></span>
              <b className="num">{money(l.amount - l.paid)}</b>
              {(iPay || t.me?.id === tr.to) && <button className="icon-btn sm" aria-label="Mark this expense paid" onClick={() => setPayLine(l)}><Icon n="check" size={14} /></button>}
            </div>
          ))}
        </div>
      )}
      {(iPay || involvesMe) && (
        <div className="row wrap">
          {iPay && (to.upi_id
            ? <a className="btn primary sm" href={link}>Pay with UPI</a>
            : <span className="muted small grow">{to.name} hasn’t added a UPI ID yet — ask them to add it on the Trip tab.</span>)}
          {iPay && to.upi_id && <button className="btn sm" onClick={async () => { await navigator.clipboard.writeText(to.upi_id!); t.notify('UPI ID copied'); }}><Icon n="copy" size={15} /> {to.upi_id}</button>}
          <button className="btn sm" onClick={() => setOpen(true)}><Icon n="check" size={15} /> Mark all as paid</button>
        </div>
      )}
      {!involvesMe && <div className="tiny faint">Only the two people involved see payment buttons.</div>}
      <Sheet open={open} onClose={() => setOpen(false)} title="Mark as paid" actions={
        <button className="btn primary" onClick={async () => { await t.addPayment(tr.from, tr.to, tr.amount); setOpen(false); t.notify('Marked as paid'); }}>Yes, it’s paid</button>
      }>
        <p className="muted">Record that <b>{from.name}</b> paid <b>{to.name}</b> {money(tr.amount)}{lines && lines.length > 1 ? ` across ${lines.length} expenses` : ''}. Balances update for everyone.</p>
      </Sheet>
      <Sheet open={!!payLine} onClose={() => setPayLine(null)} title="Mark this expense paid" actions={
        <button className="btn primary" onClick={async () => { if (payLine) await t.addPayment(tr.from, tr.to, payLine.amount - payLine.paid, payLine.expenseId); setPayLine(null); t.notify('Marked as paid'); }}>Yes, it’s paid</button>
      }>
        {payLine && <p className="muted">Record that <b>{from.name}</b> paid <b>{to.name}</b> {money(payLine.amount - payLine.paid)} for <b>{payLine.title}</b>.</p>}
      </Sheet>
    </div>
  );
}

function ExpenseSheet({ initial, onClose }: { initial: Expense | null; onClose: () => void }) {
  const t = useTrip();
  const { members, me } = t;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [cat, setCat] = useState<Category>(initial?.category ?? 'food');
  const [paidBy, setPaidBy] = useState(initial?.paid_by ?? me?.id ?? members[0]?.id ?? '');
  const [split, setSplit] = useState<string[]>(initial?.split_among ?? members.map((m) => m.id));
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [note, setNote] = useState(initial?.note ?? '');
  const [ai, setAi] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [byShares, setByShares] = useState(!!initial?.shares);
  const [weights, setWeights] = useState<Record<string, number>>(initial?.shares ?? {});
  const scan = useRef<HTMLInputElement>(null);
  const aiOk = t.can('members_can_use_ai');
  const wOf = (id: string) => weights[id] ?? 1;
  const wSum = split.reduce((sum, id) => sum + wOf(id), 0) || 1;

  const amt = Number(amount);
  const valid = title.trim() && amt > 0 && split.length > 0 && paidBy;
  const toggle = (id: string) => setSplit((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function smartFill() {
    if (!ai.trim()) return;
    setAiBusy(true);
    try {
      const r = await api('/api/ai', { mode: 'expense', code: t.trip.code, text: ai, members: members.map((m) => m.name), me: me?.name, today: todayISO() });
      const j = await r.json();
      if (!r.ok || !j.data) throw new Error(j.error || 'AI could not read that');
      const d = j.data;
      if (d.title) setTitle(d.title);
      if (d.amount) setAmount(String(d.amount));
      if (CAT_KEYS.includes(d.category)) setCat(d.category);
      const payer = members.find((m) => m.name.toLowerCase() === String(d.paidBy || '').toLowerCase());
      if (payer) setPaidBy(payer.id);
      if (Array.isArray(d.splitAmong) && d.splitAmong.length) {
        const ids = members.filter((m) => d.splitAmong.map((n: string) => n.toLowerCase()).includes(m.name.toLowerCase())).map((m) => m.id);
        if (ids.length) setSplit(ids);
      }
      setAi('');
    } catch (e) { t.notify((e as Error).message); }
    setAiBusy(false);
  }

  async function scanBill(f: File | undefined) {
    if (!f) return;
    setAiBusy(true);
    try {
      const { blob } = await compress(f, 1600, 0.82);
      const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
      const r = await api('/api/ai', { mode: 'receipt', code: t.trip.code, today: todayISO(), image: { mime: blob.type || 'image/jpeg', data } });
      const j = await r.json();
      if (!r.ok || !j.data) throw new Error(j.error || 'Couldn’t read that bill');
      const d = j.data;
      if (d.title) setTitle(String(d.title));
      if (d.amount) setAmount(String(d.amount));
      if (CAT_KEYS.includes(d.category)) setCat(d.category);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) setDate(d.date);
      t.notify('Bill read. Check the details.');
    } catch (e) { t.notify((e as Error).message); }
    setAiBusy(false);
    if (scan.current) scan.current.value = '';
  }

  async function save() {
    await t.saveExpense({ id: initial?.id ?? uid(), title: title.trim(), amount: amt, category: cat, paid_by: paidBy, split_among: split, shares: byShares ? Object.fromEntries(split.map((id) => [id, Math.max(0, Number(weights[id] ?? 1))])) : null, date, note: note.trim() || null, created_at: initial?.created_at });
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={initial ? 'Edit expense' : 'Add expense'} actions={
      <>
        {initial && <button className="btn danger" onClick={async () => { await t.deleteExpense(initial.id); onClose(); }}><Icon n="trash" size={17} /></button>}
        <button className="btn primary" disabled={!valid} onClick={save}>{initial ? 'Save changes' : 'Add expense'}</button>
      </>
    }>
      {!initial && aiOk && (
        <div className="inner pad stack-sm">
          <div className="row small"><Icon n="sparkle" size={16} /><b>Let AI fill it in</b></div>
          <div className="row">
            <input placeholder="cab 450 paid by Riya" value={ai} onChange={(e) => setAi(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && smartFill()} />
            <button className="btn sm" disabled={aiBusy || !ai.trim()} onClick={smartFill}>{aiBusy ? '…' : 'Fill'}</button>
          </div>
          <button className="btn sm" disabled={aiBusy} onClick={() => scan.current?.click()}><Icon n="camera" size={15} /> Scan a bill or payment screenshot</button>
          <input ref={scan} type="file" accept="image/*" hidden onChange={(e) => scanBill(e.target.files?.[0])} />
        </div>
      )}
      <Field label="What was it for?"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dinner at Ambrai" /></Field>
      <div className="two">
        <Field label="Amount (₹)"><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0" /></Field>
        <Field label="Date"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <div className="stack-sm"><span className="field-label">Category</span>
        <div className="chips wrap">{CAT_KEYS.map((k) => <button key={k} type="button" className={`chip ${cat === k ? 'on' : ''}`} onClick={() => setCat(k)}>{CATS[k].emoji} {CATS[k].label}</button>)}</div>
      </div>
      <Field label="Paid by">
        <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>{members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === me?.id ? ' (you)' : ''}</option>)}</select>
      </Field>
      <div className="stack-sm">
        <div className="row between"><span className="field-label">Split between</span>
          <button className="small muted" onClick={() => setSplit(split.length === members.length ? [] : members.map((m) => m.id))}>{split.length === members.length ? 'Clear' : 'Select all'}</button></div>
        <div className="chips wrap">{members.map((m) => <button key={m.id} type="button" className={`chip ${split.includes(m.id) ? 'on' : ''}`} onClick={() => toggle(m.id)}>{m.name}</button>)}</div>
        <div className="chips wrap">
          <button type="button" className={`chip ${!byShares ? 'on' : ''}`} onClick={() => setByShares(false)}>Equally</button>
          <button type="button" className={`chip ${byShares ? 'on' : ''}`} onClick={() => setByShares(true)}>By shares (couples, kids…)</button>
        </div>
        {byShares && split.map((id) => {
          const m = members.find((x) => x.id === id); if (!m) return null;
          return (
            <div key={id} className="row">
              <span className="grow">{m.name}</span>
              <span className="muted small num">{amt > 0 ? money((amt * wOf(id)) / wSum) : ''}</span>
              <button className="icon-btn sm" type="button" aria-label="Fewer shares" onClick={() => setWeights({ ...weights, [id]: Math.max(0.5, wOf(id) - 0.5) })}>−</button>
              <b className="num" style={{ minWidth: 26, textAlign: 'center' }}>{wOf(id)}</b>
              <button className="icon-btn sm" type="button" aria-label="More shares" onClick={() => setWeights({ ...weights, [id]: wOf(id) + 0.5 })}>+</button>
            </div>
          );
        })}
        {!byShares && amt > 0 && split.length > 0 && <span className="muted small">{money(amt / split.length)} each</span>}
      </div>
      <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Sheet>
  );
}
