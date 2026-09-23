'use client';
import { useEffect, useState } from 'react';

/** Opening animation: the W mark draws itself, the wordmark rises in, then it fades away. Tap to skip. */
export default function Splash() {
  const [out, setOut] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    try { sessionStorage.setItem('wander.splash', '1'); } catch {}
    const a = setTimeout(() => setOut(true), 2500);
    const b = setTimeout(() => setGone(true), 3200);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  if (gone) return null;
  const skip = () => { setOut(true); setTimeout(() => setGone(true), 600); };
  return (
    <div className={`splash ${out ? 'out' : ''}`} onClick={skip} role="presentation" aria-hidden>
      <div className="splash-blobs"><i /><i /><i /></div>
      <div className="splash-center">
        <svg className="splash-mark" viewBox="0 0 120 84" fill="none">
          <defs>
            <linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff7a59" /><stop offset="0.5" stopColor="#ffc46b" /><stop offset="1" stopColor="#c98bff" /></linearGradient>
          </defs>
          <path className="splash-ghost" d="M14 14 L37 70 L60 28 L83 70 L106 14" pathLength="1" />
          <path className="splash-stroke" d="M14 14 L37 70 L60 28 L83 70 L106 14" pathLength="1" />
        </svg>
        <div className="splash-word" aria-label="Wander">
          {'Wander'.split('').map((c, i) => <span key={i} style={{ animationDelay: `${1.05 + i * 0.07}s` }}>{c}</span>)}
        </div>
        <div className="splash-tag">plan · split · chat · remember</div>
      </div>
    </div>
  );
}
