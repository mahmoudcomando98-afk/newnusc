/**
 * تنقل ناعم وآمن بين صفحات المنصة (MPA).
 * - لا يبدّل DOM ولا يعيد تشغيل السكربتات يدويًا (عشان ماينكسرش أي عنصر)
 * - حركة خروج/دخول خفيفة + شريط تقدّم رفيع
 * - prefetch للمستندات والـ modules قبل الضغط
 * - View Transitions عبر المتصفح عند التوفر
 */

const EXIT_MS = 140;
const PREFETCHED = new Set();

/** مسارات الصفحات الشائعة → سكربت الصفحة (للـ modulepreload) */
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
  '/login.html': '/assets/js/auth.js',
  '/past-exams.html': '/assets/js/past-exams.js',
  '/online-sections.html': '/assets/js/online-sections.js',
  '/online-schedule.html': '/assets/js/online-schedule.js',
  '/file-view.html': '/assets/js/file-view.js',
  '/study-plan.html': '/assets/js/study-plan.js',
  '/midterm-schedule.html': '/assets/js/midterm-schedule.js',
  '/store.html': '/assets/js/store.js'
};

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
  link.href = '/assets/css/page-transitions.css?v=safe-3';
  document.head.appendChild(link);
}

function ensureViewTransitionMeta() {
  if (document.querySelector('meta[name="view-transition"]')) return;
  const meta = document.createElement('meta');
  meta.name = 'view-transition';
  meta.content = 'same-origin';
  document.head.appendChild(meta);
}

function ensureProgressBar() {
  let el = document.getElementById('comando-nav-progress');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'comando-nav-progress';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<span></span>';
  document.documentElement.appendChild(el);
  return el;
}

function showProgress() {
  const el = ensureProgressBar();
  el.classList.remove('is-done');
  el.classList.add('is-active');
}

function markEnter() {
  document.documentElement.classList.add('pt-ready');
  document.documentElement.classList.remove('pt-exit');
  requestAnimationFrame(() => {
    document.documentElement.classList.add('pt-enter');
  });
  const bar = document.getElementById('comando-nav-progress');
  if (bar) {
    bar.classList.add('is-done');
    window.setTimeout(() => bar.classList.remove('is-active', 'is-done'), 220);
  }
}

function navigateWithTransition(href) {
  showProgress();
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
    if (PAGE_MODULES[path]) {
      modulepreload(PAGE_MODULES[path]);
    }
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
  // جهّز الصفحة قبل الانتقال مباشرة
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
    window.requestIdleCallback(run, { timeout: 1800 });
  } else {
    window.setTimeout(run, 400);
  }
}

function init() {
  if (typeof document === 'undefined') return;
  ensureStyles();
  ensureViewTransitionMeta();
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

export { navigateWithTransition, prefetch };
