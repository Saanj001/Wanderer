'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Field } from '@/components/ui';

export default function ResetPage() {
  const a = useAuth();
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  return (
    <main className="landing">
      <h1 style={{ fontSize: 'clamp(42px, 12vw, 68px)' }}>New password</h1>
      {a.loading ? <div className="spinner" /> : !a.recovery && !a.user ? (
        <div className="glass pad-lg stack"><p className="muted">Open this page from the link in your reset email. If it expired, request a new one from the log in screen.</p><a className="btn primary" href="/">Back to log in</a></div>
      ) : done ? (
        <div className="glass pad-lg stack"><p className="good">Password changed. You’re logged in.</p><a className="btn primary" href="/">Continue</a></div>
      ) : (
        <div className="glass pad-lg stack">
          <Field label="Choose a new password" hint="At least 8 characters."><input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          {msg && <p className="bad small">{msg}</p>}
          <button className="btn primary" disabled={pw.length < 8} onClick={async () => { const e = await a.setNewPassword(pw); if (e) setMsg(e); else setDone(true); }}>Save password</button>
        </div>
      )}
    </main>
  );
}
