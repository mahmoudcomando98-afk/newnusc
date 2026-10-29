/**
 * Client-side DevTools guard (deterrent + admin alerts).
 * Cannot truly hide source files — the browser always downloads JS/CSS.
 */
import { supabase } from './supabase.js';

const ATTEMPT_KEY = 'nusc_devtools_attempts';
const PENDING_KEY = 'nusc_devtools_pending';
const SIZE_THRESHOLD = 160;

let redirecting = false;
let lastSizeHit = 0;

function isExemptPath() {
  const p = (window.location.pathname || '').toLowerCase();
  return (
    p.includes('/admin') ||
    p.endsWith('/devtools-blocked.html') ||
    p.endsWith('/devtools-blocked') ||
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

function isLikelyMobile() {
  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
  } catch {
    /* ignore */
  }
  const ua = String(navigator.userAgent || '');
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry/i.test(ua) || window.innerWidth < 700;
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

async function goToBlockPage(reason) {
  if (redirecting || isExemptPath()) return;
  redirecting = true;
  const count = bumpAttemptCount();
  try {
    await Promise.race([
      reportDevtoolsAttempt(reason, count),
      new Promise((resolve) => setTimeout(resolve, 2800))
    ]);
  } catch {
    /* still redirect */
  }
  const q = new URLSearchParams({
    from: window.location.pathname || '/home.html',
    n: String(count),
    r: reason || 'key'
  });
  window.location.replace(`/devtools-blocked.html?${q.toString()}`);
}

function isDevtoolsOpenBySize() {
  if (isLikelyMobile()) return false;
  try {
    const widthGap = Math.abs(window.outerWidth - window.innerWidth);
    const heightGap = Math.abs(window.outerHeight - window.innerHeight);
    // Side docked or bottom docked DevTools usually creates a large gap
    return widthGap > SIZE_THRESHOLD || heightGap > SIZE_THRESHOLD;
  } catch {
    return false;
  }
}

function checkSizeOpen() {
  if (redirecting || isExemptPath()) return;
  if (!isDevtoolsOpenBySize()) return;
  const now = Date.now();
  // Require two hits ~1s apart to reduce false positives
  if (lastSizeHit && now - lastSizeHit < 900) {
    goToBlockPage('devtools-open');
    return;
  }
  lastSizeHit = now;
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
  const isCtrlShiftK =
    (e.ctrlKey || e.metaKey) && e.shiftKey && (key === 'K' || key === 'k' || code === 'KeyK');
  const isCtrlU =
    (e.ctrlKey || e.metaKey) && !e.shiftKey && (key === 'u' || key === 'U' || code === 'KeyU');
  const isCtrlS =
    (e.ctrlKey || e.metaKey) && !e.shiftKey && (key === 's' || key === 'S' || code === 'KeyS');

  if (isF12 || isCtrlShiftI || isCtrlShiftJ || isCtrlShiftC || isCtrlShiftK || isCtrlU || isCtrlS) {
    e.preventDefault();
    e.stopPropagation();
    goToBlockPage(
      isF12
        ? 'F12'
        : isCtrlU
          ? 'view-source'
          : isCtrlS
            ? 'save-page'
            : 'devtools-shortcut'
    );
  }
}

function onContextMenu(e) {
  if (isExemptPath() || isLikelyMobile()) return;
  // Soft block only on desktop student pages
  e.preventDefault();
}

export function initDevtoolsGuard() {
  if (typeof window === 'undefined' || isExemptPath()) return;
  if (window.__nuscDevtoolsGuard) return;
  window.__nuscDevtoolsGuard = true;

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('contextmenu', onContextMenu, true);
  window.addEventListener('resize', checkSizeOpen);
  window.addEventListener('focus', checkSizeOpen);

  // Continuous scan (desktop): catches DevTools opened from menu / already open
  window.setInterval(checkSizeOpen, 1200);
  checkSizeOpen();
}

export default { initDevtoolsGuard, reportDevtoolsAttempt, flushPendingDevtoolsAlert };
