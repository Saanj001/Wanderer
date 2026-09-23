'use client';
import { useState } from 'react';
import { platform, useInstall } from '@/lib/install';
import { Icon, Sheet } from './ui';

/** "Install Wander" prompt for everyone: one tap where the browser allows it, clear steps where it doesn't. */
export function InstallCard() {
  const i = useInstall();
  const [help, setHelp] = useState(false);
  if (i.installed) return null;
  return (
    <>
      <div className="glass pad row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={46} height={46} style={{ borderRadius: 12, flex: 'none' }} />
        <div className="grow"><b>Get the Wander app</b><div className="muted small">Full screen, its own icon, and trip notifications.</div></div>
        <button className="btn primary sm" onClick={async () => { if (i.canPrompt) await i.prompt(); else setHelp(true); }}>Install</button>
      </div>
      {help && <InstallHelp onClose={() => setHelp(false)} />}
    </>
  );
}

export function InstallRow() {
  const i = useInstall();
  const [help, setHelp] = useState(false);
  if (i.installed) return <p className="small good"><Icon n="check" size={14} /> Wander is installed on this phone.</p>;
  return (
    <>
      <button className="btn" onClick={async () => { if (i.canPrompt) await i.prompt(); else setHelp(true); }}><Icon n="download" size={17} /> Install Wander as an app</button>
      {help && <InstallHelp onClose={() => setHelp(false)} />}
    </>
  );
}

export function InstallHelp({ onClose }: { onClose: () => void }) {
  const p = platform();
  return (
    <Sheet open onClose={onClose} title="Install Wander">
      {p.inApp && <div className="inner pad small">⚠️ You’re inside another app’s browser (WhatsApp, Instagram…). Open this page in <b>{p.ios ? 'Safari' : 'Chrome'}</b> first (⋯ menu → “Open in browser”), then install.</div>}
      {p.ios ? (
        <ol className="steps">
          <li>Tap the <b>Share</b> button (square with an arrow) in Safari.</li>
          <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
          <li>Tap <b>Add</b>. Open Wander from your home screen.</li>
        </ol>
      ) : p.android ? (
        <ol className="steps">
          <li>Tap the <b>⋮ menu</b> at the top right of Chrome.</li>
          <li>Tap <b>Install app</b> (or <b>Add to Home screen</b>).</li>
          <li>Tap <b>Install</b>. Wander appears with your other apps.</li>
        </ol>
      ) : (
        <ol className="steps">
          <li>In Chrome or Edge, click the <b>install icon</b> at the right of the address bar (or ⋮ menu → <b>Install Wander</b>).</li>
          <li>Confirm. Wander opens in its own window.</li>
        </ol>
      )}
      <p className="muted small">Once installed you also get trip notifications, even when the browser is closed. On iPhone that only works from the home-screen app.</p>
    </Sheet>
  );
}
