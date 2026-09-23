import { NextRequest, NextResponse } from 'next/server';
import { SB_SERVICE, SB_URL, requireMember, svc, svcHeaders } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Lets a trip admin set a temporary password for a member who is locked out.
export async function POST(req: NextRequest) {
  if (!SB_SERVICE) return NextResponse.json({ error: 'Server isn’t set up for this yet (SUPABASE_SERVICE_ROLE_KEY).' }, { status: 503 });
  const b = await req.json().catch(() => ({})) as { code?: string; memberId?: string; password?: string };
  const who = await requireMember(req, String(b.code || ''));
  if (!who || who.role !== 'admin') return NextResponse.json({ error: 'Only admins can do this.' }, { status: 403 });
  if (!b.password || b.password.length < 8) return NextResponse.json({ error: 'Use at least 8 characters.' }, { status: 400 });
  const m = await (await svc(`members?id=eq.${encodeURIComponent(String(b.memberId))}&trip_id=eq.${who.tripId}&select=user_id`)).json();
  const uid = Array.isArray(m) && m[0]?.user_id;
  if (!uid) return NextResponse.json({ error: 'That person hasn’t created an account yet.' }, { status: 400 });
  const r = await fetch(`${SB_URL}/auth/v1/admin/users/${uid}`, { method: 'PUT', headers: svcHeaders(), body: JSON.stringify({ password: b.password }) });
  if (!r.ok) return NextResponse.json({ error: 'Couldn’t change the password.' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
