/**
 * Soft DevTools deterrent: only explicit shortcuts (F12 / Ctrl+Shift+I...).
 * Size-based detection removed — it was falsely blocking normal users.
 */
import { supabase } from './supabase.js';

const ATTEMPT_KEY = 'nusc_devtools_attempts';
const PENDING_KEY = 'nusc_devtools_pending';

let redirecting = false;

function isExemptPath() {
  const p = (window.location.pathname || '').toLowerCase();
  return (
    p.includes('/admin') ||
    p.includes('devtools-blocked') ||
    p.includes('chrome-required') ||
    p.endsWith('/login.html') ||
    p.endsWith('/register.html') ||
    p.endsWith('/forgot-password.html') ||
    p.endsWith('/reset-password.html') ||
    p.endsWith('/banned.html') ||
    p.endsWith('/teacher-upload.html') ||
    p.endsWith('/maintenance-mode.html') ||
    p === '/' ||
    p.endsWith('/index.html')
  );
}

function getAttemptCount() {
  try {
    return Math.max(0, Number(sessionStorage.getItem(ATTEMPT_KEY) || 0));
  } catch {
    return 0;
  }
}

function bumpAttemptCount() {
  const n = getAttemptCount() + 1;
  try {
    sessionStorage.setItem(ATTEMPT_KEY, String(n));
  } catch {
    /* ignore */
  }
  return n;
}

function stashPending(payload) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export async function flushPendingDevtoolsAlert() {
  let raw = null;
  try {
    raw = sessionStorage.getItem(PENDING_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return false;
  }
  const ok = await insertAlert(payload);
  if (ok) {
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
  }
  return ok;
}

async function buildPayload(reason, attemptCount) {
  let userId = null;
  let email = null;
  let fullName = null;
  try {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    userId = user?.id || null;
    email = user?.email || null;
    fullName =
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      null;
    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', userId)
        .maybeSingle();
      if (profile?.full_name) fullName = profile.full_name;
      if (profile?.email) email = profile.email;
    }
  } catch {
    /* ignore */
  }

  return {
    user_id: userId,
    email: email || null,
    full_name: fullName || null,
    reason: reason || 'devtools',
    page_path: (window.location.pathname || '') + (window.location.search || ''),
    user_agent:
      typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 400) : null,
    attempt_count: attemptCount || getAttemptCount() || 1
  };
}

async function insertAlert(payload) {
  if (!payload) return false;
  try {
    const { error } = await supabase.from('devtools_alerts').insert(payload);
    if (error) {
      console.warn('[NUSC] devtools_alerts insert:', error.message || error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[NUSC] devtools_alerts insert failed:', err?.message || err);
    return false;
  }
}

export async function reportDevtoolsAttempt(reason, attemptCount) {
  const payload = await buildPayload(reason, attemptCount);
  stashPending(payload);
  const ok = await insertAlert(payload);
  if (ok) {
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* ignore */
    }
  }
  return ok;
}

function goToBlockPage(reason) {
  if (redirecting || isExemptPath()) return;
  redirecting = true;
  const count = bumpAttemptCount();
  reportDevtoolsAttempt(reason, count).catch(() => {});
  const q = new URLSearchParams({
    from: window.location.pathname || '/home.html',
    n: String(count),
    r: reason || 'key'
  });
  window.location.replace(`/devtools-blocked.html?${q.toString()}`);
}

function onKeyDown(e) {
  if (isExemptPath() || redirecting) return;
  const key = e.key || '';
  const code = e.code || '';
  const isF12 = key === 'F12' || code === 'F12';
  const isCtrlShiftI =
    (e.ctrlKey || e.metaKey) && e.shiftKey && (key === 'I' || key === 'i' || code === 'KeyI');
  const isCtrlShiftJ =
    (e.ctrlKey || e.metaKey) && e.shiftKey && (key === 'J' || key === 'j' || code === 'KeyJ');
  const isCtrlShiftC =
    (e.ctrlKey || e.metaKey) && e.shiftKey && (key === 'C' || key === 'c' || code === 'KeyC');
  const isCtrlU =
    (e.ctrlKey || e.metaKey) && !e.shiftKey && (key === 'u' || key === 'U' || code === 'KeyU');

  // لا نمنع Ctrl+S — كان يسبب إزعاج بدون فايدة
  if (isF12 || isCtrlShiftI || isCtrlShiftJ || isCtrlShiftC || isCtrlU) {
    e.preventDefault();
    e.stopPropagation();
    goToBlockPage(isF12 ? 'F12' : isCtrlU ? 'view-source' : 'devtools-shortcut');
  }
}

export function initDevtoolsGuard() {
  if (typeof window === 'undefined' || isExemptPath()) return;
  if (window.__nuscDevtoolsGuard) return;
  window.__nuscDevtoolsGuard = true;
  window.addEventListener('keydown', onKeyDown, true);
}

export default { initDevtoolsGuard, reportDevtoolsAttempt, flushPendingDevtoolsAlert };
