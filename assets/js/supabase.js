/**
 * NUSC Student Hub - Supabase Client
 * Fallback values are public publishable keys (safe for frontend with RLS)
 */

import { createClient } from '@supabase/supabase-js';

function pickEnv(...keys) {
  for (const k of keys) {
    try {
      const v = (import.meta.env[k] || '').trim();
      if (v && !v.includes('your-') && v !== 'undefined') return v;
    } catch {
      /* ignore */
    }
  }
  return '';
}

function normalizeUrl(url) {
  if (!url) return '';
  return String(url)
    .trim()
    .replace(/\/rest\/v1\/?.*$/i, '')
    .replace(/\/auth\/v1\/?.*$/i, '')
    .replace(/\/+$/, '');
}

const FALLBACK_URL = 'https://keaoerzmdxthrgpqnwvs.supabase.co';
const FALLBACK_KEY = 'sb_publishable_p2OZlGraQC5gjj8ckVZjbg_ROIabqkD';

const rawUrl =
  pickEnv(
    'VITE_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'VITE_SUPABASE_PROJECT_URL'
  ) || FALLBACK_URL;

const supabaseKey =
  pickEnv(
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY'
  ) || FALLBACK_KEY;

const supabaseUrl = normalizeUrl(rawUrl);

console.info('[NUSC] Supabase connected:', supabaseUrl);

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
    flowType: 'pkce'
  },
  global: {
    headers: { 'x-client-info': 'nusc-student-hub' }
  }
});

export function isSupabaseConfigured() {
  return Boolean(
    supabaseUrl &&
      supabaseKey &&
      supabaseUrl.includes('supabase.co') &&
      supabaseKey.length > 20
  );
}

export function getConfigError() {
  if (!isSupabaseConfigured()) {
    return 'تعذر تهيئة الاتصال بقاعدة البيانات. تواصل مع الدعم.';
  }
  return null;
}

function withTimeout(promise, ms = 12000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('انتهت مهلة الاتصال بـ Supabase')), ms)
    )
  ]);
}

export async function getSession() {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data: { session }, error } = await withTimeout(supabase.auth.getSession(), 12000);
    if (error) {
      console.error('session:', error.message);
      return null;
    }
    return session;
  } catch (err) {
    console.error('getSession:', err.message);
    return null;
  }
}

export async function getCurrentUser() {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data: { user }, error } = await withTimeout(supabase.auth.getUser(), 12000);
    if (error) return null;
    return user;
  } catch {
    return null;
  }
}

export async function getProfile(userId = null) {
  const uid = userId || (await getCurrentUser())?.id;
  if (!uid) return null;
  try {
    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .select('id, full_name, email, student_id, college, academic_year, avatar_url, role, is_active, created_at')
        .eq('id', uid)
        .single(),
      12000
    );
    if (error) {
      console.error('profile:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('getProfile:', err.message);
    return null;
  }
}

export async function isAdmin() {
  const profile = await getProfile();
  return (
    !!profile &&
    (profile.role === 'admin' || profile.role === 'moderator') &&
    profile.is_active !== false
  );
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  window.location.href = '/login.html';
}

export default supabase;
