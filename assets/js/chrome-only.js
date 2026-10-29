/**
 * Chrome preference helper — DISABLED auto-redirect to avoid locking students out.
 * Keep helpers for optional future use / chrome-required page button only.
 */

export function isGoogleChrome() {
  if (typeof navigator === 'undefined') return true;
  const ua = navigator.userAgent || '';
  try {
    if (navigator.brave && typeof navigator.brave.isBrave === 'function') return false;
  } catch {
    /* ignore */
  }
  if (/Brave/i.test(ua)) return false;
  if (/Edg\//.test(ua) || /EdgiOS\//.test(ua)) return false;
  if (/OPR\//.test(ua) || /Opera/.test(ua)) return false;
  if (/SamsungBrowser/i.test(ua)) return false;
  if (/Firefox|FxiOS/i.test(ua)) return false;
  if (/CriOS\//.test(ua)) return true;
  if (/Chrome\//.test(ua) && /Android/i.test(ua)) return true;
  if (/Chrome\//.test(ua) && /Google Inc/i.test(navigator.vendor || '')) return true;
  if (window.chrome && /Chrome\//.test(ua) && !/Edg|OPR|Samsung|Brave/i.test(ua)) return true;
  return false;
}

export function buildChromeOpenUrl(targetUrl) {
  const url = targetUrl || window.location.href;
  const ua = navigator.userAgent || '';
  const android = /Android/i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua);
  if (android) {
    const withoutScheme = url.replace(/^https?:\/\//i, '');
    return (
      'intent://' +
      withoutScheme +
      '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' +
      encodeURIComponent(url) +
      ';end'
    );
  }
  if (ios) return 'googlechrome://' + url.replace(/^https?:\/\//i, '');
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

/** Disabled: was redirecting too many real students */
export function enforceChromeOnly() {
  return false;
}

export function initChromeOnly() {
  /* no-op */
}

export default {
  isGoogleChrome,
  openInChrome,
  enforceChromeOnly,
  initChromeOnly,
  buildChromeOpenUrl
};
