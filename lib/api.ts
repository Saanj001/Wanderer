import { sb } from './supabase';

/** fetch() to our own API routes with the signed-in user's token attached. */
export async function api(path: string, body?: unknown, method: 'POST' | 'GET' = 'POST'): Promise<Response> {
  const { data } = await sb().auth.getSession();
  const token = data.session?.access_token;
  return fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
}
