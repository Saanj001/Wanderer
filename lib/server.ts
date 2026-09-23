// Server-only helpers (API routes). Never import this from client components.
export const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
export const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** Headers for the service key. New-style keys (sb_secret_…) go in `apikey` only; legacy JWT keys also go in Authorization. */
export function svcHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { apikey: SB_SERVICE, 'Content-Type': 'application/json', ...extra };
  if (!SB_SERVICE.startsWith('sb_')) h.Authorization = `Bearer ${SB_SERVICE}`;
  return h;
}

/** PostgREST call with the service role (bypasses RLS). */
export function svc(path: string, init: RequestInit = {}) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    ...init, cache: 'no-store',
    headers: svcHeaders({ Prefer: 'return=representation', ...((init.headers as Record<string, string>) || {}) }),
  });
}

export function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

export async function userFromToken(token: string | null): Promise<{ id: string; email?: string } | null> {
  if (!token) return null;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_ANON, Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.id ? { id: j.id, email: j.email } : null;
  } catch { return null; }
}

/** Confirms the caller is signed in AND belongs to the trip with this code. */
export async function requireMember(req: Request, code: string): Promise<{ userId: string; tripId: string; memberId: string; role: string } | null> {
  if (!/^[A-Z0-9]{6,12}$/i.test(code || '')) return null;
  const token = bearer(req);
  const user = await userFromToken(token);
  if (!user) return null;
  const h = { apikey: SB_ANON, Authorization: `Bearer ${token}` };
  try {
    const t = await (await fetch(`${SB_URL}/rest/v1/trips?code=eq.${code.toUpperCase()}&select=id`, { headers: h, cache: 'no-store' })).json();
    if (!Array.isArray(t) || !t[0]) return null;
    const m = await (await fetch(`${SB_URL}/rest/v1/members?trip_id=eq.${t[0].id}&user_id=eq.${user.id}&select=id,role`, { headers: h, cache: 'no-store' })).json();
    if (!Array.isArray(m) || !m[0]) return null;
    return { userId: user.id, tripId: t[0].id, memberId: m[0].id, role: m[0].role };
  } catch { return null; }
}
