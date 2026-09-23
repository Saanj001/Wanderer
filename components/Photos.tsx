'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { createPortal } from 'react-dom';
import { useTrip } from '@/lib/tripData';
import { photoUrl } from '@/lib/supabase';
import type { Photo } from '@/lib/types';
import { Avatar, Icon } from './ui';
import Studio from './Studio';

const safe = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'photo';
const extOf = (p: string) => p.split('.').pop() || 'jpg';

export default function Photos() {
  const t = useTrip();
  const input = useRef<HTMLInputElement>(null);
  const [who, setWho] = useState<string>('all');
  const [prog, setProg] = useState<{ d: number; n: number } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [view, setView] = useState<number | null>(null);
  const [zipping, setZipping] = useState(false);
  const [studio, setStudio] = useState<string[] | null>(null);

  const list = useMemo(() => [...t.photos].filter((p) => who === 'all' || p.member_id === who).sort((a, b) => b.created_at.localeCompare(a.created_at)), [t.photos, who]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    setProg({ d: 0, n: arr.length });
    await t.uploadPhotos(arr, (d, n) => setProg({ d, n }));
    setProg(null);
    if (input.current) input.current.value = '';
    t.notify(`${arr.length} photo${arr.length > 1 ? 's' : ''} added for everyone`);
  }

  async function downloadOne(p: Photo) {
    try {
      const blob = await (await fetch(photoUrl(p.path))).blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${safe(t.trip.name)}-${safe(t.member(p.member_id)?.name ?? 'trip')}-${p.id.slice(0, 6)}.${extOf(p.path)}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch { t.notify('Download failed. Try again.'); }
  }

  async function downloadSelected() {
    const chosen = t.photos.filter((p) => sel.includes(p.id));
    if (!chosen.length) return;
    if (chosen.length === 1) return downloadOne(chosen[0]);
    setZipping(true);
    try {
      const zip = new JSZip();
      await Promise.all(chosen.map(async (p, i) => {
        const blob = await (await fetch(photoUrl(p.path))).blob();
        zip.file(`${String(i + 1).padStart(3, '0')}-${safe(t.member(p.member_id)?.name ?? 'trip')}.${extOf(p.path)}`, blob);
      }));
      const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(out); a.download = `${safe(t.trip.name)}-photos.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      setSel([]); setSelecting(false);
    } catch { t.notify('Couldn’t build the zip. Try fewer photos.'); }
    setZipping(false);
  }

  const cur = view !== null ? list[view] : null;
  useEffect(() => {
    if (view === null) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setView(null);
      if (e.key === 'ArrowRight') setView((v) => (v !== null && v < list.length - 1 ? v + 1 : v));
      if (e.key === 'ArrowLeft') setView((v) => (v !== null && v > 0 ? v - 1 : v));
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [view, list.length]);

  return (
    <div className="stack">
      <section className="glass pad-lg stack-sm">
        <h2 className="serif big">Trip photos</h2>
        <p className="muted small">Everyone on the trip can add photos here, and anyone can download the ones they want.</p>
        <div className="row wrap" style={{ marginTop: 6 }}>
          {t.can('members_can_upload_photos') ? <button className="btn primary" onClick={() => input.current?.click()} disabled={!!prog}><Icon n="camera" size={18} /> Add photos</button> : <span className="muted small"><Icon n="lock" size={14} /> Uploads are limited by the admin.</span>}
          {list.length > 0 && <button className="btn" onClick={() => { setSelecting(!selecting); setSel([]); }}>{selecting ? 'Cancel' : 'Select'}</button>}
          {list.length > 0 && <button className="btn" onClick={() => setStudio([])}><Icon n="sparkle" size={16} /> Collage & reel</button>}
        </div>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
        {prog && <div className="stack-sm"><div className="progress"><i style={{ width: `${(prog.d / prog.n) * 100}%` }} /></div><span className="muted small">Uploading {prog.d} of {prog.n}…</span></div>}
      </section>

      {t.photos.length > 0 && (
        <div className="chips">
          <button className={`chip ${who === 'all' ? 'on' : ''}`} onClick={() => setWho('all')}>Everyone · {t.photos.length}</button>
          {t.members.filter((m) => t.photos.some((p) => p.member_id === m.id)).map((m) => (
            <button key={m.id} className={`chip ${who === m.id ? 'on' : ''}`} onClick={() => setWho(m.id)}>{m.name} · {t.photos.filter((p) => p.member_id === m.id).length}</button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <div className="glass empty stack-sm"><span style={{ fontSize: 32 }}>📸</span><b>No photos yet</b><span className="small">Add the first one from your gallery.</span></div>
      ) : (
        <div className="masonry">
          {list.map((p, i) => {
            const on = sel.includes(p.id), m = t.member(p.member_id);
            return (
              <button key={p.id} className="ph" style={p.width && p.height ? { aspectRatio: `${p.width} / ${p.height}` } : undefined}
                onClick={() => (selecting ? setSel(on ? sel.filter((x) => x !== p.id) : [...sel, p.id]) : setView(i))}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(p.path)} alt={`Trip photo by ${m?.name ?? 'a friend'}`} loading="lazy" decoding="async" />
                {selecting && <span className={`sel ${on ? 'on' : ''}`}>{on && <Icon n="check" size={16} />}</span>}
                {m && <span className="by"><Avatar m={m} size={18} />{m.name}</span>}
              </button>
            );
          })}
        </div>
      )}

      {selecting && (
        <div className="selbar glass">
          <span className="small"><b>{sel.length}</b> selected</span>
          <div className="row">
            <button className="btn sm" onClick={() => setSel(sel.length === list.length ? [] : list.map((p) => p.id))}>{sel.length === list.length ? 'None' : 'All'}</button>
            <button className="btn sm" disabled={!sel.length} onClick={() => setStudio(sel)}><Icon n="sparkle" size={15} /> Create</button>
            <button className="btn sm primary" disabled={!sel.length || zipping} onClick={downloadSelected}><Icon n="download" size={16} /> {zipping ? 'Zipping…' : 'Download'}</button>
          </div>
        </div>
      )}

      {studio && <Studio initial={studio} onClose={() => setStudio(null)} />}

      {cur && typeof document !== 'undefined' && createPortal(
        <div className="lightbox" role="dialog" aria-modal>
          <div className="lb-bar">
            <button className="icon-btn" onClick={() => setView(null)} aria-label="Close"><Icon n="x" /></button>
            <span className="muted small num">{view! + 1} / {list.length}</span>
            <button className="icon-btn" onClick={() => downloadOne(cur)} aria-label="Download"><Icon n="download" /></button>
          </div>
          <div className="lb-img" onClick={() => setView(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(cur.path)} alt="" onClick={(e) => e.stopPropagation()} />
          </div>
          <div className="lb-foot">
            <div className="row"><Avatar m={t.member(cur.member_id)} size={28} /><span className="small">{t.member(cur.member_id)?.name ?? 'A friend'}</span></div>
            <div className="row">
              <button className="btn sm" disabled={view === 0} onClick={() => setView(view! - 1)}>Prev</button>
              <button className="btn sm" disabled={view === list.length - 1} onClick={() => setView(view! + 1)}>Next</button>
              {(cur.member_id === t.me?.id || t.isAdmin) && <button className="btn sm danger" onClick={async () => { if (confirm('Delete this photo for everyone?')) { await t.deletePhoto(cur); setView(null); } }}><Icon n="trash" size={16} /></button>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
