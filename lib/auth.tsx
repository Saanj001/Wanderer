'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { sb, BUCKET } from './supabase';
import { api } from './api';
import type { Profile } from './types';

type Ctx = {
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  recovery: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (o: { email: string; password: string; name: string; upi?: string }) => Promise<string | null>;
  signOut: () => Promise<void>;
  requestReset: (email: string) => Promise<string | null>;
  setNewPassword: (password: string) => Promise<string | null>;
  saveProfile: (p: { name?: string; upi_id?: string | null }) => Promise<string | null>;
  uploadAvatar: (file: Blob) => Promise<string | null>;
};

const AuthCtx = createContext<Ctx | null>(null);
export const useAuth = () => {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth outside provider');
  return c;
};

const friendly = (m: string) =>
  /invalid login/i.test(m) ? 'Wrong email or password.' :
  /already|exists|registered/i.test(m) ? 'That email already has an account. Log in instead.' :
  /password/i.test(m) && /6|8|short|weak/i.test(m) ? 'Use a password with at least 8 characters.' :
  /email rate limit|over_email_send/i.test(m) ? 'Sign-ups are paused because Supabase’s free email limit was hit. Ask the trip organizer to turn off “Confirm email” in Supabase (Authentication → Sign In / Providers → Email), then try again.' :
  /rate|too many|seconds/i.test(m) ? 'Too many tries. Wait a minute and try again.' : m;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recovery, setRecovery] = useState(false);

  const loadProfile = useCallback(async (u: User | null) => {
    if (!u) { setProfile(null); return; }
    const { data } = await sb().from('profiles').select('*').eq('id', u.id).maybeSingle();
    if (data) { setProfile(data as Profile); return; }
    const name = (u.user_metadata?.name as string) || u.email?.split('@')[0] || 'Traveller';
    const row = { id: u.id, name, upi_id: null, avatar_path: null };
    await sb().from('profiles').upsert(row, { ignoreDuplicates: true });
    const { data: again } = await sb().from('profiles').select('*').eq('id', u.id).maybeSingle();
    setProfile((again as Profile) ?? row);
  }, []);

  useEffect(() => {
    let alive = true;
    sb().auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session?.user ?? null);
      loadProfile(data.session?.user ?? null).finally(() => alive && setLoading(false));
    });
    const { data: sub } = sb().auth.onAuthStateChange((ev, session) => {
      if (ev === 'PASSWORD_RECOVERY') setRecovery(true);
      setUser(session?.user ?? null);
      if (ev === 'SIGNED_IN' || ev === 'USER_UPDATED') setTimeout(() => loadProfile(session?.user ?? null), 0);
      if (ev === 'SIGNED_OUT') setProfile(null);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const value = useMemo<Ctx>(() => ({
    loading, user, profile, recovery,
    signIn: async (email, password) => {
      const { error } = await sb().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      return error ? friendly(error.message) : null;
    },
    signUp: async ({ email, password, name, upi }) => {
      const em = email.trim().toLowerCase();
      if (password.length < 8) return 'Use a password with at least 8 characters.';
      let created = false;
      try {
        const r = await api('/api/auth/signup', { email: em, password, name, upi });
        const j = await r.json().catch(() => ({}));
        if (r.ok) created = true;
        else if (j.error === 'exists') return 'That email already has an account. Log in instead.';
        else if (j.error && j.error !== 'not_configured') return friendly(j.error);
      } catch { /* fall back below */ }
      if (!created) {
        // server not configured → use the standard sign-up (needs "Confirm email" switched off in Supabase)
        const { data, error } = await sb().auth.signUp({ email: em, password, options: { data: { name } } });
        if (error) return friendly(error.message);
        if (!data.session) return 'CONFIRM_EMAIL';
      }
      const { error: e2 } = await sb().auth.signInWithPassword({ email: em, password });
      if (e2) return friendly(e2.message);
      const { data: u } = await sb().auth.getUser();
      if (u.user) {
        await sb().from('profiles').upsert({ id: u.user.id, name: name.trim(), upi_id: upi?.trim() || null });
        await loadProfile(u.user);
      }
      return null;
    },
    signOut: async () => { await sb().auth.signOut(); setUser(null); setProfile(null); },
    requestReset: async (email) => {
      const { error } = await sb().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${location.origin}/reset` });
      return error ? friendly(error.message) : null;
    },
    setNewPassword: async (password) => {
      if (password.length < 8) return 'Use a password with at least 8 characters.';
      const { error } = await sb().auth.updateUser({ password });
      if (!error) setRecovery(false);
      return error ? friendly(error.message) : null;
    },
    saveProfile: async (p) => {
      if (!user) return 'Not signed in';
      const { error } = await sb().from('profiles').update(p).eq('id', user.id);
      if (error) return error.message;
      // keep the name/UPI on every trip this person belongs to
      await sb().from('members').update(p).eq('user_id', user.id);
      setProfile((x) => (x ? { ...x, ...p } : x));
      return null;
    },
    uploadAvatar: async (blob) => {
      if (!user) return 'Not signed in';
      const path = `avatars/${user.id}/${Date.now()}.jpg`;
      const up = await sb().storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
      if (up.error) return up.error.message;
      await sb().from('profiles').update({ avatar_path: path }).eq('id', user.id);
      await sb().from('members').update({ avatar_path: path }).eq('user_id', user.id);
      setProfile((x) => (x ? { ...x, avatar_path: path } : x));
      return null;
    },
  }), [loading, user, profile, recovery, loadProfile]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
