import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
export const hasSupabase = Boolean(url && key);

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!client) client = createClient(url || 'http://localhost', key || 'missing', { realtime: { params: { eventsPerSecond: 10 } } });
  return client;
}
export const BUCKET = 'trip-photos';
export const photoUrl = (path: string) => sb().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
