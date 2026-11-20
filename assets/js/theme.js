/**
 * COMANDO theme toggle — light / dark
 */
const KEY = 'comando-theme';

function currentTheme() {
  const fromDom = document.documentElement.getAttribute('data-theme');
  if (fromDom === 'dark' || fromDom === 'light') return fromDom;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* ignore */
  }
  return 'light';
}

function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) {
    btn.setAttribute('aria-label', t === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي');
    btn.title = t === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي';
    btn.textContent = t === 'dark' ? '☀️' : '🌙';
  }
  try {
    document.documentElement.style.colorScheme = t;
  } catch {
    /* ignore */
  }
}

function ensureToggle() {
  if (document.getElementById('theme-toggle-btn')) return;
  if (document.body?.dataset?.noThemeToggle === '1') return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'theme-toggle-btn';
  btn.setAttribute('aria-label', 'تبديل الوضع');
  btn.addEventListener('click', () => {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  });
  document.body.appendChild(btn);
  applyTheme(currentTheme());
}

applyTheme(currentTheme());

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureToggle);
} else {
  ensureToggle();
}
