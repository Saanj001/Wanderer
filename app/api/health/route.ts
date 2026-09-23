import { NextResponse } from 'next/server';
import { SB_SERVICE, SB_URL, svc, svcHeaders } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Open https://<your-site>/api/health to see what's configured and whether the AI answers.
export async function GET() {
  const gKey = process.env.GEMINI_API_KEY;
  const out: Record<string, unknown> = {
    supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    vapidPublic: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    vapidPrivate: !!process.env.VAPID_PRIVATE_KEY,
    giphyKey: !!process.env.GIPHY_API_KEY,
    groupCallServer: !!(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET),
    geminiKey: !!gKey,
  };
  if (SB_SERVICE) {
    out.serviceKeyStyle = SB_SERVICE.startsWith('sb_secret_') ? 'new (sb_secret_…)' : SB_SERVICE.startsWith('eyJ') ? 'legacy JWT' : 'unrecognised: check it is the service_role / secret key, not anon';
    try { const r = await svc('trips?select=id&limit=1'); out.serviceKeyReadsDatabase = r.ok; } catch { out.serviceKeyReadsDatabase = false; }
    out.serverCreatesAccounts = SB_SERVICE.startsWith('eyJ') ? 'yes (legacy service_role key)' : 'no: sign-up uses Supabase’s normal flow, so “Confirm email” must be OFF in Supabase';
    void svcHeaders; void SB_URL;
  }
  if (gKey) {
    try {
      const lm = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': gKey }, cache: 'no-store' });
      out.listModelsStatus = lm.status;
      let names: string[] = [];
      if (lm.ok) names = ((await lm.json()).models || []).filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes('generateContent')).map((m: { name: string }) => m.name.replace('models/', ''));
      else out.listModelsError = ((await lm.json().catch(() => ({})))?.error?.message || '').slice(0, 200);
      out.modelsAvailable = names.filter((n) => /flash|pro/.test(n)).slice(0, 12);
      const tests: Record<string, string> = {};
      for (const m of ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash']) {
        try {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': gKey }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ok' }] }] }) });
          tests[m] = r.ok ? 'works' : `${r.status}: ${((await r.json().catch(() => ({})))?.error?.message || '').slice(0, 120)}`;
        } catch (e) { tests[m] = String(e).slice(0, 80); }
      }
      out.modelTests = tests;
    } catch (e) { out.error = String(e).slice(0, 200); }
  }
  return NextResponse.json(out);
}
