'use client';
import { api } from '@/lib/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTrip } from '@/lib/tripData';
import { photoUrl } from '@/lib/supabase';
import { fmtRange, todayISO } from '@/lib/utils';
import { Icon, Sheet } from './ui';

type Layout = 'grid' | 'hero' | 'polaroid';
type Fmt = 'post' | 'story';

const cache = new Map<string, ImageBitmap>();
async function load(path: string): Promise<ImageBitmap> {
  const hit = cache.get(path); if (hit) return hit;
  const blob = await (await fetch(photoUrl(path))).blob();
  const bmp = await createImageBitmap(blob);
  cache.set(path, bmp);
  return bmp;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (r > 0 && 'roundRect' in ctx) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
function cover(ctx: CanvasRenderingContext2D, img: ImageBitmap, x: number, y: number, w: number, h: number, r = 0, zoom = 1, ox = 0, oy = 0) {
  const s = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * s, dh = img.height * s;
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2 + ox, y + (h - dh) / 2 + oy, dw, dh);
  ctx.restore();
}
function bg(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = '#08070c'; ctx.fillRect(0, 0, W, H);
  const blob = (x: number, y: number, r: number, c: string) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
  blob(W * 0.1, H * 0.05, W * 0.9, 'rgba(255,106,69,.75)');
  blob(W * 0.95, H * 0.3, W * 0.8, 'rgba(138,77,255,.7)');
  blob(W * 0.2, H * 0.98, W * 0.8, 'rgba(18,181,176,.55)');
  blob(W * 0.95, H * 0.95, W * 0.5, 'rgba(255,196,107,.45)');
}
function grain(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.save(); ctx.globalAlpha = 0.05;
  for (let i = 0; i < 2600; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#000'; ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  ctx.restore();
}
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS = '"Bricolage Grotesque Variable", system-ui, sans-serif';

function drawCollage(ctx: CanvasRenderingContext2D, W: number, H: number, imgs: ImageBitmap[], layout: Layout, title: string, sub: string) {
  bg(ctx, W, H);
  const M = 54, top = W > 1000 && H > 1500 ? 260 : 200, gap = 16;
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
  ctx.font = `92px ${SERIF}`; ctx.fillText(title.slice(0, 22), M, top - 110);
  ctx.font = `600 32px ${SANS}`; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText(sub.slice(0, 44), M, top - 56);
  const ax = M, ay = top, aw = W - 2 * M, ah = H - top - M - 50, n = imgs.length;
  if (layout === 'grid') {
    const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
    const cw = (aw - gap * (cols - 1)) / cols, ch = (ah - gap * (rows - 1)) / rows;
    imgs.forEach((im, i) => cover(ctx, im, ax + (i % cols) * (cw + gap), ay + Math.floor(i / cols) * (ch + gap), cw, ch, 28));
  } else if (layout === 'hero') {
    const bigH = n === 1 ? ah : ah * 0.62;
    cover(ctx, imgs[0], ax, ay, aw, bigH, 32);
    const rest = imgs.slice(1, 4), c = rest.length;
    if (c) { const cw = (aw - gap * (c - 1)) / c; rest.forEach((im, i) => cover(ctx, im, ax + i * (cw + gap), ay + bigH + gap, cw, ah - bigH - gap, 24)); }
  } else {
    const cols = n <= 2 ? 1 : 2, rows = Math.ceil(n / cols);
    const cw = aw / cols, ch = ah / rows;
    imgs.forEach((im, i) => {
      const fw = Math.min(cw * 0.9, ch * 0.78), fh = fw * 1.18;
      const cx = ax + (i % cols) * cw + cw / 2, cy = ay + Math.floor(i / cols) * ch + ch / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate((((i * 37) % 11) - 5) * 0.021);
      ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 12;
      ctx.fillStyle = '#fdfbf7'; ctx.fillRect(-fw / 2, -fh / 2, fw, fh); ctx.shadowColor = 'transparent';
      cover(ctx, im, -fw / 2 + 16, -fh / 2 + 16, fw - 32, fh - 32 - 54, 0);
      ctx.restore();
    });
  }
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = `600 26px ${SANS}`; ctx.fillText('made with Wander', W - M - 220, H - M + 4);
  grain(ctx, W, H);
}

function pickMime() {
  const list = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  return typeof MediaRecorder !== 'undefined' ? list.find((m) => MediaRecorder.isTypeSupported(m)) : undefined;
}

export default function Studio({ initial, onClose }: { initial: string[]; onClose: () => void }) {
  const t = useTrip();
  const photos = useMemo(() => [...t.photos].sort((a, b) => b.created_at.localeCompare(a.created_at)), [t.photos]);
  const [sel, setSel] = useState<string[]>(initial.length ? initial.slice(0, 12) : photos.slice(0, 6).map((p) => p.id));
  const [mode, setMode] = useState<'collage' | 'reel'>('collage');
  const [layout, setLayout] = useState<Layout>('grid');
  const [fmt, setFmt] = useState<Fmt>('post');
  const [speed, setSpeed] = useState(2.2);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [reel, setReel] = useState<{ url: string; ext: string } | null>(null);
  const [mood, setMood] = useState('fun and nostalgic');
  const [cap, setCap] = useState<{ captions: string[]; hashtags: string[] } | null>(null);
  const [capBusy, setCapBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const token = useRef(0);

  const chosen = useMemo(() => sel.map((id) => photos.find((p) => p.id === id)).filter(Boolean) as typeof photos, [sel, photos]);
  const title = t.trip.name, sub = `${t.trip.destination.split(',')[0]} · ${fmtRange(t.trip.start_date, t.trip.end_date)}`;
  const W = 1080, H = fmt === 'post' ? 1350 : 1920;

  // live collage preview
  useEffect(() => {
    if (mode !== 'collage' || !chosen.length) return;
    const my = ++token.current;
    (async () => {
      try {
        await Promise.all([document.fonts.load(`92px "Instrument Serif"`), document.fonts.load(`600 32px "Bricolage Grotesque Variable"`)]);
        const imgs = await Promise.all(chosen.map((p) => load(p.path)));
        if (my !== token.current || !canvas.current) return;
        const c = canvas.current; c.width = W; c.height = H;
        drawCollage(c.getContext('2d')!, W, H, imgs, layout, title, sub);
      } catch { t.notify('Couldn’t load those photos.'); }
    })();
  }, [mode, chosen, layout, fmt, W, H, title, sub]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 12 ? s : [...s, id]));

  async function saveCollage() {
    const c = canvas.current; if (!c) return;
    const blob: Blob = await new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.93));
    await deliver(blob, `${title.replace(/\W+/g, '-')}-collage.jpg`);
  }
  async function deliver(blob: Blob, name: string) {
    const file = new File([blob], name, { type: blob.type });
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title }); return; } } catch { /* user cancelled → fall through to download */ }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  async function makeReel() {
    const mime = pickMime();
    if (!mime) { t.notify('This browser can’t record videos. Try Chrome or Safari.'); return; }
    setBusy(true); setReel(null); setProg(0);
    try {
      await Promise.all([document.fonts.load(`110px "Instrument Serif"`), document.fonts.load(`600 36px "Bricolage Grotesque Variable"`)]);
      const imgs = await Promise.all(chosen.map((p) => load(p.path)));
      const c = canvas.current!; c.width = 1080; c.height = 1920;
      const ctx = c.getContext('2d')!;
      const intro = 1.8, outro = 1.8, per = speed, fade = 0.45, total = intro + per * imgs.length + outro;
      const drawFrame = (tt: number) => {
        if (tt < intro) {
          bg(ctx, 1080, 1920); ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
          const a = Math.min(1, tt / 0.6); ctx.globalAlpha = a;
          ctx.font = `120px ${SERIF}`; ctx.fillText(title.slice(0, 18), 70, 900);
          ctx.font = `600 38px ${SANS}`; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillText(sub.slice(0, 40), 70, 970); ctx.globalAlpha = 1; return;
        }
        if (tt >= total - outro) {
          bg(ctx, 1080, 1920); ctx.fillStyle = '#fff'; ctx.font = `110px ${SERIF}`; ctx.fillText('Until next time', 70, 930);
          ctx.font = `600 34px ${SANS}`; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText(`${t.members.map((m) => m.name.split(' ')[0]).slice(0, 6).join(' · ')}`, 70, 1000); return;
        }
        const lt = tt - intro, i = Math.min(imgs.length - 1, Math.floor(lt / per)), l = lt - i * per;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1080, 1920);
        if (i > 0 && l < fade) cover(ctx, imgs[i - 1], 0, 0, 1080, 1920, 0, 1.16);
        ctx.globalAlpha = i > 0 ? Math.min(1, l / fade) : 1;
        const p = l / per, dir = i % 2 ? -1 : 1;
        cover(ctx, imgs[i], 0, 0, 1080, 1920, 0, 1.04 + 0.12 * p, dir * 30 * (p - 0.5), 0);
        ctx.globalAlpha = 1;
        const g = ctx.createLinearGradient(0, 1500, 0, 1920); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.65)'); ctx.fillStyle = g; ctx.fillRect(0, 1500, 1080, 420);
        ctx.fillStyle = '#fff'; ctx.font = `600 40px ${SANS}`; ctx.fillText(sub.split(' · ')[0], 60, 1840);
      };
      const stream = c.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const done = new Promise<void>((res) => (rec.onstop = () => res()));
      rec.start(250);
      const t0 = performance.now();
      await new Promise<void>((res) => {
        const loop = () => {
          const tt = (performance.now() - t0) / 1000;
          drawFrame(Math.min(tt, total - 0.01)); setProg(Math.min(1, tt / total));
          if (tt >= total) res(); else requestAnimationFrame(loop);
        };
        loop();
      });
      rec.stop(); await done;
      const ext = mime.includes('mp4') ? 'mp4' : 'webm';
      setReel({ url: URL.createObjectURL(new Blob(chunks, { type: mime.split(';')[0] })), ext });
    } catch (e) { t.notify(`Couldn’t make the reel: ${(e as Error).message}`); }
    setBusy(false);
  }

  async function caption() {
    setCapBusy(true);
    try {
      const r = await api('/api/ai', { mode: 'caption', code: t.trip.code, trip: t.trip.name, destination: t.trip.destination, dates: fmtRange(t.trip.start_date, t.trip.end_date), count: chosen.length, format: mode === 'reel' ? 'Instagram reel' : layout === 'polaroid' ? 'polaroid photo dump' : 'carousel/collage post', mood, today: todayISO() });
      const j = await r.json();
      if (!r.ok || !j.data?.captions) throw new Error(j.error || 'No caption came back');
      setCap(j.data);
    } catch (e) { t.notify((e as Error).message); }
    setCapBusy(false);
  }
  const copy = async (s: string) => { await navigator.clipboard.writeText(s); t.notify('Copied'); };

  return (
    <Sheet open onClose={onClose} title="Create from photos">
      <div className="stack-sm">
        <div className="row between"><span className="field-label">Pick photos ({sel.length}/12)</span>{sel.length > 0 && <button className="small muted" onClick={() => setSel([])}>Clear</button>}</div>
        <div className="thumbs">
          {photos.map((p) => (
            <button key={p.id} className={sel.includes(p.id) ? 'on' : ''} onClick={() => toggle(p.id)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(p.path)} alt="" loading="lazy" />
              {sel.includes(p.id) && <span className="n">{sel.indexOf(p.id) + 1}</span>}
            </button>
          ))}
        </div>
        {photos.length === 0 && <p className="muted small">Add some trip photos first, then come back here.</p>}
      </div>

      {chosen.length > 0 && (
        <>
          <div className="seg"><button className={mode === 'collage' ? 'on' : ''} onClick={() => setMode('collage')}>🖼️ Collage</button><button className={mode === 'reel' ? 'on' : ''} onClick={() => setMode('reel')}>🎬 Reel</button></div>

          {mode === 'collage' ? (
            <>
              <div className="chips wrap">
                {(['grid', 'hero', 'polaroid'] as Layout[]).map((l) => <button key={l} className={`chip ${layout === l ? 'on' : ''}`} onClick={() => setLayout(l)}>{l === 'grid' ? 'Grid' : l === 'hero' ? 'Hero' : 'Polaroid wall'}</button>)}
                <span style={{ width: 8 }} />
                {(['post', 'story'] as Fmt[]).map((f) => <button key={f} className={`chip ${fmt === f ? 'on' : ''}`} onClick={() => setFmt(f)}>{f === 'post' ? 'Post 4:5' : 'Story 9:16'}</button>)}
              </div>
              <canvas ref={canvas} className="preview" style={{ aspectRatio: `${W} / ${H}` }} />
              <button className="btn primary" onClick={saveCollage}><Icon n="download" size={18} /> Save / share collage</button>
            </>
          ) : (
            <>
              <p className="muted small">A vertical 9:16 video with smooth zooms and fades. Add music when you post it on Instagram.</p>
              <div className="chips wrap">{[[1.5, 'Fast'], [2.2, 'Normal'], [3, 'Slow']].map(([v, l]) => <button key={String(l)} className={`chip ${speed === v ? 'on' : ''}`} onClick={() => setSpeed(v as number)}>{l}</button>)}</div>
              <div className="reel-stage">
                {reel ? <video src={reel.url} controls playsInline loop autoPlay muted /> : <canvas ref={canvas} className="preview" style={{ aspectRatio: '1080 / 1920' }} />}
                {busy && <div className="progress" style={{ marginTop: 8 }}><i style={{ width: `${prog * 100}%` }} /></div>}
              </div>
              {!reel ? (
                <button className="btn primary" disabled={busy} onClick={makeReel}><Icon n="film" size={18} /> {busy ? `Recording… ${Math.round(prog * 100)}%` : 'Make my reel'}</button>
              ) : (
                <div className="row wrap">
                  <button className="btn primary grow" onClick={async () => deliver(await (await fetch(reel.url)).blob(), `${title.replace(/\W+/g, '-')}-reel.${reel.ext}`)}><Icon n="download" size={18} /> Save / share reel</button>
                  <button className="btn" onClick={() => setReel(null)}>Redo</button>
                </div>
              )}
              <p className="tiny faint">Keep this screen open while it records. {pickMime()?.includes('webm') ? 'This browser saves WebM; Instagram prefers MP4, so try Safari/Chrome on the latest version if it won’t upload.' : ''}</p>
            </>
          )}

          <div className="stack-sm">
            <span className="field-label">✨ Caption & hashtags</span>
            <div className="chips wrap">{['fun and nostalgic', 'aesthetic and calm', 'funny', 'foodie', 'adventurous'].map((m) => <button key={m} className={`chip ${mood === m ? 'on' : ''}`} onClick={() => setMood(m)}>{m}</button>)}</div>
            {t.can('members_can_use_ai') ? <button className="btn" disabled={capBusy} onClick={caption}>{capBusy ? 'Writing…' : cap ? 'Write more' : 'Write my caption'}</button> : <p className="muted small"><Icon n="lock" size={14} /> AI is limited by the admin.</p>}
            {cap && (
              <div className="stack-sm">
                {cap.captions.map((c, i) => <button key={i} className="card-li" style={{ whiteSpace: 'pre-wrap' }} onClick={() => copy(c)}><span className="grow">{c}</span><Icon n="copy" size={16} /></button>)}
                <button className="card-li" onClick={() => copy((cap.hashtags || []).join(' '))}><span className="grow small muted">{(cap.hashtags || []).join(' ')}</span><Icon n="copy" size={16} /></button>
                <p className="tiny faint">Tap any caption or the hashtags to copy.</p>
              </div>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}
