import { NextRequest, NextResponse } from 'next/server';
import { SB_ANON, SB_SERVICE, SB_URL, svc, svcHeaders } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Creates an account that is already confirmed (no email step), so friends can join instantly.
export async function POST(req: NextRequest) {
  // Supabase's auth admin API only accepts the legacy service_role JWT (starts with eyJ). New sb_secret_ keys can't create users here.
  if (!SB_SERVICE || !SB_URL || !SB_SERVICE.startsWith('eyJ')) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  let b: { email?: string; password?: string; name?: string; upi?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }); }
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const name = String(b.name || '').trim().slice(0, 60);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Use a password with at least 8 characters.' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'Add your name.' }, { status: 400 });

  const r = await fetch(`${SB_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: svcHeaders(),
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name } }),
  });
  const j = await r.json().catch(() => ({}));
  // key rejected by the auth server → let the app fall back to the standard sign-up
  if (r.status === 401 || r.status === 403) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  if (!r.ok) {
    const msg = String(j?.msg || j?.message || j?.error_description || '');
    if (r.status === 422 || /already|registered|exists/i.test(msg)) return NextResponse.json({ error: 'exists' }, { status: 409 });
    return NextResponse.json({ error: msg || 'Could not create the account.' }, { status: 400 });
  }
  await svc('profiles', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: j.id, name, upi_id: String(b.upi || '').trim() || null }) });
  void SB_ANON;
  return NextResponse.json({ ok: true });
}
