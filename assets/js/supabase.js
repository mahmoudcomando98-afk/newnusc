import './egyptian-ar.js';

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

// Apply the platform logo globally. The URL is stored as a public platform setting,
// so unauthenticated login/register pages can load it too.
function normalizePlatformLogo(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return value.url || value.logo_url || '';
  return '';
}

function normalizePlatformName(value) {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object') return String(value.name || '').trim();
  return '';
}

function applyPlatformName(name) {
  if (typeof document === 'undefined' || typeof name !== 'string') return;
  const platformName = name.trim();
  if (platformName.length < 2 || platformName.length > 60) return;

  // Login and registration brand labels.
  document.querySelectorAll('.auth-brand').forEach((brand) => {
    const label = Array.from(brand.children).find((child) =>
      child.tagName === 'SPAN' &&
      !child.classList.contains('auth-brand-dot') &&
      !child.classList.contains('auth-brand-logo')
    );
    if (label) label.textContent = platformName;
  });

  // Main navigation, footer, and welcome heading.
  document.querySelectorAll('.logo-word, .footer-brand').forEach((el) => {
    el.textContent = platformName;
  });
  const welcome = document.getElementById('welcome-text');
  if (welcome) welcome.textContent = 'أهلاً بك في ' + platformName;

  // Keep the page-specific title, only replacing the platform suffix.
  if (document.title === 'NUSC' || document.title === 'NUSC Student Hub') {
    document.title = platformName;
  } else {
    document.title = document.title.replace(/\|\s*NUSC(?:\s+Student Hub)?\s*$/i, '| ' + platformName);
  }
}

function createPlatformLogoImage(url, className, size) {
  const img = document.createElement('img');
  img.src = url;
  img.alt = 'شعار المنصة';
  img.className = className;
  img.loading = 'eager';
  img.decoding = 'async';
  img.style.width = size;
  img.style.height = size;
  img.style.objectFit = 'contain';
  img.style.display = 'block';
  img.style.flexShrink = '0';
  img.style.borderRadius = '8px';
  img.style.background = '#fff';
  img.style.padding = '2px';
  img.addEventListener('error', () => img.remove(), { once: true });
  return img;
}

function applyPlatformLogo(url) {
  if (typeof document === 'undefined' || !/^https?:\/\//i.test(url || '')) return;

  // Refresh image sources when an administrator changes the logo in the current session.
  document.querySelectorAll('.platform-brand-image, .platform-header-logo, .auth-brand-logo').forEach((img) => {
    if (img.src !== url) img.src = url;
  });

  document.querySelectorAll('.app-header .logo-icon').forEach((slot) => {
    if (slot.querySelector('.platform-brand-image')) return;
    slot.replaceChildren(createPlatformLogoImage(url, 'platform-brand-image', '100%'));
    slot.setAttribute('aria-label', 'شعار المنصة');
  });

  document.querySelectorAll('.auth-brand .auth-brand-dot').forEach((slot) => {
    if (slot.dataset.platformLogoApplied === 'true') return;
    const img = createPlatformLogoImage(url, 'auth-brand-logo', '38px');
    img.style.width = '38px';
    img.style.height = '38px';
    img.style.borderRadius = '10px';
    slot.replaceWith(img);
  });

  document.querySelectorAll('.splash > .logo').forEach((slot) => {
    if (slot.querySelector('.platform-brand-image')) return;
    slot.replaceChildren(createPlatformLogoImage(url, 'platform-brand-image', '100%'));
  });

  document.querySelectorAll('.app-header a.logo').forEach((anchor) => {
    if (anchor.querySelector('.logo-icon') || anchor.querySelector('.platform-header-logo')) return;
    const img = createPlatformLogoImage(url, 'platform-header-logo', '30px');
    img.style.width = '30px';
    img.style.height = '30px';
    const leadingIcon = anchor.querySelector(':scope > [data-icon]');
    if (leadingIcon) leadingIcon.after(img);
    else anchor.prepend(img);
  });
}

function normalizeSettingBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

async function isActiveContentManager() {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return false;
    const { data: profile, error } = await supabase.from('profiles')
      .select('role, is_active').eq('id', user.id).maybeSingle();
    if (error) return false;
    return ['admin', 'moderator'].includes(profile?.role) && profile?.is_active !== false;
  } catch {
    return false;
  }
}

async function enforceMaintenanceMode(enabled) {
  if (!enabled || typeof window === 'undefined') return;
  const pathname = window.location.pathname.toLowerCase();

  // Keep the admin console and account recovery available so the team can turn maintenance off.
  const safePaths = ['/admin', '/login.html', '/forgot-password.html', '/reset-password.html', '/maintenance.html'];
  if (safePaths.some((path) => pathname === path || pathname.startsWith(path + '/'))) return;

  if (await isActiveContentManager()) return;

  if (pathname !== '/maintenance.html') {
    window.location.replace('/maintenance.html');
  }
}

async function loadPlatformBranding() {
  try {
    const { data, error } = await supabase.from('platform_settings')
      .select('key, value').in('key', [
        'platform_logo_url',
        'site_name',
        'site_maintenance',
        'maintenance_message'
      ]);
    if (error) throw error;
    const settings = new Map((data || []).map((item) => [item.key, item.value]));
    const logoUrl = normalizePlatformLogo(settings.get('platform_logo_url'));
    const platformName = normalizePlatformName(settings.get('site_name'));
    applyPlatformLogo(logoUrl);
    if (platformName) applyPlatformName(platformName);
    await enforceMaintenanceMode(normalizeSettingBoolean(settings.get('site_maintenance')));
  } catch (error) {
    // Missing branding settings should never stop authentication or other pages from loading.
    console.warn('[NUSC] Could not load platform branding or maintenance mode:', error?.message || error);
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.NUSCBranding = { apply: applyPlatformLogo, applyName: applyPlatformName };
  window.addEventListener('nusc:branding-updated', (event) => {
    const url = normalizePlatformLogo(event.detail?.url);
    const name = normalizePlatformName(event.detail?.name);
    if (url) applyPlatformLogo(url);
    if (name) applyPlatformName(name);
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadPlatformBranding, { once: true });
  } else {
    loadPlatformBranding();
  }
}

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
