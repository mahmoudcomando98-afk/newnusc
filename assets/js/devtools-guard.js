/**
 * Soft client-side guard: detect common DevTools shortcuts and log attempts.
 * This does NOT hide source files from a determined user — browser always ships JS/CSS.
 */
import { supabase } from './supabase.js';

const ATTEMPT_KEY = 'nusc_devtools_attempts';
const LAST_REPORT_KEY = 'nusc_devtools_last_report';
const COOLDOWN_MS = 8000;

function isExemptPath() {
  const p = (window.location.pathname || '').toLowerCase();
  return (
    p.includes('/admin') ||
    p.endsWith('/devtools-blocked.html') ||
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

async function reportAttempt(reason) {
  try {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(LAST_REPORT_KEY) || 0);
    if (now - last < COOLDOWN_MS) return;
    sessionStorage.setItem(LAST_REPORT_KEY, String(now));
  } catch {
    /* ignore */
  }

  let userId = null;
  let email = null;
  let fullName = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data?.user?.id || null;
    email = data?.user?.email || null;
    fullName =
      data?.user?.user_metadata?.full_name ||
      data?.user?.user_metadata?.name ||
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

  const payload = {
    user_id: userId,
    email: email || null,
    full_name: fullName || null,
    reason: reason || 'devtools',
    page_path: (window.location.pathname || '') + (window.location.search || ''),
    user_agent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 400) : null,
    attempt_count: getAttemptCount()
  };

  try {
    await supabase.from('devtools_alerts').insert(payload);
  } catch {
    /* table may not exist yet */
  }
}

function goToBlockPage(reason) {
  const count = bumpAttemptCount();
  reportAttempt(reason).catch(() => {});
  const q = new URLSearchParams({
    from: window.location.pathname || '/home.html',
    n: String(count),
    r: reason || 'key'
  });
  window.location.replace(`/devtools-blocked.html?${q.toString()}`);
}

function onKeyDown(e) {
  if (isExemptPath()) return;
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

  if (isF12 || isCtrlShiftI || isCtrlShiftJ || isCtrlShiftC || isCtrlU) {
    e.preventDefault();
    e.stopPropagation();
    goToBlockPage(isF12 ? 'F12' : isCtrlU ? 'view-source' : 'devtools-shortcut');
  }
}

/**
 * Start guard on student pages. Call once after auth.
 */
export function initDevtoolsGuard() {
  if (typeof window === 'undefined' || isExemptPath()) return;
  if (window.__nuscDevtoolsGuard) return;
  window.__nuscDevtoolsGuard = true;
  window.addEventListener('keydown', onKeyDown, true);
}

export default { initDevtoolsGuard };
