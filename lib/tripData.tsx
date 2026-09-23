'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { sb, BUCKET } from './supabase';
import { addRecent } from './identity';
import { useAuth } from './auth';
import { api } from './api';
import { MEMBER_COLORS, istDateTime, parseMentions, uid } from './utils';
import type { ChatSession, Expense, Member, Message, Payment, PermKey, Photo, PlanItem, PollVote, Settings, Task, Ticket, Trip } from './types';

type Tables = { members: Member[]; expenses: Expense[]; plan_items: PlanItem[]; payments: Payment[]; messages: Message[]; photos: Photo[]; tickets: Ticket[]; tasks: Task[]; poll_votes: PollVote[]; chat_sessions: ChatSession[] };
type TableName = keyof Tables;
const TABLES: TableName[] = ['members', 'expenses', 'plan_items', 'payments', 'messages', 'photos', 'tickets', 'tasks', 'poll_votes', 'chat_sessions'];
type Status = 'loading' | 'notfound' | 'error' | 'ready';

const upsert = <T extends { id: string }>(arr: T[], row: T): T[] =>
  arr.some((r) => r.id === row.id) ? arr.map((r) => (r.id === row.id ? { ...r, ...row } : r)) : [...arr, row];

type Ctx = {
  status: Status;
  trip: Trip;
  members: Member[];
  expenses: Expense[];
  plan: PlanItem[];
  payments: Payment[];
  messages: Message[];
  photos: Photo[];
  tickets: Ticket[];
  tasks: Task[];
  pollVotes: PollVote[];
  sessions: ChatSession[];
  currentSession: ChatSession | null;
  newChat: () => Promise<void>;
  me: Member | null;
  isAdmin: boolean;
  adminId: string | null;
  can: (k: PermKey) => boolean;
  updateSettings: (p: Partial<Settings>) => Promise<void>;
  becomeAdmin: () => Promise<void>;
  setRole: (id: string, role: 'admin' | 'member') => Promise<void>;
  setPerms: (id: string, perms: Partial<Settings> | null) => Promise<void>;
  bulkAccess: (ids: string[], patch: Partial<Settings> & { role?: 'admin' | 'member' }) => Promise<void>;
  deleteTrip: () => Promise<boolean>;
  member: (id: string | null | undefined) => Member | undefined;
  toast: string | null;
  notify: (msg: string) => void;
  updateTrip: (p: Partial<Trip>) => Promise<void>;
  addMember: (name: string) => Promise<Member>;
  updateMember: (id: string, p: Partial<Member>) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  saveExpense: (e: Omit<Expense, 'trip_id' | 'created_at'> & { created_at?: string }) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  savePlan: (p: Omit<PlanItem, 'trip_id'>) => Promise<void>;
  savePlans: (ps: Omit<PlanItem, 'trip_id'>[]) => Promise<void>;
  deletePlan: (id: string) => Promise<void>;
  clearPlan: () => Promise<void>;
  addPayment: (from: string, to: string, amount: number, expenseId?: string | null) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
  sendMessage: (body: string, isAi?: boolean, extra?: { kind?: Message['kind']; image?: Blob }) => Promise<void>;
  uploadPhotos: (files: File[], onProgress?: (done: number, total: number) => void) => Promise<void>;
  deletePhoto: (p: Photo) => Promise<void>;
  saveTicket: (t: Omit<Ticket, 'trip_id' | 'created_at'>, image?: Blob | null) => Promise<void>;
  deleteTicket: (t: Ticket) => Promise<void>;
  saveTask: (t: { id: string; title: string; assignee_id: string | null }) => Promise<void>;
  toggleTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  vote: (messageId: string, index: number, multi: boolean) => Promise<void>;
};

const TripCtx = createContext<Ctx | null>(null);
export const useTrip = () => {
  const c = useContext(TripCtx);
  if (!c) throw new Error('useTrip outside provider');
  return c;
};

/** Resize big phone photos before upload: keeps quality high, saves storage & time. */
export async function compress(file: File, maxSide = 2560, quality = 0.9): Promise<{ blob: Blob; w: number; h: number; ext: string }> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    if (scale === 1 && file.size < 2.5 * 1024 * 1024 && /jpe?g|webp|png/.test(file.type)) {
      const ext = file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpg';
      return { blob: file, w, h, ext };
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', quality));
    return { blob, w, h, ext: 'jpg' };
  } catch {
    return { blob: file, w: 0, h: 0, ext: (file.name.split('.').pop() || 'jpg').toLowerCase() };
  }
}

export function TripProvider({ code, children }: { code: string; children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [trip, setTrip] = useState<Trip | null>(null);
  const [data, setData] = useState<Tables>({ members: [], expenses: [], plan_items: [], payments: [], messages: [], photos: [], tickets: [], tasks: [], poll_votes: [], chat_sessions: [] });
  const { user } = useAuth();
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus('loading');
      const { data: t, error } = await sb().from('trips').select('*').eq('code', code.toUpperCase()).maybeSingle();
      if (cancelled) return;
      if (error) { setStatus('error'); return; }
      if (!t) { setStatus('notfound'); return; }
      const results = await Promise.all(
        TABLES.map((tb) => {
          let q = sb().from(tb).select('*').eq('trip_id', t.id);
          q = tb === 'messages' || tb === 'photos' ? q.order('created_at', { ascending: true }) : q.order('created_at', { ascending: true });
          return q;
        }),
      );
      if (cancelled) return;
      if (results.some((r) => r.error)) { setStatus('error'); return; }
      const next = {} as Tables;
      TABLES.forEach((tb, i) => ((next as Record<string, unknown>)[tb] = results[i].data ?? []));
      setTrip(t as Trip);
      setData(next);
      addRecent({ code: t.code, name: t.name, destination: t.destination });
      setStatus('ready');
    })();
    return () => { cancelled = true; };
  }, [code]);

  // realtime
  useEffect(() => {
    if (!trip) return;
    const ch = sb().channel(`trip-${trip.id}`);
    TABLES.forEach((tb) => {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: tb, filter: `trip_id=eq.${trip.id}` }, (p) => {
        setData((d) => {
          const list = d[tb] as { id: string }[];
          if (p.eventType === 'DELETE') {
            const id = (p.old as { id?: string }).id;
            return id ? { ...d, [tb]: list.filter((r) => r.id !== id) } : d;
          }
          return { ...d, [tb]: upsert(list, p.new as { id: string }) };
        });
      });
    });
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${trip.id}` }, (p) => setTrip((t) => (t ? { ...t, ...(p.new as Trip) } : t)));
    ch.subscribe();
    return () => { sb().removeChannel(ch); };
  }, [trip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const tripId = trip?.id ?? '';

  // generic optimistic writers
  const write = useCallback(
    async <K extends TableName>(tb: K, row: Tables[K][number], opts?: { insertOnly?: boolean }) => {
      setData((d) => ({ ...d, [tb]: upsert(d[tb] as { id: string }[], row as { id: string }) }));
      const q = sb().from(tb);
      const { error } = opts?.insertOnly ? await q.insert(row as never) : await q.upsert(row as never);
      if (error) {
        setData((d) => ({ ...d, [tb]: (d[tb] as { id: string }[]).filter((r) => r.id !== (row as { id: string }).id) }));
        notify(error.message.includes('row-level security') ? 'You don’t have permission to do that. Ask the admin.' : `Couldn't save: ${error.message}`);
        throw error;
      }
    },
    [notify],
  );
  const remove = useCallback(
    async (tb: TableName, id: string) => {
      setData((d) => ({ ...d, [tb]: (d[tb] as { id: string }[]).filter((r) => r.id !== id) }));
      const { error } = await sb().from(tb).delete().eq('id', id);
      if (error) notify(`Couldn't delete: ${error.message}`);
    },
    [notify],
  );

  const value = useMemo<Ctx | null>(() => {
    if (!trip) return null;
    const me = data.members.find((m) => m.user_id === user?.id) ?? null;
    const meId = me?.id ?? null;
    const sortedSessions = [...data.chat_sessions].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const curSessionId = sortedSessions[sortedSessions.length - 1]?.id ?? null;
    const adminId = trip.admin_member_id ?? null;
    const isAdmin = me?.role === 'admin';
    const can = (k: PermKey) => isAdmin || (me?.perms?.[k] ?? trip.settings?.[k] ?? (k === 'members_can_upload_photos' || k === 'gets_notifications')) === true;
    const byId = new Map(data.members.map((m) => [m.id, m]));
    return {
      status, trip, ...{ members: data.members, expenses: data.expenses, plan: data.plan_items, payments: data.payments, messages: data.messages, photos: data.photos, tickets: data.tickets, tasks: data.tasks, pollVotes: data.poll_votes, sessions: sortedSessions, currentSession: sortedSessions[sortedSessions.length - 1] ?? null },
      me, isAdmin, adminId, can,
      updateSettings: async (p) => {
        const settings = { ...(trip.settings ?? {}), ...p };
        setTrip((t) => (t ? { ...t, settings } : t));
        const { error } = await sb().from('trips').update({ settings }).eq('id', trip.id);
        if (error) notify(error.message);
      },
      becomeAdmin: async () => {
        const { error } = await sb().rpc('claim_admin', { p_trip: trip.id });
        if (error) notify(error.message); else { setTrip((t) => (t ? { ...t, admin_member_id: me?.id ?? null } : t)); setData((d) => ({ ...d, members: d.members.map((m) => (m.id === me?.id ? { ...m, role: 'admin' } : m)) })); }
      },
      setRole: async (id, role) => {
        setData((d) => ({ ...d, members: d.members.map((m) => (m.id === id ? { ...m, role } : m)) }));
        const { error } = await sb().from('members').update({ role }).eq('id', id);
        if (error) notify(error.message);
      },
      bulkAccess: async (ids, patch) => {
        const { role, ...perm } = patch;
        const rows = data.members.filter((m) => ids.includes(m.id) && m.id !== adminId);
        setData((d) => ({ ...d, members: d.members.map((m) => (rows.some((r) => r.id === m.id) ? { ...m, ...(role ? { role } : {}), perms: { ...(m.perms ?? {}), ...perm } } : m)) }));
        const res = await Promise.all(rows.map((m) => sb().from('members').update({ ...(role ? { role } : {}), perms: { ...(m.perms ?? {}), ...perm } }).eq('id', m.id)));
        const bad = res.find((r) => r.error);
        notify(bad?.error ? bad.error.message : `Updated ${rows.length} ${rows.length === 1 ? 'person' : 'people'}`);
      },
      deleteTrip: async () => {
        const { error } = await sb().from('trips').delete().eq('id', trip.id);
        if (error) { notify(error.message); return false; }
        return true;
      },
      setPerms: async (id, perms) => {
        setData((d) => ({ ...d, members: d.members.map((m) => (m.id === id ? { ...m, perms } : m)) }));
        const { error } = await sb().from('members').update({ perms: perms ?? {} }).eq('id', id);
        if (error) notify(error.message);
      },
      member: (id) => (id ? byId.get(id) : undefined),
      toast, notify,
      updateTrip: async (p) => {
        setTrip((t) => (t ? { ...t, ...p } : t));
        const { error } = await sb().from('trips').update(p).eq('id', trip.id);
        if (error) notify(error.message);
      },
      addMember: async (name) => {
        const m: Member = { id: uid(), trip_id: trip.id, name: name.trim(), color: MEMBER_COLORS[data.members.length % MEMBER_COLORS.length], upi_id: null, email: null, phone: null, user_id: null, role: 'member', perms: {}, avatar_path: null };
        await write('members', m, { insertOnly: true });
        return m;
      },
      updateMember: async (id, p) => {
        setData((d) => ({ ...d, members: d.members.map((m) => (m.id === id ? { ...m, ...p } : m)) }));
        const { error } = await sb().from('members').update(p).eq('id', id);
        if (error) notify(error.message);
      },
      removeMember: async (id) => {
        const inUse = data.expenses.some((e) => e.paid_by === id || e.split_among.includes(id)) || data.payments.some((p) => p.from_member === id || p.to_member === id);
        if (inUse) { notify('This person is part of expenses, so they can’t be removed.'); return; }
        await remove('members', id);
      },
      saveExpense: (e) => write('expenses', { ...e, trip_id: trip.id, created_at: e.created_at ?? new Date().toISOString() }),
      deleteExpense: (id) => remove('expenses', id),
      savePlan: (p) => write('plan_items', { ...p, trip_id: trip.id }),
      savePlans: async (ps) => {
        const rows = ps.map((p) => ({ ...p, trip_id: trip.id }));
        setData((d) => ({ ...d, plan_items: rows.reduce((acc, r) => upsert(acc, r), d.plan_items) }));
        const { error } = await sb().from('plan_items').upsert(rows);
        if (error) notify(error.message);
      },
      deletePlan: (id) => remove('plan_items', id),
      clearPlan: async () => {
        setData((d) => ({ ...d, plan_items: [] }));
        const { error } = await sb().from('plan_items').delete().eq('trip_id', trip.id);
        if (error) notify(error.message);
      },
      addPayment: (from, to, amount, expenseId) => write('payments', { id: uid(), trip_id: trip.id, from_member: from, to_member: to, amount, expense_id: expenseId ?? null, created_at: new Date().toISOString() }, { insertOnly: true }),
      deletePayment: (id) => remove('payments', id),
      sendMessage: async (body, isAi = false, extra) => {
        const id = uid();
        let image_path: string | null = null;
        if (extra?.image) {
          const path = `${trip.id}/chat/${id}.jpg`;
          const up = await sb().storage.from(BUCKET).upload(path, extra.image, { contentType: extra.image.type || 'image/jpeg' });
          if (up.error) { notify(`Couldn't send photo: ${up.error.message}`); return; }
          image_path = path;
        }
        const kind = extra?.kind ?? (image_path ? 'image' : 'text');
        await write('messages', { id, trip_id: trip.id, member_id: isAi ? null : meId, body, is_ai: isAi, kind, image_path, session_id: curSessionId, created_at: new Date().toISOString() }, { insertOnly: true });
        if (!isAi && me) {
          const preview = kind === 'poll' ? '📊 New poll' : kind === 'image' ? '📷 Photo' : kind === 'gif' ? 'GIF' : kind === 'call' ? '📹 Started a video call' : body;
          const mentioned = kind === 'text' ? parseMentions(body, data.members).filter((x) => x !== me.id) : [];
          api('/api/notify', { code: trip.code, title: `${me.name} · ${trip.name}`, body: preview.slice(0, 140), except: mentioned }).catch(() => {});
          mentioned.forEach((to) => api('/api/notify', { code: trip.code, to, title: `${me.name} mentioned you`, body: preview.slice(0, 140) }).catch(() => {}));
        }
      },
      uploadPhotos: async (files, onProgress) => {
        let done = 0;
        for (const f of files) {
          try {
            const { blob, w, h, ext } = await compress(f);
            const id = uid();
            const path = `${trip.id}/${id}.${ext}`;
            const up = await sb().storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg', cacheControl: '31536000' });
            if (up.error) throw up.error;
            await write('photos', { id, trip_id: trip.id, member_id: meId, path, caption: null, width: w || null, height: h || null, created_at: new Date().toISOString() }, { insertOnly: true });
          } catch (err) {
            notify(`Couldn't upload ${f.name}: ${(err as Error).message}`);
          }
          onProgress?.(++done, files.length);
        }
      },
      saveTicket: async (tk, image) => {
        let image_path = tk.image_path;
        if (image) {
          const path = `${trip.id}/tickets/${tk.id}.jpg`;
          const up = await sb().storage.from(BUCKET).upload(path, image, { contentType: image.type || 'image/jpeg', upsert: true });
          if (!up.error) image_path = path;
        }
        await write('tickets', { ...tk, image_path, trip_id: trip.id, created_at: new Date().toISOString() });
        // make sure travel days (e.g. the day you board) are inside the trip's date range
        const dep = istDateTime(tk.depart_at).date;
        const near = Math.abs((new Date(dep).getTime() - new Date(trip.start_date).getTime()) / 864e5) <= 45;
        const ds = near ? [dep] : [];
        if (ds.length && (ds[0] < trip.start_date || ds[ds.length - 1] > trip.end_date)) {
          const { error } = await sb().rpc('extend_trip_dates', { p_trip: trip.id, p_from: ds[0], p_to: ds[ds.length - 1] });
          if (!error) setTrip((t) => (t ? { ...t, start_date: ds[0] < t.start_date ? ds[0] : t.start_date, end_date: ds[ds.length - 1] > t.end_date ? ds[ds.length - 1] : t.end_date } : t));
        }
      },
      saveTask: async (tk) => {
        const prev = data.tasks.find((x) => x.id === tk.id);
        await write('tasks', { id: tk.id, trip_id: trip.id, title: tk.title, assignee_id: tk.assignee_id, done: prev?.done ?? false, created_by: prev?.created_by ?? meId, created_at: prev?.created_at ?? new Date().toISOString() });
        if (tk.assignee_id && tk.assignee_id !== meId && tk.assignee_id !== prev?.assignee_id && me) {
          api('/api/notify', { code: trip.code, to: tk.assignee_id, title: `${me.name} gave you a task`, body: tk.title }).catch(() => {});
        }
      },
      toggleTask: async (id) => {
        const cur = data.tasks.find((x) => x.id === id); if (!cur) return;
        setData((d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === id ? { ...x, done: !x.done } : x)) }));
        const { error } = await sb().from('tasks').update({ done: !cur.done }).eq('id', id);
        if (error) { notify('You can only tick off tasks assigned to you.'); setData((d) => ({ ...d, tasks: d.tasks.map((x) => (x.id === id ? { ...x, done: cur.done } : x)) })); }
      },
      deleteTask: (id) => remove('tasks', id),
      newChat: async () => {
        await write('chat_sessions', { id: uid(), trip_id: trip.id, title: null, created_by: meId, created_at: new Date().toISOString() }, { insertOnly: true });
      },
      vote: async (messageId, index, multi) => {
        if (!meId) return;
        const mine = data.poll_votes.filter((v) => v.message_id === messageId && v.member_id === meId);
        const has = mine.find((v) => v.option_index === index);
        if (has) { await remove('poll_votes', has.id); return; }
        if (!multi) for (const v of mine) await remove('poll_votes', v.id);
        await write('poll_votes', { id: uid(), trip_id: trip.id, message_id: messageId, member_id: meId, option_index: index, created_at: new Date().toISOString() }, { insertOnly: true });
      },
      deleteTicket: async (tk) => {
        if (tk.image_path) await sb().storage.from(BUCKET).remove([tk.image_path]);
        await remove('tickets', tk.id);
      },
      deletePhoto: async (p) => {
        await sb().storage.from(BUCKET).remove([p.path]);
        await remove('photos', p.id);
      },
    };
  }, [status, trip, data, user?.id, toast, notify, write, remove]);

  if (status !== 'ready' || !value) return <StatusScreen status={status} />;
  return <TripCtx.Provider value={value}>{children}</TripCtx.Provider>;
}

function StatusScreen({ status }: { status: Status }) {
  return (
    <div className="center-screen">
      <div className="glass pad-lg stack" style={{ maxWidth: 420, textAlign: 'center' }}>
        {status === 'loading' && (<><div className="spinner" /><p className="muted">Opening your trip…</p></>)}
        {status === 'notfound' && (<><h2 className="serif big">Trip not found</h2><p className="muted">Check the invite code or link and try again.</p><a className="btn primary" href="/">Back home</a></>)}
        {status === 'error' && (<><h2 className="serif big">Couldn’t load the trip</h2><p className="muted">Check your connection, and that the database tables were created (supabase/schema.sql).</p><button className="btn primary" onClick={() => location.reload()}>Try again</button></>)}
      </div>
    </div>
  );
}
