import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { SB_SERVICE, requireMember, svc } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

// Gives a signed-in trip member a token for the group-call server (LiveKit), so calls with many people stay smooth.
export async function POST(req: NextRequest) {
  const url = process.env.LIVEKIT_URL, key = process.env.LIVEKIT_API_KEY, secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const b = await req.json().catch(() => ({})) as { code?: string };
  const who = await requireMember(req, String(b.code || ''));
  if (!who) return NextResponse.json({ error: 'Please log in to this trip.' }, { status: 403 });
  let name = 'Friend';
  if (SB_SERVICE) {
    const m = await (await svc(`members?id=eq.${who.memberId}&select=name`)).json();
    if (Array.isArray(m) && m[0]?.name) name = m[0].name;
  }
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64({ iss: key, sub: who.memberId, name, iat: now, nbf: now - 10, exp: now + 3 * 3600, video: { room: `wander-${who.tripId}`, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true } });
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return NextResponse.json({ token: `${head}.${body}.${sig}`, url: url.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:') });
}
