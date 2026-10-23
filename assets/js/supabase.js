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
    return profile?.role === 'admin' && profile?.is_active === true;
  } catch {
    return false;
  }
}

function isMaintenanceEnabled(value) {
  return normalizeSettingBoolean(value);
}

function isMaintenanceExemptPath(pathname) {
  // The maintenance page must always remain available. Login is the sole public
  // entry point needed for the real administrator to sign in and reopen the site.
  return pathname === '/maintenance.html' || pathname === '/login.html';
}

async function enforceMaintenanceMode(enabled) {
  if (typeof window === 'undefined') return false;
  const pathname = window.location.pathname.toLowerCase();

  // The maintenance notice is the only public app page allowed during downtime.
  if (pathname === '/maintenance.html') return false;
  if (!enabled) return false;

  // Admin accounts stay available so the real administrator can disable maintenance.
  if (await isActiveContentManager()) return false;

  // Keep login available as the administrator's recovery path. Any non-admin
  // who signs in is redirected back to the maintenance page on the next route.
  if (isMaintenanceExemptPath(pathname)) return false;

  window.location.replace('/maintenance.html');
  return true;
}

function beginMaintenanceCheck() {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.add('nusc-maintenance-pending');
  if (document.getElementById('nusc-maintenance-check-style')) return;
  const style = document.createElement('style');
  style.id = 'nusc-maintenance-check-style';
  style.textContent = `
    html.nusc-maintenance-pending body { visibility: hidden !important; }
    /* Keep the page hidden until the maintenance check completes, but show no
       loading message or spinner to avoid a distracting intermediate screen. */
    html.nusc-maintenance-pending::before {
      content: "";
      position: fixed; inset: 0; z-index: 2147483647;
      background: #fffef8;
    }
  `;
  document.head.appendChild(style);
}

function finishMaintenanceCheck() {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('nusc-maintenance-pending');
  }
}

let maintenanceMonitorStarted = false;
function startMaintenanceMonitor() {
  if (maintenanceMonitorStarted || typeof window === 'undefined') return;
  maintenanceMonitorStarted = true;

  // Also lock already-open tabs shortly after an admin switches maintenance on.
  window.setInterval(async () => {
    const pathname = window.location.pathname.toLowerCase();
    if (pathname === '/maintenance.html' || pathname === '/login.html') return;
    try {
      const { data, error } = await supabase.from('platform_settings')
        .select('value').eq('key', 'site_maintenance').maybeSingle();
      if (error) throw error;
      if (isMaintenanceEnabled(data?.value)) {
        await enforceMaintenanceMode(true);
      }
    } catch (error) {
      // A transient poll failure should not repeatedly interrupt a live session.
      console.warn('[NUSC] Maintenance status refresh failed:', error?.message || error);
    }
  }, 8000);
}

async function loadPlatformBranding() {
  beginMaintenanceCheck();
  let redirected = false;
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

    redirected = await enforceMaintenanceMode(isMaintenanceEnabled(settings.get('site_maintenance')));
    if (!redirected) startMaintenanceMonitor();
  } catch (error) {
    console.warn('[NUSC] Could not load platform settings or verify maintenance mode:', error?.message || error);
    const pathname = typeof window === 'undefined' ? '' : window.location.pathname.toLowerCase();

    // Fail closed on app pages if maintenance status cannot be verified. The
    // maintenance notice remains readable and explains that a retry may help.
    if (typeof window !== 'undefined' && pathname !== '/maintenance.html' && pathname !== '/login.html') {
      redirected = true;
      window.location.replace('/maintenance.html?status=unavailable');
    }
  } finally {
    if (!redirected) finishMaintenanceCheck();
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
  // Lock the rendered UI before starting the asynchronous maintenance lookup.
  beginMaintenanceCheck();
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
