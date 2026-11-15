/**
 * تنقل المنصة:
 * - soft-nav: تبديل الصفحة بدون reload كامل
 * - prefetch عند اللمس/المرور
 * - شريط تقدّم رفيع أثناء التبديل
 */

import { softNavigate } from './soft-nav.js';

const PREFETCHED = new Set();

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
  if (/\.(pdf|zip|png|jpe?g|gif|webp)(\?|$)/i.test(href)) return false;
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

async function navigateWithTransition(href) {
  try {
    await softNavigate(href);
  } catch {
    window.location.href = href;
  }
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
    fetch(abs, { credentials: 'same-origin', headers: { Accept: 'text/html' } })
      .then((r) => (r.ok ? r.text() : ''))
      .then((html) => {
        if (!html) return;
        const m = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i);
        if (m && m[1]) {
          const s = document.createElement('link');
          s.rel = 'modulepreload';
          s.href = m[1];
          document.head.appendChild(s);
        }
      })
      .catch(() => {});
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

function ensureStyles() {
  if (document.getElementById('comando-pt-css')) return;
  const link = document.createElement('link');
  link.id = 'comando-pt-css';
  link.rel = 'stylesheet';
  link.href = '/assets/css/page-transitions.css?v=soft-2';
  document.head.appendChild(link);
}

function init() {
  if (typeof document === 'undefined') return;
  ensureStyles();
  markEnter();
  document.addEventListener('click', onClick, true);
  document.addEventListener('pointerdown', onPrefetchIntent, { passive: true, capture: true });
  document.addEventListener('mouseover', onPrefetchIntent, { passive: true, capture: true });

  try {
    document
      .querySelectorAll('.bottom-nav a[href], .app-header a[href], .desktop-nav a[href], .dashboard-shortcuts a[href]')
      .forEach((a) => {
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

export { navigateWithTransition, prefetch, softNavigate };
