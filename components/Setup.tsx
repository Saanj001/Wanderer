export default function Setup() {
  return (
    <div className="center-screen">
      <div className="glass pad-lg stack" style={{ maxWidth: 480 }}>
        <h2 className="serif big">One quick setup</h2>
        <p className="muted">Wander needs a Supabase project for shared data, live sync and photo storage. Add these two variables (locally in <b>.env.local</b>, or in Vercel → Settings → Environment Variables), then redeploy:</p>
        <div className="inner pad small" style={{ fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
          NEXT_PUBLIC_SUPABASE_URL<br />NEXT_PUBLIC_SUPABASE_ANON_KEY
        </div>
        <p className="muted small">Then run <b>supabase/schema.sql</b> once in the Supabase SQL editor. The README has the full steps.</p>
      </div>
    </div>
  );
}
