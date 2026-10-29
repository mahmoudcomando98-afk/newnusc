/**
 * Require Google Chrome for student-facing pages.
 * Opening Chrome automatically works best on Android/iOS; on desktop we guide the user.
 */

const EXEMPT = [
  '/admin',
  '/chrome-required',
  '/devtools-blocked',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/banned',
  '/teacher-upload',
  '/maintenance',
  '/offline',
  '/404',
  '/500'
];

function pathExempt() {
  const p = (window.location.pathname || '').toLowerCase();
  if (p === '/' || p.endsWith('/index.html')) return true;
  return EXEMPT.some((x) => p.includes(x));
}

/** True only for Google Chrome (not Edge / Opera / Firefox / Safari / Brave when detectable) */
export function isGoogleChrome() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';

  // Brave
  try {
    if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
      // isBrave returns a Promise in some versions — treat presence as Brave
      return false;
    }
  } catch {
    /* ignore */
  }
  if (/Brave/i.test(ua)) return false;

  // Other Chromium forks
  if (/Edg\//.test(ua) || /EdgiOS\//.test(ua)) return false;
  if (/OPR\//.test(ua) || /Opera/.test(ua)) return false;
  if (/SamsungBrowser/i.test(ua)) return false;
  if (/Firefox|FxiOS/i.test(ua)) return false;
  if (/CriOS\//.test(ua)) return true; // Chrome on iOS
  if (/Chrome\//.test(ua) && /Android/i.test(ua)) return true;

  // Desktop Chrome usually has Google vendor
  if (/Chrome\//.test(ua) && /Google Inc/i.test(navigator.vendor || '')) return true;

  // Fallback: Chrome without Edge/Opera markers
  if (/Chrome\//.test(ua) && !/Edg|OPR|Brave|Samsung/i.test(ua) && !/Safari\//.test(ua.replace(/Chrome.*Safari/, 'Chrome'))) {
    // UA still contains Safari token in Chrome; check Chromium
    if (window.chrome && !/Edg/.test(ua)) return true;
  }

  if (window.chrome && /Chrome\//.test(ua) && !/Edg|OPR|Samsung|Brave/i.test(ua)) return true;

  return false;
}

export function buildChromeOpenUrl(targetUrl) {
  const url = targetUrl || window.location.href;
  const ua = navigator.userAgent || '';
  const android = /Android/i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua);

  if (android) {
    // Opens in Chrome if installed; otherwise fallback to same URL in current browser
    const withoutScheme = url.replace(/^https?:\/\//i, '');
    return (
      'intent://' +
      withoutScheme +
      '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' +
      encodeURIComponent(url) +
      ';end'
    );
  }

  if (ios) {
    // googlechrome://example.com/path
    return 'googlechrome://' + url.replace(/^https?:\/\//i, '');
  }

  // Desktop: no reliable force-open; return null so UI copies/guides
  return null;
}

export function openInChrome(targetUrl) {
  const url = targetUrl || window.location.href;
  const deep = buildChromeOpenUrl(url);

  if (deep) {
    window.location.href = deep;
    return { mode: 'deep-link' };
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
  } catch {
    /* ignore */
  }

  return { mode: 'manual', url };
}

export function enforceChromeOnly() {
  if (typeof window === 'undefined') return false;
  if (pathExempt()) return false;
  if (isGoogleChrome()) return false;

  const next = window.location.pathname + window.location.search + window.location.hash;
  const q = new URLSearchParams({ next: next || '/home.html' });
  window.location.replace('/chrome-required.html?' + q.toString());
  return true;
}

export function initChromeOnly() {
  enforceChromeOnly();
}

export default {
  isGoogleChrome,
  openInChrome,
  enforceChromeOnly,
  initChromeOnly,
  buildChromeOpenUrl
};
