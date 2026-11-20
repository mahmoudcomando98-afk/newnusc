/**
 * COMANDO theme toggle — light / dark (smooth, non-blocking)
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

function persistTheme(t) {
  try {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => {
        try {
          localStorage.setItem(KEY, t);
        } catch {
          /* ignore */
        }
      });
    } else {
      setTimeout(() => {
        try {
          localStorage.setItem(KEY, t);
        } catch {
          /* ignore */
        }
      }, 0);
    }
  } catch {
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignore */
    }
  }
}

function updateToggleButton(t) {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  const isDark = t === 'dark';
  btn.setAttribute('aria-label', isDark ? 'الوضع النهاري' : 'الوضع الليلي');
  btn.title = isDark ? 'الوضع النهاري' : 'الوضع الليلي';
  btn.dataset.theme = t;
  // text via CSS ::after when possible; fallback emoji without layout thrash
  if (btn.textContent !== (isDark ? '☀️' : '🌙')) {
    btn.textContent = isDark ? '☀️' : '🌙';
  }
}

function applyTheme(theme, { animate = false } = {}) {
  const t = theme === 'dark' ? 'dark' : 'light';
  const root = document.documentElement;
  if (root.getAttribute('data-theme') === t && !animate) {
    updateToggleButton(t);
    return;
  }

  const paint = () => {
    root.setAttribute('data-theme', t);
    try {
      root.style.colorScheme = t;
    } catch {
      /* ignore */
    }
    updateToggleButton(t);
    persistTheme(t);
  };

  if (animate && typeof document.startViewTransition === 'function') {
    try {
      document.startViewTransition(paint);
      return;
    } catch {
      /* fall through */
    }
  }

  if (animate) {
    root.classList.add('theme-switching');
    // double rAF: wait until browser is ready to paint
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        paint();
        // remove class after one frame so no long transition work
        requestAnimationFrame(() => {
          root.classList.remove('theme-switching');
        });
      });
    });
    return;
  }

  paint();
}

function ensureToggle() {
  if (document.getElementById('theme-toggle-btn')) return;
  if (document.body?.dataset?.noThemeToggle === '1') return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'theme-toggle-btn';
  btn.setAttribute('aria-label', 'تبديل الوضع');
  // prevent double-fires while switching
  let busy = false;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next, { animate: true });
    // unlock quickly — don't block user
    setTimeout(() => {
      busy = false;
    }, 220);
  });
  document.body.appendChild(btn);
  updateToggleButton(currentTheme());
}

// Apply once from stored preference — no animation on first paint
applyTheme(currentTheme(), { animate: false });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureToggle, { once: true });
} else {
  ensureToggle();
}
