/**
 * Aggressive DevTools deterrent for student pages.
 * Note: browsers always allow opening DevTools; we blank the app and force leave.
 */
import { supabase } from './supabase.js';

const ATTEMPT_KEY = 'nusc_devtools_attempts';
const PENDING_KEY = 'nusc_devtools_pending';
const SIZE_THRESHOLD = 80;

let redirecting = false;

function isExemptPath() {
  const p = (window.location.pathname || '').toLowerCase();
  return (
    p.includes('/admin') ||
    p.includes('devtools-blocked') ||
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

/** Wipe UI immediately so Sources/Network are less useful while redirecting */
function lockPageNow() {
  try {
    document.documentElement.style.pointerEvents = 'none';
    const html =
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;' +
      'background:#f7f5f2;font-family:system-ui,sans-serif;padding:24px;text-align:center">' +
      '<div style="max-width:400px;background:#fff;border:1px solid #e8e4df;border-radius:14px;padding:24px">' +
      '<h1 style="color:#8a3a3a;font-size:1.15rem;margin:0 0 10px">تم حظر أدوات المطوّر</h1>' +
      '<p style="color:#5c564f;line-height:1.6;margin:0 0 16px">كده عيب — ما ينفعش تفتح أدوات المطوّر جوه المنصة.</p>' +
      '<a href="/home.html" style="display:inline-block;background:#c45c26;color:#fff;' +
      'text-decoration:none;padding:10px 18px;border-radius:10px">ارجع للصفحة الرئيسية</a>' +
      '</div></div>';
    document.body.innerHTML = html;
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

  // 1) امسح محتوى الصفحة فورًا
  lockPageNow();

  // 2) سجّل في الخلفية
  reportDevtoolsAttempt(reason, count).catch(() => {});

  // 3) حوّل لصفحة الحظر
  const q = new URLSearchParams({
    from: window.location.pathname || '/home.html',
    n: String(count),
    r: reason || 'key'
  });
  window.setTimeout(() => {
    window.location.replace(`/devtools-blocked.html?${q.toString()}`);
  }, 50);
}

function isDevtoolsOpenBySize() {
  if (isLikelyMobile()) return false;
  try {
    const widthGap = window.outerWidth - window.innerWidth;
    const heightGap = window.outerHeight - window.innerHeight;
    return widthGap > SIZE_THRESHOLD || heightGap > SIZE_THRESHOLD;
  } catch {
    return false;
  }
}

function checkOpen() {
  if (redirecting || isExemptPath()) return;
  if (isDevtoolsOpenBySize()) goToBlockPage('devtools-open');
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
      isF12 ? 'F12' : isCtrlU ? 'view-source' : isCtrlS ? 'save-page' : 'devtools-shortcut'
    );
  }
}

function onContextMenu(e) {
  if (isExemptPath() || isLikelyMobile()) return;
  e.preventDefault();
}

export function initDevtoolsGuard() {
  if (typeof window === 'undefined' || isExemptPath()) return;
  if (window.__nuscDevtoolsGuard) return;
  window.__nuscDevtoolsGuard = true;

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('contextmenu', onContextMenu, true);
  window.addEventListener('resize', checkOpen);
  window.addEventListener('focus', checkOpen);
  window.setInterval(checkOpen, 400);
  checkOpen();
}

export default { initDevtoolsGuard, reportDevtoolsAttempt, flushPendingDevtoolsAlert };
