/**
 * NUSC Student Hub - Supabase Client
 * إعداد الاتصال بـ Supabase باستخدام المفاتيح العامة فقط
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'إعدادات Supabase غير موجودة. تأكد من إنشاء ملف .env مع VITE_SUPABASE_URL و VITE_SUPABASE_PUBLISHABLE_KEY'
  );
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: localStorage
  }
});

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseKey && supabaseUrl.includes('supabase'));
}

export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('خطأ في جلب الجلسة:', error.message);
    return null;
  }
  return session;
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error('خطأ في جلب المستخدم:', error.message);
    return null;
  }
  return user;
}

export async function getProfile(userId = null) {
  const uid = userId || (await getCurrentUser())?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, student_id, college, academic_year, avatar_url, role, is_active, created_at')
    .eq('id', uid)
    .single();

  if (error) {
    console.error('خطأ في جلب الملف الشخصي:', error.message);
    return null;
  }
  return data;
}

export async function isAdmin() {
  const profile = await getProfile();
  return profile && (profile.role === 'admin' || profile.role === 'moderator') && profile.is_active;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('خطأ في تسجيل الخروج:', error.message);
    throw error;
  }
  window.location.href = '/login.html';
}

export default supabase;
