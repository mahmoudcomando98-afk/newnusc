/**
 * تنقل المنصة: soft-nav فوري + prefetch.
 * لا يخفي محتوى الصفحة.
 */

import { softNavigate } from './soft-nav.js';

const PREFETCHED = new Set();

const PAGE_MODULES = {
  '/home.html': '/assets/js/home.js',
  '/subjects.html': '/assets/js/subjects.js',
  '/subject-details.html': '/assets/js/subject-details.js',
  '/quizzes.html': '/assets/js/quizzes.js',
  '/quiz-take.html': '/assets/js/quiz-take.js',
  '/schedule.html': '/assets/js/schedule.js',
  '/profile.html': '/assets/js/profile.js',
  '/notifications.html': '/assets/js/notifications.js',
  '/updates.html': '/assets/js/updates.js',
  '/past-exams.html': '/assets/js/past-exams.js',
  '/online-sections.html': '/assets/js/online-sections.js',
  '/online-schedule.html': '/assets/js/online-schedule.js',
  '/file-view.html': '/assets/js/file-view.js',
  '/study-plan.html': '/assets/js/study-plan.js',
  '/midterm-schedule.html': '/assets/js/midterm-schedule.js',
  '/store.html': '/assets/js/store.js'
};

function sameOrigin(href) {
  try {
    return new URL(href, window.location.href).origin === window.location.origin;
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
  if (/\.(pdf|zip|png|jpe?g|gif|webp|mp4)(\?|$)/i.test(href)) return false;
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

function pathOnly(href) {
  try {
    return new URL(href, window.location.href).pathname;
  } catch {
    return '';
  }
}

function ensureStyles() {
  if (document.getElementById('comando-pt-css')) return;
  const link = document.createElement('link');
  link.id = 'comando-pt-css';
  link.rel = 'stylesheet';
  link.href = '/assets/css/page-transitions.css?v=safe-4';
  document.head.appendChild(link);
}

function ensureProgressBar() {
  if (document.getElementById('comando-nav-progress')) return;
  const el = document.createElement('div');
  el.id = 'comando-nav-progress';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<span></span>';
  document.documentElement.appendChild(el);
}

function markEnter() {
  document.documentElement.classList.add('pt-ready', 'pt-enter');
  document.documentElement.classList.remove('pt-exit');
}

async function navigateWithTransition(href) {
  try {
    await softNavigate(href);
  } catch {
    window.location.href = href;
  }
}

function modulepreload(src) {
  try {
    if (!src || PREFETCHED.has('mod:' + src)) return;
    PREFETCHED.add('mod:' + src);
    const link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = src;
    document.head.appendChild(link);
  } catch {
    /* ignore */
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
    const path = pathOnly(abs);
    if (PAGE_MODULES[path]) modulepreload(PAGE_MODULES[path]);
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
  prefetch(a.href);
  navigateWithTransition(a.href);
}

function onPrefetchIntent(e) {
  const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
  if (!isNavigableLink(a)) return;
  prefetch(a.href);
}

function prefetchMainRoutes() {
  const routes = [
    '/home.html',
    '/subjects.html',
    '/quizzes.html',
    '/schedule.html',
    '/profile.html',
    '/notifications.html',
    '/updates.html',
    '/past-exams.html',
    '/online-sections.html'
  ];
  const run = () => {
    routes.forEach((r) => prefetch(r));
    try {
      document
        .querySelectorAll(
          '.bottom-nav a[href], .app-header a[href], .desktop-nav a[href], .dashboard-shortcuts a[href]'
        )
        .forEach((a) => {
          if (isNavigableLink(a)) prefetch(a.href);
        });
    } catch {
      /* ignore */
    }
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 1500 });
  } else {
    window.setTimeout(run, 350);
  }
}

function init() {
  if (typeof document === 'undefined') return;
  ensureStyles();
  ensureProgressBar();
  markEnter();
  document.addEventListener('click', onClick, true);
  document.addEventListener('pointerdown', onPrefetchIntent, { passive: true, capture: true });
  document.addEventListener('mouseover', onPrefetchIntent, { passive: true, capture: true });
  prefetchMainRoutes();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}

export { navigateWithTransition, prefetch, softNavigate };
