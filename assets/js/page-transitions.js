/**
 * تنقل ناعم بين صفحات المنصة (MPA).
 * - دخول الصفحة: fade + حركة خفيفة
 * - الضغط على رابط داخلي: خروج قصير ثم الانتقال
 * - prefetch لروابط الشريط السفلي عند اللمس/المرور
 * يحترم prefers-reduced-motion
 */

const EXIT_MS = 160;
const PREFETCHED = new Set();

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function sameOrigin(href) {
  try {
    const u = new URL(href, window.location.href);
    return u.origin === window.location.origin;
  } catch {
    return false;
  }
}

function isNavigableLink(a) {
  if (!a || a.tagName !== 'A') return false;
  if (a.hasAttribute('download')) return false;
  if (a.target && a.target !== '_self') return false;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
  if (href.startsWith('javascript:')) return false;
  if (!sameOrigin(href)) return false;
  return true;
}

function normalizePath(href) {
  try {
    const u = new URL(href, window.location.href);
    return u.pathname + u.search + u.hash;
  } catch {
    return href;
  }
}

function markEnter() {
  document.documentElement.classList.add('pt-ready');
  document.documentElement.classList.remove('pt-exit');
  requestAnimationFrame(() => {
    document.documentElement.classList.add('pt-enter');
  });
}

function navigateWithTransition(href) {
  if (reducedMotion()) {
    window.location.href = href;
    return;
  }
  document.documentElement.classList.add('pt-exit');
  document.documentElement.classList.remove('pt-enter');
  window.setTimeout(() => {
    window.location.href = href;
  }, EXIT_MS);
}

function prefetch(href) {
  try {
    const abs = new URL(href, window.location.href).href;
    if (PREFETCHED.has(abs)) return;
    if (abs === window.location.href) return;
    PREFETCHED.add(abs);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = abs;
    link.as = 'document';
    document.head.appendChild(link);
  } catch {
    /* ignore */
  }
}

function onClick(e) {
  if (e.defaultPrevented) return;
  if (e.button !== 0) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
  if (!isNavigableLink(a)) return;

  const next = normalizePath(a.href);
  const cur = normalizePath(window.location.href);
  if (next === cur) {
    e.preventDefault();
    return;
  }

  e.preventDefault();
  navigateWithTransition(a.href);
}

function onPrefetchIntent(e) {
  const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
  if (!isNavigableLink(a)) return;
  prefetch(a.href);
}

function init() {
  if (typeof document === 'undefined') return;
  markEnter();
  document.addEventListener('click', onClick, true);
  document.addEventListener('pointerdown', onPrefetchIntent, { passive: true, capture: true });
  document.addEventListener('mouseover', onPrefetchIntent, { passive: true, capture: true });

  // Prefetch روابط الشريط السفلي فورًا
  try {
    document.querySelectorAll('.bottom-nav a[href], .app-header a[href]').forEach((a) => {
      if (isNavigableLink(a)) prefetch(a.href);
    });
  } catch {
    /* ignore */
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}

export { navigateWithTransition, prefetch };
