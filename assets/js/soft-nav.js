/**
 * تنقل فوري بين صفحات المنصة (مثل SPA) بدون كسر السكربتات.
 * - يجلب HTML ويبدّل body
 * - يشغّل سكربت الصفحة فقط (cache-bust)
 * - عند أي فشل: location.href التقليدي
 */

let navigating = false;
let progressEl = null;
let popBound = false;

const PAGE_BOOT = {
  '/home.html': '/assets/js/home.js',
  '/subjects.html': '/assets/js/subjects.js',
  '/subject-details.html': '/assets/js/subject-details.js',
  '/quizzes.html': '/assets/js/quizzes.js',
  '/quiz-take.html': '/assets/js/quiz-take.js',
  '/quiz-rules.html': '/assets/js/quiz-rules.js',
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
  '/store.html': '/assets/js/store.js',
  '/login.html': null
};

const SKIP_RE =
  /page-transitions|soft-nav|supabase\.js|cairo-font|egyptian-ar|cache\.js|utils\.js|data-api|freshness|push\.js|native-app/i;

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function ensureProgress() {
  if (progressEl?.isConnected) return progressEl;
  const el = document.createElement('div');
  el.id = 'comando-nav-progress';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<span></span>';
  document.documentElement.appendChild(el);
  progressEl = el;
  return el;
}

function showProgress() {
  const el = ensureProgress();
  el.classList.remove('is-done');
  el.classList.add('is-active');
}

function hideProgress() {
  if (!progressEl) return;
  progressEl.classList.add('is-done');
  window.setTimeout(() => progressEl?.classList.remove('is-active', 'is-done'), 200);
}

function shouldHardNavigate(url) {
  try {
    const u = new URL(url, location.href);
    if (u.origin !== location.origin) return true;
    const p = u.pathname.toLowerCase();
    if (/\.(pdf|zip|png|jpe?g|gif|webp|mp4|webm)(\?|$)/i.test(p)) return true;
    if (p.includes('logout') || p.includes('signout')) return true;
    if (p.startsWith('/admin')) return true;
    if (p.endsWith('/login.html') || p === '/login') return true;
    if (p.endsWith('/index.html') || p === '/' || p.endsWith('/welcome.html')) return true;
    return false;
  } catch {
    return true;
  }
}

function pathOf(url) {
  try {
    return new URL(url, location.href).pathname;
  } catch {
    return '';
  }
}

function syncStylesheets(doc) {
  const have = new Set(
    [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => {
      try {
        return new URL(l.href).pathname;
      } catch {
        return l.getAttribute('href') || '';
      }
    })
  );
  doc.querySelectorAll('link[rel="stylesheet"]').forEach((node) => {
    const href = node.getAttribute('href');
    if (!href) return;
    let path;
    try {
      path = new URL(href, location.href).pathname;
    } catch {
      path = href;
    }
    if (have.has(path)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
    have.add(path);
  });
  /* انسخ كمان أي <style> inline في الصفحة الجديدة — صفحة الجدول والأدمن صفحات
     كبيرة من التنسيق inline، ولولا النسخ هنا هتظهر بدون أي تنسيق بعد التنقل الناعم.
     Dedup بالمحتوى مقابل كل الـ styles الموجودة أصلاً (مش بس المنسوخة) */
  const existing = new Set(
    [...document.querySelectorAll('style')].map((s) => (s.textContent || '').trim())
  );
  doc.querySelectorAll('style').forEach((node) => {
    const css = (node.textContent || '').trim();
    if (!css || existing.has(css)) return;
    existing.add(css);
    const style = document.createElement('style');
    if (node.id) style.id = node.id;
    style.setAttribute('data-soft-keep', '1');
    style.textContent = css;
    document.head.appendChild(style);
  });
}

async function bootPage(path, doc) {
  const clean = path.split('?')[0];
  const known = PAGE_BOOT[clean];

  // سكربتات module من الصفحة (src) — الصفحة الرئيسية فقط + native لو لزم
  const moduleSrcs = [...doc.querySelectorAll('script[type="module"][src]')]
    .map((s) => s.getAttribute('src'))
    .filter(Boolean);

  for (const src of moduleSrcs) {
    if (SKIP_RE.test(src)) continue;
    if (/splash-guard/i.test(src)) continue;
    try {
      const abs = new URL(src, location.href);
      // إزالة query قديمة ثم cache-bust لإعادة التشغيل
      abs.searchParams.set('soft', String(Date.now()));
      await import(/* @vite-ignore */ abs.href);
    } catch (err) {
      console.warn('[soft-nav] boot module', src, err);
    }
  }

  // لو مفيش script في الـ HTML بس عندنا mapping
  if (known && !moduleSrcs.some((s) => s.includes(known.split('/').pop()))) {
    try {
      await import(/* @vite-ignore */ known + '?soft=' + Date.now());
    } catch (err) {
      console.warn('[soft-nav] boot known', known, err);
    }
  }

  // inline modules بسيطة (install / offline)
  for (const node of doc.querySelectorAll('script[type="module"]:not([src])')) {
    const code = (node.textContent || '').trim();
    if (!code) continue;
    if (!/setupInstallPrompt|offline-retry|onConnectivityChange|protectPage/.test(code)) continue;
    // تجاهل لو بيعيد protect فقط بدون setup — home.js كافي
    if (/protectPage/.test(code) && !/setupInstallPrompt|offline/.test(code)) continue;
    try {
      const blob = new Blob([code], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob);
      await import(/* @vite-ignore */ url);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn('[soft-nav] inline', err);
    }
  }

  try {
    const { initIcons } = await import('./utils.js');
    initIcons?.();
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} href
 * @param {{ replace?: boolean }} [opts]
 */
export async function softNavigate(href, opts = {}) {
  if (navigating) return;
  if (shouldHardNavigate(href)) {
    location.href = href;
    return;
  }

  const targetPath = pathOf(href);
  if (targetPath === pathOf(location.href) && !opts.replace) {
    return;
  }

  navigating = true;
  showProgress();
  document.documentElement.classList.add('pt-exit');
  document.documentElement.classList.remove('pt-enter');

  try {
    const res = await fetch(href, {
      credentials: 'same-origin',
      headers: { Accept: 'text/html', 'X-Soft-Nav': '1' },
      cache: 'no-cache'
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc.body) throw new Error('empty body');

    const apply = () => {
      document.title = doc.title || document.title;
      syncStylesheets(doc);
      const theme = doc.querySelector('meta[name="theme-color"]');
      const curTheme = document.querySelector('meta[name="theme-color"]');
      if (theme && curTheme) {
        curTheme.setAttribute('content', theme.getAttribute('content') || '');
      }
      document.body.className = doc.body.className || '';
      document.body.innerHTML = doc.body.innerHTML;
      window.scrollTo(0, 0);
    };

    if (document.startViewTransition && !reducedMotion()) {
      try {
        await document.startViewTransition(apply).finished;
      } catch {
        apply();
      }
    } else {
      apply();
    }

    if (opts.replace) history.replaceState({ soft: 1 }, '', href);
    else history.pushState({ soft: 1 }, '', href);

    document.documentElement.classList.remove('pt-exit');
    document.documentElement.classList.add('pt-ready', 'pt-enter');

    await bootPage(targetPath, doc);
  } catch (err) {
    console.warn('[soft-nav] fallback', err);
    location.href = href;
    return;
  } finally {
    navigating = false;
    hideProgress();
    document.documentElement.classList.remove('pt-exit');
    document.documentElement.classList.add('pt-ready', 'pt-enter');
  }
}

export function softNavEnabled() {
  return true;
}

function bindPop() {
  if (popBound) return;
  popBound = true;
  window.addEventListener('popstate', () => {
    softNavigate(location.href, { replace: true }).catch(() => location.reload());
  });
  try {
    history.replaceState({ soft: 1 }, '', location.href);
  } catch {
    /* ignore */
  }
}

bindPop();

if (typeof window !== 'undefined') {
  window.ComandoSoftNav = { softNavigate };
}
