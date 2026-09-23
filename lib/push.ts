import { sb } from './supabase';
import { uid } from './utils';

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

export const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

function b64ToBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export type PushResult = 'ok' | 'denied' | 'unsupported' | 'nokey' | 'error';

export async function enablePush(tripId: string, memberId: string | null): Promise<PushResult> {
  if (!pushSupported()) return 'unsupported';
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return 'nokey';
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return 'denied';
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) as unknown as BufferSource }));
    const j = sub.toJSON();
    const { error } = await sb().from('push_subscriptions').upsert(
      { id: uid(), trip_id: tripId, member_id: memberId, endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' },
      { onConflict: 'endpoint' },
    );
    return error ? 'error' : 'ok';
  } catch { return 'error'; }
}

export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  try { const reg = await navigator.serviceWorker.ready; return !!(await reg.pushManager.getSubscription()); } catch { return false; }
}

export async function disablePush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await sb().from('push_subscriptions').delete().eq('endpoint', endpoint);
    }
    return true;
  } catch { return false; }
}
