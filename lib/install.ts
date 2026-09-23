import { useEffect, useState } from 'react';

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: BIP | null = null;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());

// Chrome/Edge/Android fire this once, early. Keep it so any screen can offer "Install".
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as BIP; ping(); });
  window.addEventListener('appinstalled', () => { deferred = null; ping(); });
}

export const platform = () => {
  if (typeof navigator === 'undefined') return { ios: false, android: false, inApp: false };
  const ua = navigator.userAgent;
  return { ios: /iphone|ipad|ipod/i.test(ua), android: /android/i.test(ua), inApp: /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Snapchat|; wv\)/i.test(ua) };
};

export function useInstall() {
  const [, tick] = useState(0);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const f = () => tick((x) => x + 1);
    subs.add(f);
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
    return () => { subs.delete(f); };
  }, []);
  return {
    installed,
    canPrompt: !!deferred,
    prompt: async () => {
      if (!deferred) return false;
      await deferred.prompt();
      const r = await deferred.userChoice;
      deferred = null; ping();
      return r.outcome === 'accepted';
    },
  };
}
