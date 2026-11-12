/**
 * COMANDO — تبديل الوضع الليلي/النهاري
 * - الوضع الافتراضي نهاري دائمًا عند أول دخول للمنصة
 * - يحفظ اختيار الطالب في localStorage (مفتاح: comando-theme) ويتبعه بعد كده
 * - الزر في البار العلوي فقط (.header-actions إن وُجدت، وإلا داخل .app-header .container)
 * - لا يظهر أي زر عائم في أي صفحة أو جهاز — مطلقًا
 */

const KEY = 'comando-theme';
const META_LIGHT = '#faf9f7';
const META_DARK = '#171512';
const ANIM_MS = 480;

function savedTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'dark' || t === 'light' ? t : null;
  } catch {
    return null;
  }
}

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

function updateThemeColorMeta(theme) {
  const color = theme === 'dark' ? META_DARK : META_LIGHT;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute('content', color);
  });
}

function updateToggle(theme) {
  const btns = document.querySelectorAll('.theme-toggle-header');
  const isDark = theme === 'dark';
  const label = isDark ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي';
  const title = isDark ? 'الوضع النهاري' : 'الوضع الليلي';
  btns.forEach((btn) => {
    btn.setAttribute('aria-pressed', String(isDark));
    btn.setAttribute('aria-label', label);
    btn.title = title;
  });
}

function applyTheme(theme, { animate = false } = {}) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add('theme-anim');
    window.setTimeout(() => root.classList.remove('theme-anim'), ANIM_MS + 40);
  }
  root.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private mode */
  }
  updateThemeColorMeta(theme);
  updateToggle(theme);
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next, { animate: true });
  const btns = document.querySelectorAll('.theme-toggle-header');
  if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    btns.forEach((btn) => {
      btn.classList.remove('pulse');
      // إعادة التشغيل القسري للأنيميشن
      void btn.offsetWidth;
      btn.classList.add('pulse');
    });
  }
}

const SUN_SVG =
  '<svg class="theme-icon icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
const MOON_SVG =
  '<svg class="theme-icon icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';

function createToggle() {
  if (document.querySelector('.theme-toggle-header')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'header-btn theme-toggle-header';
  btn.innerHTML = SUN_SVG + MOON_SVG;
  btn.setAttribute('aria-label', 'التبديل إلى الوضع الليلي');
  btn.setAttribute('aria-pressed', 'false');
  btn.title = 'الوضع الليلي';
  btn.addEventListener('click', toggleTheme);

  // الأولوية: البار العلوي جنب زر الإشعارات (.header-actions)
  const headerActions = document.querySelector('.header-actions');
  if (headerActions) {
    headerActions.insertBefore(btn, headerActions.firstChild);
    updateToggle(currentTheme());
    return;
  }

  // وإلا: بار العلوي العادي (صفحات الأدمن وبعض الصفحات اللي ما عندها header-actions)
  const container = document.querySelector('.app-header .container');
  if (container) {
    container.appendChild(btn);
    updateToggle(currentTheme());
    return;
  }
  // صفحات بدون بار علوي (تسجيل الدخول/الصيانة/الأخطاء): بدون زر — لا شيء عائم أبدًا
}

// طبّق السمة المحفوظة أو الوضع النهاري الافتراضي عند أول دخول (الـ inline script في <head> سبق وطبقها أيضًا لمنع الوميض)
const initial = savedTheme() || 'light';
document.documentElement.setAttribute('data-theme', initial);
updateThemeColorMeta(initial);

if (document.body) {
  createToggle();
} else {
  document.addEventListener('DOMContentLoaded', createToggle, { once: true });
}
