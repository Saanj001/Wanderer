'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { compress } from '@/lib/tripData';
import { validUpi } from '@/lib/utils';
import { Avatar, Field, Icon, Sheet } from './ui';

/** "My account": photo, name, UPI, password, log out. Works inside or outside a trip. */
export default function Account({ color = '#ffb36b', onClose, extra }: { color?: string; onClose: () => void; extra?: React.ReactNode }) {
  const a = useAuth();
  const [name, setName] = useState(a.profile?.name ?? '');
  const [upi, setUpi] = useState(a.profile?.upi_id ?? '');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const bad = upi.trim() !== '' && !validUpi(upi);
  useEffect(() => { setName(a.profile?.name ?? ''); setUpi(a.profile?.upi_id ?? ''); }, [a.profile?.name, a.profile?.upi_id]);

  async function pick(f?: File) {
    if (!f) return;
    setBusy(true);
    const { blob } = await compress(f, 600, 0.85);
    const e = await a.uploadAvatar(blob);
    setMsg(e ?? 'Photo updated');
    setBusy(false);
  }

  return (
    <Sheet open onClose={onClose} title="My account" actions={
      <button className="btn primary" disabled={busy || !name.trim() || bad} onClick={async () => { setBusy(true); const e = await a.saveProfile({ name: name.trim(), upi_id: upi.trim() || null }); setMsg(e ?? 'Saved'); setBusy(false); }}>Save details</button>
    }>
      <div className="row" style={{ gap: 16 }}>
        <Avatar m={{ name: a.profile?.name ?? '?', color, avatar_path: a.profile?.avatar_path }} size={72} />
        <div className="stack-sm">
          <b>{a.profile?.name}</b>
          <span className="muted small">{a.user?.email}</span>
          <button className="btn sm" disabled={busy} onClick={() => file.current?.click()}><Icon n="camera" size={15} /> Change photo</button>
        </div>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      {msg && <p className="good small">{msg}</p>}
      <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Email" hint="This is your login. It can’t be changed here."><input value={a.user?.email ?? ''} disabled readOnly /></Field>
      <Field label="UPI ID (optional)" hint="Friends use this to pay you from the Split tab."><input value={upi} placeholder="yourname@bank" autoCapitalize="none" onChange={(e) => setUpi(e.target.value)} /></Field>
      {bad && <p className="bad small">That doesn’t look like a UPI ID yet.</p>}
      {extra}
      <div className="stack-sm">
        <span className="field-label">Change password</span>
        <div className="row"><input type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button className="btn" disabled={pw.length < 8} onClick={async () => { const e = await a.setNewPassword(pw); setMsg(e ?? 'Password changed'); setPw(''); }}>Update</button></div>
      </div>
      <button className="btn danger" onClick={async () => { await a.signOut(); location.href = '/'; }}>Log out</button>
    </Sheet>
  );
}
