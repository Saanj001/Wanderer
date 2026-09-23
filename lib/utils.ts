import type { Category, Expense, Member, Payment } from './types';

export const CATS: Record<Category, { label: string; emoji: string; color: string }> = {
  stay: { label: 'Stay', emoji: '🏨', color: '#b57bff' },
  food: { label: 'Food', emoji: '🍛', color: '#ff7a59' },
  transport: { label: 'Local travel', emoji: '🛺', color: '#4fd1c5' },
  adventure: { label: 'Adventures', emoji: '🚣', color: '#ffc46b' },
  travel: { label: 'Getting there', emoji: '🚆', color: '#6ea8ff' },
  shopping: { label: 'Shopping', emoji: '🛍️', color: '#ff8fc7' },
  other: { label: 'Other', emoji: '✨', color: '#a7f3a0' },
};
export const CAT_KEYS = Object.keys(CATS) as Category[];
export const MEMBER_COLORS = ['#ff7a59', '#ffc46b', '#b57bff', '#4fd1c5', '#6ea8ff', '#ff8fc7', '#a7f3a0', '#f59e0b', '#22d3ee', '#f472b6'];

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export function makeCode(len = 8): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function money(n: number, cur = 'INR'): string {
  try {
    return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency', currency: cur, maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    }).format(n);
  } catch { return `${n}`; }
}

const p2 = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const parseISO = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayISO = () => toISO(new Date());
export function addDays(iso: string, n: number) { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
export function eachDay(start: string, end: string): string[] {
  const out: string[] = []; let cur = start; let guard = 0;
  while (cur <= end && guard++ < 60) { out.push(cur); cur = addDays(cur, 1); }
  return out.length ? out : [start];
}
export function fmtDate(iso: string, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return parseISO(iso).toLocaleDateString('en-IN', o);
}
export function fmtRange(a: string, b: string) {
  return a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
export function fmtTime12(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${p2(m)} ${h >= 12 ? 'pm' : 'am'}`;
}
export function chatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}
export function chatDay(iso: string) {
  const d = new Date(iso); const t = new Date();
  if (toISO(d) === toISO(t)) return 'Today';
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (toISO(d) === toISO(y)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Net balance per member. + means the group owes them, − means they owe the group. */
export function balances(members: Member[], expenses: Expense[], payments: Payment[]): Record<string, number> {
  const net: Record<string, number> = {};
  members.forEach((m) => (net[m.id] = 0));
  for (const e of expenses) {
    const ids = e.split_among.length ? e.split_among : members.map((m) => m.id);
    const w = (id: string) => Math.max(0, Number(e.shares?.[id] ?? 1)) || 0;
    const total = ids.reduce((sum, id) => sum + w(id), 0) || ids.length;
    net[e.paid_by] = (net[e.paid_by] ?? 0) + e.amount;
    ids.forEach((id) => (net[id] = (net[id] ?? 0) - (e.amount * (e.shares ? w(id) : 1)) / (e.shares ? total : ids.length)));
  }
  for (const p of payments) {
    net[p.from_member] = (net[p.from_member] ?? 0) + p.amount;
    net[p.to_member] = (net[p.to_member] ?? 0) - p.amount;
  }
  return net;
}

export type Transfer = { from: string; to: string; amount: number };
export function settle(net: Record<string, number>): Transfer[] {
  const cr = Object.entries(net).filter(([, v]) => v > 0.5).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v);
  const dr = Object.entries(net).filter(([, v]) => v < -0.5).map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v);
  const out: Transfer[] = []; let i = 0, j = 0;
  while (i < dr.length && j < cr.length) {
    const amt = Math.min(dr[i].v, cr[j].v);
    out.push({ from: dr[i].id, to: cr[j].id, amount: Math.round(amt * 100) / 100 });
    dr[i].v -= amt; cr[j].v -= amt;
    if (dr[i].v < 0.5) i++;
    if (cr[j].v < 0.5) j++;
  }
  return out;
}

export function upiLink(o: { pa: string; pn: string; am: number; tn: string }) {
  const e = (v: string) => encodeURIComponent(v);
  return `upi://pay?pa=${o.pa.trim()}&pn=${e(o.pn)}&am=${o.am.toFixed(2)}&cu=INR&tn=${e(o.tn)}`;
}
export const validUpi = (s: string) => /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/.test(s.trim());

export const initials = (n: string) => n.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

// ---- Indian Standard Time helpers (tickets are always shown in IST) ----
export function istDateTime(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? '00';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}
export const toISTiso = (date: string, time: string) => `${date}T${time || '00:00'}:00+05:30`;
export function fmtIST(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}
export function countdown(ms: number): string {
  if (ms <= -15 * 60000) return 'departed';
  if (ms <= 0) return 'boarding now';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? 's' : ''} ${h % 24}h`;
}

/** Arrival can't be before departure (AI sometimes misreads the date). Returns a sane arrival date. */
export function fixArrival(departDate: string, departTime: string, arriveDate: string, arriveTime: string): string {
  if (!arriveDate) return '';
  let a = arriveDate;
  if (a < departDate) a = departDate;
  if (a === departDate && arriveTime && departTime && arriveTime < departTime) a = addDays(departDate, 1);
  return a;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
/** Finds @mentions in text and maps them to member ids ("@Yash", "@GauravGay"). */
export function parseMentions(text: string, members: Member[]): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/@([\p{L}\p{N}_]+)/gu)) {
    const tok = norm(m[1]);
    if (!tok || tok === 'ai') continue;
    const full = members.find((x) => norm(x.name) === tok);
    if (full) { out.add(full.id); continue; }
    const firsts = members.filter((x) => norm(x.name.split(/\s+/)[0]) === tok);
    if (firsts.length === 1) out.add(firsts[0].id);
  }
  return [...out];
}
export const mentionHandle = (name: string, members: Member[]) => {
  const first = name.split(/\s+/)[0];
  const dup = members.filter((x) => norm(x.name.split(/\s+/)[0]) === norm(first)).length > 1;
  return '@' + (dup ? name.replace(/\s+/g, '') : first);
};

export type ExpenseDebt = { expenseId: string; title: string; category: Category; date: string; amount: number; paid: number };
/** For each debtor→creditor pair, the list of expenses behind that debt and how much of each is still owed. */
export function pairwiseDebts(expenses: Expense[], payments: Payment[]): Record<string, ExpenseDebt[]> {
  const map: Record<string, ExpenseDebt[]> = {};
  for (const e of expenses) {
    const ids = e.split_among.length ? e.split_among : [];
    const w = (id: string) => Math.max(0, Number(e.shares?.[id] ?? 1)) || 0;
    const total = ids.reduce((s, id) => s + w(id), 0) || ids.length;
    for (const id of ids) {
      if (id === e.paid_by || !total) continue;
      const amount = (e.amount * (e.shares ? w(id) : 1)) / total;
      if (amount <= 0.004) continue;
      (map[`${id}=>${e.paid_by}`] ??= []).push({ expenseId: e.id, title: e.title, category: e.category, date: e.date, amount, paid: 0 });
    }
  }
  const byPair: Record<string, Payment[]> = {};
  for (const p of payments) (byPair[`${p.from_member}=>${p.to_member}`] ??= []).push(p);
  for (const key of Object.keys(map)) {
    const lines = map[key].sort((a, b) => a.date.localeCompare(b.date));
    let generic = 0;
    for (const p of byPair[key] ?? []) {
      if (p.expense_id) { const l = lines.find((x) => x.expenseId === p.expense_id); if (l) l.paid = Math.min(l.amount, l.paid + p.amount); else generic += p.amount; }
      else generic += p.amount;
    }
    for (const l of lines) { if (generic <= 0.004) break; const take = Math.min(l.amount - l.paid, generic); l.paid += take; generic -= take; }
  }
  return map;
}
