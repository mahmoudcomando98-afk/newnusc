/**
 * COMANDO — تبديل الوضع الليلي/النهاري
 * - الوضع الافتراضي نهاري دائمًا عند أول دخول للمنصة
 * - يحفظ اختيار الطالب في localStorage (مفتاح: comando-theme) ويتبعه بعد كده
 * - الزر عائم أسفل الشاشة (فوق الـ bottom-nav على الموبايل)
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
  const btn = document.querySelector('.theme-toggle');
  if (!btn) return;
  const isDark = theme === 'dark';
  btn.setAttribute('aria-pressed', String(isDark));
  btn.setAttribute(
    'aria-label',
    isDark ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'
  );
  btn.title = isDark ? 'الوضع النهاري' : 'الوضع الليلي';
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
  const btn = document.querySelector('.theme-toggle');
  if (btn && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    btn.classList.remove('pulse');
    // إعادة التشغيل القسري للأنيميشن
    void btn.offsetWidth;
    btn.classList.add('pulse');
  }
}

const SUN_SVG =
  '<svg class="theme-icon icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
const MOON_SVG =
  '<svg class="theme-icon icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';

function createToggle() {
  if (document.querySelector('.theme-toggle')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'theme-toggle';
  btn.innerHTML = SUN_SVG + MOON_SVG;
  btn.setAttribute('aria-label', 'التبديل إلى الوضع الليلي');
  btn.setAttribute('aria-pressed', 'false');
  btn.addEventListener('click', toggleTheme);
  document.body.appendChild(btn);
  updateToggle(currentTheme());
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
