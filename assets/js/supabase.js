/**
 * NUSC Student Hub - Supabase Client
 * Supports VITE_* and NEXT_PUBLIC_* so Vercel env works either way
 */

import { createClient } from '@supabase/supabase-js';

function pickEnv(...keys) {
  for (const k of keys) {
    const v = (import.meta.env[k] || '').trim();
    if (v) return v;
  }
  return '';
}

const rawUrl = pickEnv(
  'VITE_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'VITE_SUPABASE_PROJECT_URL'
);

const supabaseKey = pickEnv(
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY'
);

function normalizeUrl(url) {
  if (!url) return '';
  return url
    .replace(/\/rest\/v1\/?.*$/i, '')
    .replace(/\/auth\/v1\/?.*$/i, '')
    .replace(/\/+$/, '');
}

const supabaseUrl = normalizeUrl(rawUrl);

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[NUSC] Empty Supabase config. On Vercel set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY then Redeploy.'
  );
} else {
  console.info('[NUSC] Supabase URL:', supabaseUrl);
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder',
  {
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
  }
);

export function isSupabaseConfigured() {
  return Boolean(
    supabaseUrl &&
      supabaseKey &&
      supabaseUrl.includes('supabase.co') &&
      supabaseKey.length > 20 &&
      !supabaseKey.includes('your-') &&
      !supabaseKey.includes('placeholder')
  );
}

export function getConfigError() {
  if (!rawUrl || !supabaseKey) {
    return 'إعدادات الاتصال غير مكتملة على السيرفر. أضف VITE_SUPABASE_URL و VITE_SUPABASE_PUBLISHABLE_KEY في Vercel ثم أعد النشر (Redeploy).';
  }
  if (!supabaseUrl.includes('supabase.co')) {
    return 'رابط Supabase غير صحيح. استخدم: https://PROJECT_ID.supabase.co';
  }
  return null;
}

function withTimeout(promise, ms = 10000) {
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
    const { data: { session }, error } = await withTimeout(supabase.auth.getSession(), 10000);
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
    const { data: { user }, error } = await withTimeout(supabase.auth.getUser(), 10000);
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
      10000
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
  return profile && (profile.role === 'admin' || profile.role === 'moderator') && profile.is_active;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  window.location.href = '/login.html';
}

export default supabase;
