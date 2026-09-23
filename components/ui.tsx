'use client';
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Member } from '@/lib/types';
import { photoUrl } from '@/lib/supabase';
import { initials } from '@/lib/utils';

const P: Record<string, string> = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  wallet: 'M3 7h15a3 3 0 013 3v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm0 0l2-3h11M16 14h2',
  chat: 'M4 5h16v11H9l-5 4z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5a1 1 0 100-2 1 1 0 000 2',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  share: 'M12 3v12M8 7l4-4 4 4M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  check: 'M5 12l5 5 9-10',
  users: 'M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7M21 20v-1a4 4 0 00-3-3.9M15.5 4.2a3.5 3.5 0 010 6.6',
  send: 'M4 12l16-8-6 16-3-7z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  compass: 'M12 21a9 9 0 100-18 9 9 0 000 18zM15.5 8.5l-2 5-5 2 2-5z',
  camera: 'M4 8h4l2-3h4l2 3h4v11H4zM12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7',
  video: 'M3 7h11v10H3zM14 11l6-3v8l-6-3',
  chevron: 'M6 9l6 6 6-6',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.5-2.3 1a7 7 0 00-2-1.2L14 3h-4l-.6 2.6a7 7 0 00-2 1.2l-2.3-1-2 3.5 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.3-1c.6.5 1.3.9 2 1.2L10 21h4l.6-2.6c.7-.3 1.4-.7 2-1.2l2.3 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2z',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 018 0v3',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
};
export function Icon({ n, size = 20 }: { n: keyof typeof P | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[n]} />
    </svg>
  );
}

export function Avatar({ m, size = 34, ai = false }: { m?: (Pick<Member, 'name' | 'color'> & { avatar_path?: string | null }) | null; size?: number; ai?: boolean }) {
  if (ai) return <span className="avatar ai" style={{ width: size, height: size }}><Icon n="sparkle" size={size * 0.5} /></span>;
  if (m?.avatar_path) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="avatar" src={photoUrl(m.avatar_path)} alt={m.name} title={m.name} style={{ width: size, height: size, objectFit: 'cover' }} />;
  }
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: m ? `linear-gradient(135deg, ${m.color}, ${m.color}99)` : '#444' }} title={m?.name}>
      {m ? initials(m.name) : '?'}
    </span>
  );
}

export function Sheet({ open, onClose, title, children, actions }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', k); };
  }, [open, onClose]);
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="sheet-wrap" onClick={onClose} role="dialog" aria-modal aria-label={title}>
      <div className="sheet glass-strong" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h3 className="serif">{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon n="x" /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {actions && <div className="sheet-actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.v} role="tab" aria-selected={value === o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Renders **bold**, links and line breaks from AI / chat text. */
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+|@[\p{L}\p{N}_]+)/gu).map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>{part.replace(/^https?:\/\/(www\.)?/, '').slice(0, 42)}</a>;
        if (/^@[\p{L}\p{N}_]+$/u.test(part)) return <span key={i} className={part.toLowerCase() === '@ai' ? 'mention ai' : 'mention'}>{part}</span>;
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

export function Ring({ pct, size = 92, children }: { pct: number; size?: number; children?: React.ReactNode }) {
  const r = (size - 12) / 2, c = 2 * Math.PI * r, over = pct > 1;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffb36b" /><stop offset="1" stopColor="#c98bff" /></linearGradient>
          <linearGradient id="rgo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff5e5e" /><stop offset="1" stopColor="#ff9a5e" /></linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={over ? 'url(#rgo)' : 'url(#rg)'} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${Math.min(1, pct) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .7s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <div className="ring-in">{children}</div>
    </div>
  );
}
