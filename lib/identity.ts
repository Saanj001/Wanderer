// Local-only bits: recently opened trips and the "last seen chat" marker. Identity now comes from the login session.
const RECENT = 'wander.recent.v1';
const SEEN = 'wander.seen.v1';

const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) || '') as T; } catch { return d; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export type Recent = { code: string; name: string; destination: string };
export const getRecent = (): Recent[] => read<Recent[]>(RECENT, []);
export const addRecent = (r: Recent) => write(RECENT, [r, ...getRecent().filter((x) => x.code !== r.code)].slice(0, 12));
export const removeRecent = (code: string) => write(RECENT, getRecent().filter((x) => x.code !== code));

export const getSeen = (tripId: string): number => read<Record<string, number>>(SEEN, {})[tripId] ?? 0;
export const setSeen = (tripId: string, ts: number) => write(SEEN, { ...read<Record<string, number>>(SEEN, {}), [tripId]: ts });
