'use client';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Field } from './ui';

/** Log in / sign up / forgot password. `intro` lets the invite page reuse it. */
export default function AuthForm({ start = 'signup', name: presetName, onDone }: { start?: 'login' | 'signup'; name?: string; onDone?: () => void }) {
  const a = useAuth();
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>(start);
  const [name, setName] = useState(presetName ?? '');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [upi, setUpi] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  async function submit() {
    setErr(''); setNote(''); setBusy(true);
    let r: string | null = null;
    if (mode === 'login') r = await a.signIn(email, pw);
    else if (mode === 'signup') {
      if (!name.trim()) { setErr('Add your name so friends know who you are.'); setBusy(false); return; }
      r = await a.signUp({ email, password: pw, name, upi });
    } else {
      r = await a.requestReset(email);
      if (!r) { setNote('If that email has an account, a reset link is on its way. It can take a minute. Check spam too. Or ask your trip admin to set a temporary password for you.'); setBusy(false); return; }
    }
    setBusy(false);
    if (r === 'CONFIRM_EMAIL') { setNote('Almost there: we emailed you a link. Tap it, then log in here.'); setMode('login'); return; }
    if (r) { setErr(r); return; }
    onDone?.();
  }

  return (
    <div className="glass pad-lg stack">
      <div className="seg" role="tablist">
        <button className={mode === 'signup' ? 'on' : ''} onClick={() => { setMode('signup'); setErr(''); setNote(''); }}>Create account</button>
        <button className={mode !== 'signup' ? 'on' : ''} onClick={() => { setMode('login'); setErr(''); setNote(''); }}>Log in</button>
      </div>
      {mode === 'forgot' && <p className="muted small">Enter your email and we’ll send a link to choose a new password.</p>}
      {mode === 'signup' && <Field label="Your name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aarav" autoComplete="name" /></Field>}
      <Field label="Email"><input type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></Field>
      {mode !== 'forgot' && (
        <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
          <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="••••••••" />
        </Field>
      )}
      {mode === 'signup' && <Field label="UPI ID (optional)" hint="So friends can pay you back. You can add it later."><input value={upi} onChange={(e) => setUpi(e.target.value)} autoCapitalize="none" placeholder="yourname@bank" /></Field>}
      {err && <p className="bad small">{err}</p>}
      {note && <p className="good small">{note}</p>}
      <button className="btn primary" disabled={busy || !email || (mode !== 'forgot' && !pw)} onClick={submit}>
        {busy ? 'One moment…' : mode === 'signup' ? 'Create my account' : mode === 'login' ? 'Log in' : 'Send reset link'}
      </button>
      {mode === 'login' && <button className="small muted" onClick={() => { setMode('forgot'); setErr(''); setNote(''); }}>Forgot password?</button>}
      {mode === 'forgot' && <button className="small muted" onClick={() => setMode('login')}>Back to log in</button>}
    </div>
  );
}
