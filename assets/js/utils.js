
/**
 * NUSC Student Hub - Shared Utilities
 */

export function formatDate(dateStr, options = {}) {
  if (!dateStr) return '';

  const d = new Date(dateStr);
  if (isNaN(d)) return '';

  const defaults = {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };

  return d.toLocaleDateString('ar-EG', {
    ...defaults,
    ...options
  });
}

export function formatTime(timeStr) {
  if (!timeStr) return '';

  const parts = String(timeStr).split(':');
  if (parts.length < 2) return timeStr;

  const h = parseInt(parts[0], 10);
  const m = parts[1];
  const period = h >= 12 ? 'م' : 'ص';
  const hour12 = h % 12 || 12;

  return `${hour12}:${m} ${period}`;
}

export function formatFileSize(bytes) {
  if (!bytes || bytes < 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + ' KB';
  }

  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';

  const d = new Date(dateStr);
  const now = new Date();
  const sec = Math.floor((now - d) / 1000);

  if (sec < 60) return 'الآن';
  if (sec < 3600) return Math.floor(sec / 60) + ' دقيقة';
  if (sec < 86400) return Math.floor(sec / 3600) + ' ساعة';
  if (sec < 604800) return Math.floor(sec / 86400) + ' يوم';

  return formatDate(dateStr, {
    month: 'short',
    day: 'numeric'
  });
}

export function escapeHtml(str) {
  if (str == null) return '';

  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function debounce(fn, wait = 300) {
  let t;

  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function showToast(message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');

  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText =
      'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;width:90%;max-width:360px;pointer-events:none';

    document.body.appendChild(container);
  }

  const toast = document.createElement('div');

  const colors = {
    success: '#059669',
    error: '#dc2626',
    warning: '#d97706',
    info: '#2563eb'
  };

  toast.style.cssText =
    `background:${colors[type] || colors.info};color:#fff;padding:12px 16px;border-radius:10px;font-size:0.9rem;box-shadow:0 4px 12px rgba(0,0,0,.15);pointer-events:auto;text-align:center;width:100%`;

  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity .3s';

    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export function showSkeleton(el, count = 3) {
  if (!el) return;

  el.innerHTML = Array.from({ length: count }, () =>
    '<div class="skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div></div>'
  ).join('');
}

export function showEmpty(el, message = 'لا توجد بيانات') {
  if (!el) return;

  el.innerHTML =
    `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`;
}

export function showError(el, message = 'حدث خطأ') {
  if (!el) return;

  el.innerHTML =
    `<div class="empty-state"><p style="color:var(--danger)">${escapeHtml(message)}</p><button type="button" class="btn btn-sm btn-secondary mt-2" onclick="location.reload()">إعادة المحاولة</button></div>`;
}

export function isOnline() {
  return navigator.onLine;
}

export function onConnectivityChange(cb) {
  window.addEventListener('online', () => cb(true));
  window.addEventListener('offline', () => cb(false));
}

export const WEEKDAYS_AR = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت'
];

export function materialTypeLabel(type) {
  const map = {
    lecture: 'محاضرة',
    section: 'سكشن',
    notes: 'ملاحظات',
    assignment: 'واجب',
    exam: 'امتحان',
    other: 'أخرى',
    pdf: 'PDF',
    slides: 'عرض'
  };

  return map[type] || type || '';
}

export function importanceLabel(level) {
  const map = {
    urgent: 'عاجل',
    high: 'مهم',
    normal: 'عادي',
    low: 'منخفض'
  };

  return map[level] || level || '';
}

export function quizStatusLabel(status) {
  const map = {
    upcoming: 'قادم',
    open: 'مفتوح',
    closed: 'منتهي'
  };

  return map[status] || status || '';
}

export function computeQuizStatus(q) {
  if (!q) return 'closed';

  const now = Date.now();
  const start = q.start_at ? new Date(q.start_at).getTime() : 0;
  const end = q.end_at ? new Date(q.end_at).getTime() : Infinity;

  if (now < start) return 'upcoming';
  if (now > end) return 'closed';

  return 'open';
}

export function createCountdown(targetDate, el) {
  if (!el || !targetDate) return null;

  const target = new Date(targetDate).getTime();

  const tick = () => {
    const diff = target - Date.now();

    if (diff <= 0) {
      el.textContent = 'بدأ';
      return;
    }

    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);

    el.textContent =
      d > 0
        ? `${d}ي ${h}س ${m}د`
        : `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  tick();
  return setInterval(tick, 1000);
}

/* =========================
   Loading State - Fixed
========================= */

export async function withLoading(btn, asyncFn) {
  if (typeof asyncFn !== 'function') {
    throw new Error('تعذر تشغيل العملية المطلوبة');
  }

  // لو مفيش زر، نفّذ العملية مباشرة
  if (!btn) {
    return await asyncFn();
  }

  const original = btn.innerHTML;
  const wasDisabled = btn.disabled;

  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    return await asyncFn();
  } finally {
    btn.disabled = wasDisabled;
    btn.removeAttribute('aria-busy');
    btn.innerHTML = original;
  }
}

export async function requireAuth(redirectTo = '/login.html') {
  const { getSession } = await import('./supabase.js');
  const session = await getSession();

  if (!session) {
    window.location.href = redirectTo;
    return null;
  }

  return session;
}

export async function redirectIfAuthenticated(to = '/home.html') {
  const { getSession } = await import('./supabase.js');
  const session = await getSession();

  if (session) {
    window.location.href = to;
  }
}

export function setActiveNav(key) {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.classList.toggle('active', el.dataset.nav === key);
  });

  document.querySelectorAll('.bottom-nav a').forEach((a) => {
    const href = a.getAttribute('href') || '';

    if (key === 'home' && href.includes('home')) a.classList.add('active');
    else if (key === 'subjects' && href.includes('subjects')) a.classList.add('active');
    else if (key === 'quizzes' && href.includes('quizzes')) a.classList.add('active');
    else if (key === 'schedule' && href.includes('schedule')) a.classList.add('active');
    else if (key === 'profile' && href.includes('profile')) a.classList.add('active');
    else if (key === 'announcements' && href.includes('announcements')) a.classList.add('active');
  });
}

const ICONS = {
  home: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',

  book: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',

  clipboard: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',

  calendar: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',

  user: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',

  bell: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',

  star: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',

  file: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>',

  megaphone: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 11 18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>',

  download: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',

  settings: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',

  alert: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',

  chevronLeft: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>'
};

export function initIcons() {
  document.querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.dataset.icon;

    if (ICONS[name] && !el.querySelector('svg')) {
      el.innerHTML = ICONS[name];
    }
  });
}
