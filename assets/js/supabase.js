/**
 * NUSC Student Hub - Supabase Client
 */

import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

function normalizeUrl(url) {
  if (!url) return '';
  return url
    .replace(/\/rest\/v1\/?.*$/i, '')
    .replace(/\/+$/, '');
}

const supabaseUrl = normalizeUrl(rawUrl);

if (!supabaseUrl || !supabaseKey) {
  console.error(
    '[NUSC] إعدادات Supabase غير موجودة. ضع VITE_SUPABASE_URL و VITE_SUPABASE_PUBLISHABLE_KEY في Vercel ثم أعد النشر.'
  );
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseKey || 'placeholder', {
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
    !supabaseKey.includes('your-') &&
    supabaseKey.length > 20
  );
}

export function getConfigError() {
  if (!rawUrl || !supabaseKey) {
    return 'إعدادات الاتصال غير مكتملة. أضف متغيرات البيئة على Vercel وأعد نشر المشروع.';
  }
  if (!supabaseUrl.includes('supabase.co')) {
    return 'رابط Supabase غير صحيح. استخدم شكل: https://xxxx.supabase.co';
  }
  return null;
}

function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('انتهت مهلة الاتصال. تحقق من الإنترنت وإعدادات Supabase.')), ms)
    )
  ]);
}

export async function getSession() {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data: { session }, error } = await withTimeout(supabase.auth.getSession(), 8000);
    if (error) {
      console.error('جلسة:', error.message);
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
    const { data: { user }, error } = await withTimeout(supabase.auth.getUser(), 8000);
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
      8000
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
