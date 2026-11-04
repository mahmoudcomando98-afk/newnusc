import './cairo-font.js';
import './egyptian-ar.js';

/**
 * COMANDO Student Hub - Supabase Client
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

function createSafeAuthStorage() {
  const memory = new Map();

  function read(storage, key) {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  function write(storage, key, value) {
    try {
      if (!storage) return false;
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function remove(storage, key) {
    try {
      storage?.removeItem(key);
    } catch {
      /* storage may be unavailable */
    }
  }

  function getStorage(name) {
    try {
      if (typeof window === 'undefined') return null;
      return window[name];
    } catch {
      return null;
    }
  }

  const local = getStorage('localStorage');
  const session = getStorage('sessionStorage');

  return {
    getItem(key) {
      const localValue = read(local, key);
      if (localValue !== null) return localValue;
      const sessionValue = read(session, key);
      if (sessionValue !== null) return sessionValue;
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      if (write(local, key, value)) {
        remove(session, key);
        memory.delete(key);
        return;
      }
      if (write(session, key, value)) {
        memory.delete(key);
        return;
      }
      memory.set(key, value);
    },
    removeItem(key) {
      remove(local, key);
      remove(session, key);
      memory.delete(key);
    }
  };
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'nusc-auth-token',
    storage: createSafeAuthStorage(),
    flowType: 'pkce'
  },
  global: {
    headers: { 'x-client-info': 'comando-student-hub' }
  }
});

if (typeof window !== 'undefined') {
  try {
    supabase.auth.startAutoRefresh();
  } catch {
    /* ignore */
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (data?.session) supabase.auth.refreshSession().catch(() => {});
        })
        .catch(() => {});
    }
  });
}

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
  document.querySelectorAll('.auth-brand').forEach((brand) => {
    const label = Array.from(brand.children).find(
      (child) =>
        child.tagName === 'SPAN' &&
        !child.classList.contains('auth-brand-dot') &&
        !child.classList.contains('auth-brand-logo')
    );
    if (label) label.textContent = platformName;
  });
  document.querySelectorAll('.logo-word, .footer-brand').forEach((el) => {
    el.textContent = platformName;
  });
  const welcome = document.getElementById('welcome-text');
  if (welcome) welcome.textContent = 'أهلاً بك في ' + platformName;
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

function parseSettingTimestamp(value) {
  if (value == null || value === '' || value === 'null') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const raw = typeof value === 'string' ? value.trim() : String(value).trim();
  if (!raw || raw === 'null') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isMaintenanceActiveFromSettings(settingsMap) {
  const get = (key) =>
    settingsMap instanceof Map ? settingsMap.get(key) : settingsMap?.[key];

  if (normalizeSettingBoolean(get('site_maintenance'))) return true;

  const start = parseSettingTimestamp(get('maintenance_start_at'));
  const end = parseSettingTimestamp(get('maintenance_end_at'));
  if (!start && !end) return false;

  const now = Date.now();
  if (start && end) return now >= start.getTime() && now <= end.getTime();
  if (start) return now >= start.getTime();
  return now <= end.getTime();
}

async function isActiveAdmin() {
  try {
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();
    if (userError || !user) return false;
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle();
    if (error) return false;
    return profile?.role === 'admin' && profile?.is_active === true;
  } catch {
    return false;
  }
}

function isMaintenanceExemptPath(pathname) {
  const p = (pathname || '').toLowerCase();
  return (
    p === '/maintenance-mode.html' ||
    p === '/login.html' ||
    p.startsWith('/admin/')
  );
}

async function enforceMaintenanceMode(enabled) {
  if (typeof window === 'undefined') return false;
  const pathname = window.location.pathname.toLowerCase();
  if (pathname === '/maintenance-mode.html') return false;
  if (!enabled) return false;
  if (await isActiveAdmin()) return false;
  if (isMaintenanceExemptPath(pathname)) return false;
  window.location.replace('/maintenance-mode.html');
  return true;
}

let maintenanceMonitorStarted = false;
function startMaintenanceMonitor() {
  if (maintenanceMonitorStarted || typeof window === 'undefined') return;
  maintenanceMonitorStarted = true;
  window.setInterval(async () => {
    const pathname = window.location.pathname.toLowerCase();
    if (pathname === '/maintenance-mode.html' || pathname === '/login.html') return;
    if (pathname.startsWith('/admin/')) return;
    try {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', ['site_maintenance', 'maintenance_start_at', 'maintenance_end_at']);
      if (error) throw error;
      const map = new Map((data || []).map((row) => [row.key, row.value]));
      if (isMaintenanceActiveFromSettings(map)) {
        await enforceMaintenanceMode(true);
      }
    } catch (error) {
      console.warn('[COMANDO] Maintenance status refresh failed:', error?.message || error);
    }
  }, 60000);
}

async function loadPlatformBranding() {
  try {
    const { data, error } = await supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', [
        'platform_logo_url',
        'site_name',
        'site_maintenance',
        'maintenance_message',
        'maintenance_start_at',
        'maintenance_end_at'
      ]);
    if (error) throw error;

    const settings = new Map((data || []).map((item) => [item.key, item.value]));
    const logoUrl = normalizePlatformLogo(settings.get('platform_logo_url'));
    const platformName = normalizePlatformName(settings.get('site_name'));
    applyPlatformLogo(logoUrl);
    if (platformName) applyPlatformName(platformName);

    const redirected = await enforceMaintenanceMode(isMaintenanceActiveFromSettings(settings));
    if (!redirected) startMaintenanceMonitor();
  } catch (error) {
    console.warn('[COMANDO] Could not load platform settings:', error?.message || error);
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

  window.addEventListener('nusc:maintenance-updated', async (event) => {
    const detail = event.detail || {};
    const map = new Map([
      ['site_maintenance', detail.enabled],
      ['maintenance_start_at', detail.start_at ?? null],
      ['maintenance_end_at', detail.end_at ?? null]
    ]);
    const enabled =
      detail.active_now != null
        ? !!detail.active_now
        : isMaintenanceActiveFromSettings(map);
    const pathname = window.location.pathname.toLowerCase();
    if (enabled) {
      await enforceMaintenanceMode(true);
    } else if (pathname === '/maintenance-mode.html') {
      window.location.replace('/home.html');
    }
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
    new Promise((_, reject) => setTimeout(() => reject(new Error('انتهت مهلة الاتصال بـ Supabase')), ms))
  ]);
}

export async function getSession() {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) console.warn('[COMANDO] getSession:', error.message);
    return data?.session || null;
  } catch (err) {
    console.warn('[COMANDO] getSession failed:', err?.message || err);
    return null;
  }
}

export async function getCurrentUser() {
  if (!isSupabaseConfigured()) return null;
  try {
    const {
      data: { user },
      error
    } = await withTimeout(supabase.auth.getUser(), 10000);
    if (error) return null;
    return user;
  } catch {
    return null;
  }
}

function profileFromAuthUser(user) {
  if (!user?.id) return null;
  const meta = user.user_metadata || {};
  const fullName =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    (user.email ? String(user.email).split('@')[0] : '') ||
    'طالب';
  return {
    id: user.id,
    full_name: fullName,
    email: user.email || meta.email || '',
    student_id: meta.student_id || null,
    college: meta.college || null,
    academic_year: meta.academic_year || null,
    avatar_url: meta.avatar_url || null,
    role: meta.role === 'admin' || meta.role === 'moderator' ? meta.role : 'student',
    is_active: true,
    created_at: user.created_at || null,
    _from_auth_fallback: true
  };
}

export async function getProfile(userId = null) {
  const authUser = await getCurrentUser();
  const uid = userId || authUser?.id;
  if (!uid) return null;

  try {
    const { data, error } = await withTimeout(
      supabase
        .from('profiles')
        .select('id, full_name, email, student_id, college, academic_year, avatar_url, role, is_active, created_at')
        .eq('id', uid)
        .maybeSingle(),
      8000
    );
    if (!error && data) {
      if (!data.full_name && authUser?.id === uid) {
        const fb = profileFromAuthUser(authUser);
        if (fb?.full_name) data.full_name = fb.full_name;
      }
      if (!data.email && authUser?.email) data.email = authUser.email;
      return data;
    }
    if (error) console.warn('[COMANDO] profile:', error.message);
  } catch (err) {
    console.warn('[COMANDO] getProfile:', err?.message || err);
  }

  if (authUser?.id === uid) return profileFromAuthUser(authUser);
  try {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (user?.id === uid) return profileFromAuthUser(user);
  } catch {
    /* ignore */
  }
  return {
    id: uid,
    full_name: 'طالب',
    email: '',
    role: 'student',
    is_active: true,
    _from_auth_fallback: true
  };
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
