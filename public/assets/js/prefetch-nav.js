/**
 * COMANDO — Prefetch عند الاهتمام (hover/touch/focus) + في الخلفية
 * الهدف: أي تنقل داخل المنصة يكون شبه فوري — الـ HTML يكون جاهزاً في كاش المتصفح
 * قبل ما الطالب يدوس على اللينك أصلاً.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  /* التسجيل الفوري للـ Service Worker — عشان الـ SWR يشتغل على أول زيارة كمان */
  try {
    if (navigator.serviceWorker) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {
        /* تجاهل فشل التسجيل (بيبقى مقبول لو السيرفر منع SW) */
      });
    }
  } catch (e) {
    /* تجاهل */
  }

  var CONNECTION = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  var saveData = CONNECTION && (CONNECTION.saveData === true || CONNECTION.effectiveType === 'slow-2g' || CONNECTION.effectiveType === '2g');
  if (saveData) return; // احترم تفعيل وضع توفير البيانات

  var MAIN_ROUTES = [
    '/home.html',
    '/subjects.html',
    '/quizzes.html',
    '/schedule.html',
    '/notifications.html',
    '/updates.html',
    '/favorites.html',
    '/profile.html',
    '/past-exams.html',
    '/online-sections.html',
    '/study-plan.html',
    '/faq.html'
  ];

  var prefetched = new Set();

  function shouldSkip(url) {
    try {
      var u = new URL(url, location.href);
      if (u.origin !== location.origin) return true;
      if (u.hash && u.pathname === location.pathname) return true;
      if (/(\/admin\/|logout|signout)/i.test(u.pathname)) return true;
      if (/\.(pdf|zip|png|jpe?g|gif|webp|mp4|webm)(\?|$)/i.test(u.pathname)) return true;
      return false;
    } catch (e) {
      return true;
    }
  }

  function prefetchOne(href) {
    if (!href) return;
    var key;
    try {
      key = new URL(href, location.href).href;
    } catch (e) {
      return;
    }
    if (prefetched.has(key) || shouldSkip(key)) return;
    prefetched.add(key);
    try {
      var link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = key;
      link.as = 'document';
      document.head.appendChild(link);
    } catch (e) {
      /* ignore */
    }
  }

  function onPointerDown(event) {
    var a = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (a) prefetchOne(a.href);
  }

  function onPointerEnter(event) {
    var a = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (a) prefetchOne(a.href);
  }

  function onFocusIn(event) {
    var a = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (a) prefetchOne(a.href);
  }

  function onPointerMove(event) {
    var a = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (a) prefetchOne(a.href);
  }

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerenter', onPointerEnter, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('mouseover', onPointerMove, { capture: true, passive: true });

  /* prefetch كل الراوتوت الأساسية في الخلفية لما فيه وقت فاضي */
  function prefetchIdle() {
    for (var i = 0; i < MAIN_ROUTES.length; i++) prefetchOne(MAIN_ROUTES[i]);
  }
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(prefetchIdle, { timeout: 2500 });
  } else {
    window.setTimeout(prefetchIdle, 800);
  }
})();
