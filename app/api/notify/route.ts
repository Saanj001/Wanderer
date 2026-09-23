import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { SB_SERVICE, requireMember, svc } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sends a push to everyone on the trip except the sender (chat messages, calls, admin announcements).
export async function POST(req: NextRequest) {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv || !SB_SERVICE) return NextResponse.json({ sent: 0, reason: 'push not configured' });
  const b = await req.json().catch(() => ({})) as { code?: string; title?: string; body?: string; to?: string; except?: string[] };
  const who = await requireMember(req, String(b.code || ''));
  if (!who) return NextResponse.json({ sent: 0 }, { status: 403 });
  const subs = (await (await svc(`push_subscriptions?trip_id=eq.${who.tripId}&select=*`)).json()) as { id: string; member_id: string | null; endpoint: string; p256dh: string; auth: string }[];
  const mem = (await (await svc(`members?trip_id=eq.${who.tripId}&select=id,perms`)).json()) as { id: string; perms: { gets_notifications?: boolean } | null }[];
  const muted = new Set((Array.isArray(mem) ? mem : []).filter((m) => m.perms?.gets_notifications === false).map((m) => m.id));
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hello@example.com', pub, priv);
  const payload = JSON.stringify({ title: String(b.title || 'Wander').slice(0, 80), body: String(b.body || '').slice(0, 160), url: `/t/${String(b.code).toUpperCase()}`, tag: `chat-${who.tripId}` });
  let sent = 0;
  await Promise.all((Array.isArray(subs) ? subs : []).filter((s) => (b.to ? s.member_id === b.to : s.member_id !== who.memberId && !(s.member_id && (b.except ?? []).includes(s.member_id))) && !(s.member_id && muted.has(s.member_id))).map(async (s) => {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 600 }); sent++; }
    catch (e) { const sc = (e as { statusCode?: number }).statusCode; if (sc === 404 || sc === 410) await svc(`push_subscriptions?id=eq.${s.id}`, { method: 'DELETE' }); }
  }));
  return NextResponse.json({ sent, devices: (Array.isArray(subs) ? subs : []).length });
}
