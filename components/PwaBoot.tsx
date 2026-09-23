'use client';
import { useEffect, useState } from 'react';
import { platform, useInstall } from '@/lib/install';
import { Icon } from './ui';
import { InstallHelp } from './Install';

const DISMISS = 'wander.install.dismissed';

/** Registers the service worker, hides the nav while the keyboard is open, and shows a one-time install banner. */
export default function PwaBoot() {
  const i = useInstall();
  const [dismissed, setDismissed] = useState(true);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
    try { setDismissed(Number(localStorage.getItem(DISMISS) || 0) > Date.now() - 3 * 864e5); } catch { setDismissed(false); }
    const fin = (e: FocusEvent) => { const t = e.target as HTMLElement; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) document.body.classList.add('kb'); };
    const fout = () => document.body.classList.remove('kb');
    document.addEventListener('focusin', fin); document.addEventListener('focusout', fout);
    return () => { document.removeEventListener('focusin', fin); document.removeEventListener('focusout', fout); };
  }, []);

  const p = platform();
  if (i.installed || dismissed || !(i.canPrompt || p.ios || p.android)) return null;
  const close = () => { try { localStorage.setItem(DISMISS, String(Date.now())); } catch {} setDismissed(true); };
  return (
    <>
      <div className="install glass" role="dialog" aria-label="Install Wander">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={44} height={44} style={{ borderRadius: 12 }} />
        <div className="grow"><b>Install Wander</b><div className="muted small">Add it to your home screen for a full-screen app.</div></div>
        <button className="btn sm primary" onClick={async () => { if (i.canPrompt) { await i.prompt(); close(); } else setHelp(true); }}>Install</button>
        <button className="icon-btn sm" onClick={close} aria-label="Dismiss"><Icon n="x" size={16} /></button>
      </div>
      {help && <InstallHelp onClose={() => setHelp(false)} />}
    </>
  );
}
