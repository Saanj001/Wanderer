'use client';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { sb } from '@/lib/supabase';
import { useTrip } from '@/lib/tripData';
import { Avatar, Icon } from './ui';
import { api } from '@/lib/api';
import type { Room as LKRoom } from 'livekit-client';

type Remote = { stream: MediaStream; mic: boolean; cam: boolean };
type Ctx = { active: boolean; start: () => void; join: () => void; leave: () => void };
const CallCtx = createContext<Ctx>({ active: false, start: () => {}, join: () => {}, leave: () => {} });
export const useCall = () => useContext(CallCtx);

const turn = process.env.NEXT_PUBLIC_TURN_URL;
const ICE: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    ...(turn ? [{ urls: turn.split(','), username: process.env.NEXT_PUBLIC_TURN_USER, credential: process.env.NEXT_PUBLIC_TURN_PASS }] : []),
  ],
};

type Sig = { from: string; to: string; kind: 'offer' | 'answer' | 'ice'; data: RTCSessionDescriptionInit & RTCIceCandidateInit };

/** Video calls inside the app: peer-to-peer WebRTC, signalling over Supabase Realtime. Works best for up to ~5 people. */
export function CallProvider({ children }: { children: React.ReactNode }) {
  const t = useTrip();
  const meId = t.me?.id ?? '';
  const [active, setActive] = useState(false);
  const [min, setMin] = useState(false);
  const [status, setStatus] = useState<'idle' | 'starting' | 'live' | 'error'>('idle');
  const [err, setErr] = useState('');
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remotes, setRemotes] = useState<Record<string, Remote>>({});
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [hasCam, setHasCam] = useState(true);
  const micRef = useRef(true), camRef = useRef(true);
  const [sfu, setSfu] = useState(false);
  const R = useRef({ room: null as LKRoom | null, streams: {} as Record<string, MediaStream>, ch: null as RealtimeChannel | null, pcs: {} as Record<string, RTCPeerConnection>, pending: {} as Record<string, RTCIceCandidateInit[]>, stream: null as MediaStream | null });

  const announce = useCallback(() => {
    R.current.ch?.send({ type: 'broadcast', event: 'state', payload: { from: meId, mic: micRef.current, cam: camRef.current } });
  }, [meId]);

  const leave = useCallback(() => {
    const r = R.current;
    Object.values(r.pcs).forEach((pc) => pc.close());
    r.pcs = {}; r.pending = {};
    if (r.room) { r.room.disconnect(); r.room = null; r.streams = {}; }
    r.stream?.getTracks().forEach((x) => x.stop());
    r.stream = null;
    if (r.ch) { r.ch.untrack(); sb().removeChannel(r.ch); r.ch = null; }
    setLocal(null); setRemotes({}); setActive(false); setMin(false); setStatus('idle'); setErr(''); setSfu(false);
    micRef.current = true; camRef.current = true; setMic(true); setCam(true); setHasCam(true);
  }, []);

  const join = useCallback(async () => {
    const r = R.current;
    if (!meId) return;
    if (r.ch || r.room) { setActive(true); setMin(false); return; }
    setActive(true); setMin(false); setStatus('starting'); setErr('');

    // Group-call server (LiveKit) if the admin has set it up: smooth even with 7+ people.
    try {
      const tr = await api('/api/livekit/token', { code: t.trip.code });
      if (tr.ok) {
        const { token, url } = await tr.json();
        const { Room, RoomEvent, Track } = await import('livekit-client');
        const room = new Room({ adaptiveStream: false, dynacast: true, videoCaptureDefaults: { resolution: { width: 640, height: 360, frameRate: 24 } } });
        r.room = room;
        const sync = (id: string, tracks: MediaStreamTrack[]) => {
          const st = (r.streams[id] ??= new MediaStream());
          st.getTracks().filter((x) => !tracks.includes(x)).forEach((x) => st.removeTrack(x));
          tracks.filter((x) => !st.getTracks().includes(x)).forEach((x) => st.addTrack(x));
          return st;
        };
        const refresh = () => {
          const map: Record<string, Remote> = {};
          room.remoteParticipants.forEach((p) => {
            const cp = p.getTrackPublication(Track.Source.Camera), mp = p.getTrackPublication(Track.Source.Microphone);
            const tracks = [cp?.track?.mediaStreamTrack, mp?.track?.mediaStreamTrack].filter(Boolean) as MediaStreamTrack[];
            map[p.identity] = { stream: sync(p.identity, tracks), cam: !!cp?.track && !cp.isMuted, mic: !!mp?.track && !mp.isMuted };
          });
          setRemotes(map);
          const lc = room.localParticipant.getTrackPublication(Track.Source.Camera)?.track?.mediaStreamTrack;
          setLocal(lc ? sync('__me', [lc]) : null);
        };
        [RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected, RoomEvent.TrackSubscribed, RoomEvent.TrackUnsubscribed, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished].forEach((ev) => room.on(ev, refresh));
        room.on(RoomEvent.Disconnected, () => leave());
        await room.connect(url, token);
        await room.startAudio().catch(() => {});
        await room.localParticipant.setMicrophoneEnabled(true).catch(() => { micRef.current = false; setMic(false); });
        await room.localParticipant.setCameraEnabled(true).catch(() => { setHasCam(false); camRef.current = false; setCam(false); });
        setSfu(true); setStatus('live'); refresh();
        return;
      }
    } catch { r.room?.disconnect(); r.room = null; /* fall back to direct calls */ }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } } });
    } catch {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); setHasCam(false); camRef.current = false; setCam(false); }
      catch { setErr('Couldn’t use the microphone or camera. Allow access for this site in your browser settings, then try again.'); setStatus('error'); return; }
    }
    r.stream = stream; setLocal(stream);

    const ch = sb().channel(`call-${t.trip.id}`, { config: { presence: { key: meId }, broadcast: { self: false } } });
    r.ch = ch;
    const send = (to: string, kind: Sig['kind'], data: unknown) => ch.send({ type: 'broadcast', event: 'signal', payload: { from: meId, to, kind, data } });

    const makePc = (peer: string) => {
      const pc = new RTCPeerConnection(ICE);
      r.pcs[peer] = pc;
      stream.getTracks().forEach((tr) => pc.addTrack(tr, stream));
      pc.onicecandidate = (e) => { if (e.candidate) send(peer, 'ice', e.candidate.toJSON()); };
      pc.ontrack = (e) => {
        const s = e.streams[0];
        if (s) setRemotes((x) => ({ ...x, [peer]: { mic: x[peer]?.mic ?? true, cam: x[peer]?.cam ?? true, stream: s } }));
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          pc.close();
          if (r.pcs[peer] === pc) { delete r.pcs[peer]; setRemotes((x) => { const n = { ...x }; delete n[peer]; return n; }); }
        }
      };
      return pc;
    };
    const flush = async (peer: string, pc: RTCPeerConnection) => {
      for (const c of r.pending[peer] ?? []) await pc.addIceCandidate(c).catch(() => {});
      r.pending[peer] = [];
    };

    ch.on('broadcast', { event: 'signal' }, async ({ payload }) => {
      const { from, to, kind, data } = payload as Sig;
      if (to !== meId) return;
      try {
        if (kind === 'offer') {
          let pc = r.pcs[from];
          if (pc && (pc.signalingState !== 'stable' || ['failed', 'closed', 'disconnected'].includes(pc.connectionState))) { pc.close(); delete r.pcs[from]; pc = undefined as unknown as RTCPeerConnection; }
          if (!pc) pc = makePc(from);
          await pc.setRemoteDescription(data);
          await flush(from, pc);
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          send(from, 'answer', pc.localDescription);
        } else if (kind === 'answer') {
          const pc = r.pcs[from];
          if (pc && pc.signalingState === 'have-local-offer') { await pc.setRemoteDescription(data); await flush(from, pc); }
        } else if (kind === 'ice') {
          const pc = r.pcs[from];
          if (pc && pc.remoteDescription) await pc.addIceCandidate(data).catch(() => {});
          else (r.pending[from] ??= []).push(data);
        }
      } catch { /* a failed negotiation just means that tile won't appear; the peer can rejoin */ }
    });
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      const p = payload as { from: string; mic: boolean; cam: boolean };
      setRemotes((x) => (x[p.from] ? { ...x, [p.from]: { ...x[p.from], mic: p.mic, cam: p.cam } } : x));
    });
    ch.on('presence', { event: 'sync' }, async () => {
      const ids = Object.keys(ch.presenceState()).filter((k) => k !== meId);
      for (const id of Object.keys(r.pcs)) {
        if (!ids.includes(id)) { r.pcs[id].close(); delete r.pcs[id]; setRemotes((x) => { const n = { ...x }; delete n[id]; return n; }); }
      }
      for (const id of ids) {
        if (r.pcs[id] || meId > id) continue; // the person with the smaller id makes the offer
        try {
          const pc = makePc(id);
          const off = await pc.createOffer();
          await pc.setLocalDescription(off);
          send(id, 'offer', pc.localDescription);
        } catch { /* retry on next sync */ }
      }
      announce();
    });
    ch.subscribe(async (s) => {
      if (s === 'SUBSCRIBED') { await ch.track({ at: Date.now() }); setStatus('live'); }
      if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { setErr('Couldn’t connect to the call. Check your internet and try again.'); setStatus('error'); }
    });
  }, [meId, t.trip.id, t.trip.code, announce, leave]);

  const start = useCallback(async () => {
    if (!R.current.ch) await t.sendMessage('call', false, { kind: 'call' });
    join();
  }, [join, t]);

  // leave when the trip screen goes away
  useEffect(() => () => { leave(); }, [leave]);

  function toggleMic() {
    const n = !micRef.current; micRef.current = n; setMic(n);
    if (R.current.room) { R.current.room.localParticipant.setMicrophoneEnabled(n); return; }
    R.current.stream?.getAudioTracks().forEach((x) => (x.enabled = n));
    announce();
  }
  function toggleCam() {
    if (!hasCam) return;
    const n = !camRef.current; camRef.current = n; setCam(n);
    if (R.current.room) { R.current.room.localParticipant.setCameraEnabled(n); return; }
    R.current.stream?.getVideoTracks().forEach((x) => (x.enabled = n));
    announce();
  }
  async function flip() {
    const r = R.current;
    if (r.room) {
      try {
        const { Track } = await import('livekit-client');
        const pub = r.room.localParticipant.getTrackPublication(Track.Source.Camera);
        const vt = pub?.track as unknown as { restartTrack: (o: MediaTrackConstraints) => Promise<void>; mediaStreamTrack: MediaStreamTrack } | undefined;
        if (vt) { const f = vt.mediaStreamTrack.getSettings().facingMode === 'environment' ? 'user' : 'environment'; await vt.restartTrack({ facingMode: f }); }
      } catch { t.notify('Couldn’t switch the camera.'); }
      return;
    }
    const cur = r.stream?.getVideoTracks()[0];
    if (!r.stream || !cur) return;
    try {
      const facing = cur.getSettings().facingMode === 'environment' ? 'user' : 'environment';
      const ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } } });
      const nt = ns.getVideoTracks()[0];
      Object.values(r.pcs).forEach((pc) => pc.getSenders().find((s) => s.track?.kind === 'video')?.replaceTrack(nt));
      r.stream.removeTrack(cur); cur.stop(); r.stream.addTrack(nt);
      nt.enabled = camRef.current;
      setLocal(new MediaStream(r.stream.getTracks()));
    } catch { t.notify('Couldn’t switch the camera.'); }
  }

  const peers = Object.entries(remotes);
  const count = peers.length + 1;
  const me = t.me;

  return (
    <CallCtx.Provider value={{ active, start, join, leave }}>
      {children}
      {active && min && <button className="call-pill" onClick={() => setMin(false)}>📹 In call · {count} {count === 1 ? 'person' : 'people'} · tap to return</button>}
      {active && (
        <div className={`call ${min ? 'call-hidden' : ''}`} role="dialog" aria-label="Video call">
          <div className="call-top">
            <b>Video call · {count} {count === 1 ? 'person' : 'people'}</b>
            <button className="icon-btn sm" onClick={() => setMin(true)} aria-label="Minimise"><Icon n="chevron" size={18} /></button>
          </div>
          <div className={`call-grid c${Math.min(6, count)}`}>
            <Tile stream={local} name="You" local mic={mic} cam={cam && hasCam} member={me} />
            {peers.map(([id, p]) => <Tile key={id} stream={p.stream} name={t.member(id)?.name ?? 'Friend'} mic={p.mic} cam={p.cam} member={t.member(id)} />)}
            {status === 'starting' && <div className="call-wait">Starting your camera…</div>}
            {status === 'error' && <div className="call-wait"><div className="stack-sm"><span className="bad">{err}</span><button className="btn sm" onClick={() => { leave(); }}>Close</button></div></div>}
            {status === 'live' && peers.length === 0 && <div className="tile"><div className="call-wait">Waiting for others to join…<br /><span className="tiny">We’ve sent them a notification.</span></div></div>}
          </div>
          {!sfu && count > 4 && <p className="tiny bad" style={{ textAlign: 'center', padding: '0 14px' }}>Calls with 5+ people get slow without the group-call server. Ask the admin to switch it on (LiveKit).</p>}
          <p className="tiny faint" style={{ textAlign: 'center', padding: '0 14px' }}>
            Can’t connect on mobile data? <a href={`https://meet.jit.si/wander-${t.trip.code.toLowerCase()}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Open in Jitsi instead</a>
          </p>
          <div className="call-controls">
            <button className={mic ? '' : 'off'} onClick={toggleMic} aria-label={mic ? 'Mute' : 'Unmute'}>{mic ? '🎙️' : '🔇'}</button>
            <button className={cam && hasCam ? '' : 'off'} onClick={toggleCam} disabled={!hasCam} aria-label="Camera">{cam && hasCam ? '📷' : '🚫'}</button>
            <button onClick={flip} disabled={!hasCam} aria-label="Flip camera">🔄</button>
            <button className="end" onClick={leave} aria-label="Leave call">📞</button>
          </div>
        </div>
      )}
    </CallCtx.Provider>
  );
}

function Tile({ stream, name, local, mic, cam, member }: { stream: MediaStream | null; name: string; local?: boolean; mic: boolean; cam: boolean; member?: { name: string; color: string; avatar_path?: string | null } | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current && stream && ref.current.srcObject !== stream) ref.current.srcObject = stream; }, [stream]);
  return (
    <div className="tile">
      <video ref={ref} autoPlay playsInline muted={local} className={local ? 'mirror' : ''} style={{ opacity: cam ? 1 : 0 }} />
      {!cam && <div className="tile-off"><Avatar m={member} size={64} /></div>}
      <span className="tile-name">{name}{!mic ? ' 🔇' : ''}</span>
    </div>
  );
}
