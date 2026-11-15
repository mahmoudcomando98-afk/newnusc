/**
 * Soft navigation — تنقل بدون إعادة تحميل كاملة للمستند.
 * يجلب HTML، يبدّل المحتوى، يشغّل سكربتات الصفحة، ويحدّث التاريخ.
 * عند الفشل: رجوع للتنقل التقليدي.
 */

let navigating = false;
let progressEl = null;

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function ensureProgress() {
  if (progressEl && progressEl.isConnected) return progressEl;
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
  window.setTimeout(() => {
    progressEl?.classList.remove('is-active', 'is-done');
  }, 280);
}

function shouldHardNavigate(url) {
  try {
    const u = new URL(url, location.href);
    if (u.origin !== location.origin) return true;
    const p = u.pathname.toLowerCase();
    // صفحات حساسة أو ملفات
    if (/\.(pdf|zip|png|jpe?g|gif|webp|mp4|webm)(\?|$)/i.test(p)) return true;
    if (p.includes('logout') || p.includes('signout')) return true;
    return false;
  } catch {
    return true;
  }
}

function samePage(url) {
  try {
    const a = new URL(url, location.href);
    const b = new URL(location.href);
    return a.pathname === b.pathname && a.search === b.search;
  } catch {
    return false;
  }
}

async function runPageScripts(doc) {
  const nodes = [...doc.querySelectorAll('script')];
  for (const node of nodes) {
    const type = (node.getAttribute('type') || '').toLowerCase();
    const src = node.getAttribute('src');
    if (type && type !== 'module' && type !== 'text/javascript' && type !== 'application/javascript') {
      continue;
    }
    if (src) {
      // تجاهل سكربتات عامة بتتسجل مرة — نعيد تحميل سكربتات الصفحات فقط بـ cache-bust خفيف
      const abs = new URL(src, location.href).href;
      const isPageBoot =
        /\/(home|subjects|subject-details|quizzes|quiz-take|schedule|profile|notifications|updates|login|past-exam|online-|file-view|study-plan|admin)\/[^"']*\.js/i.test(
          abs
        ) ||
        /\/(home|subjects|subject-details|quizzes|quiz-take|schedule|profile|notifications|updates|login|past-exams|online-sections|online-schedule|file-view|study-plan)\.js/i.test(
          abs
        ) ||
        /\/assets\/js\/(home|subjects|subject-details|quizzes|quiz-take|schedule|profile|notifications|updates|auth|native-app|install-prompt|admin-[a-z-]+)\.js/i.test(
          abs
        );
      if (!isPageBoot && /page-transitions|soft-nav|supabase|cache|utils|cairo-font|egyptian-ar|theme|push\.js/i.test(abs)) {
        continue;
      }
      try {
        const bust = abs.includes('?') ? abs + '&soft=' + Date.now() : abs + '?soft=' + Date.now();
        await import(/* @vite-ignore */ bust);
      } catch (err) {
        console.warn('[soft-nav] module failed', abs, err);
      }
      continue;
    }
    if (type === 'module' && node.textContent && node.textContent.trim()) {
      try {
        const blob = new Blob([node.textContent], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        await import(/* @vite-ignore */ url);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.warn('[soft-nav] inline module failed', err);
      }
    }
  }
}

function copyHeadExtras(doc) {
  // theme-color
  const theme = doc.querySelector('meta[name="theme-color"]');
  const curTheme = document.querySelector('meta[name="theme-color"]');
  if (theme && curTheme) curTheme.setAttribute('content', theme.getAttribute('content') || '');
}

/**
 * @param {string} href
 * @param {{ replace?: boolean, skipScroll?: boolean }} [opts]
 */
export async function softNavigate(href, opts = {}) {
  if (navigating) return;
  if (shouldHardNavigate(href)) {
    location.href = href;
    return;
  }
  if (samePage(href) && !opts.replace) {
    return;
  }

  navigating = true;
  showProgress();
  document.documentElement.classList.add('soft-nav-busy');

  try {
    const res = await fetch(href, {
      credentials: 'same-origin',
      headers: { Accept: 'text/html', 'X-Soft-Nav': '1' },
      cache: 'default'
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc.body) throw new Error('empty body');

    const apply = () => {
      document.title = doc.title || document.title;
      copyHeadExtras(doc);
      document.body.className = doc.body.className || '';
      document.body.innerHTML = doc.body.innerHTML;
      if (!opts.skipScroll) window.scrollTo(0, 0);
    };

    if (document.startViewTransition && !reducedMotion()) {
      try {
        const vt = document.startViewTransition(apply);
        await vt.finished;
      } catch {
        apply();
      }
    } else {
      apply();
    }

    if (opts.replace) {
      history.replaceState({ soft: true }, '', href);
    } else {
      history.pushState({ soft: true }, '', href);
    }

    document.documentElement.classList.add('pt-ready', 'pt-enter');
    document.documentElement.classList.remove('pt-exit');

    await runPageScripts(doc);

    // أيقونات / تهيئة عامة لو موجودة
    try {
      const { initIcons } = await import('./utils.js');
      initIcons?.();
    } catch {
      /* ignore */
    }
  } catch (err) {
    console.warn('[soft-nav] fallback hard nav', err);
    location.href = href;
    return;
  } finally {
    navigating = false;
    document.documentElement.classList.remove('soft-nav-busy');
    hideProgress();
  }
}

export function softNavEnabled() {
  return true;
}

function onPopState() {
  softNavigate(location.href, { replace: true }).catch(() => {
    location.reload();
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', onPopState);
  window.ComandoSoftNav = { softNavigate };
}
