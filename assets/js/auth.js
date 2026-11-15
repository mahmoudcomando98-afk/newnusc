/**
 * NUSC Student Hub — الدخول/التسجيل بالكود الجامعي (Supabase Auth)
 * لا توجد كلمات مرور: الكود يكافئ الهوية. الجلسة حقيقية من Supabase.
 */

import { supabase, getSession, getProfile } from './supabase.js';

import {
  showToast,
  withLoading
} from './utils.js';

function getErrorMessage(error, fallback = 'حدث خطأ، حاول مرة أخرى') {
  const message = String(error?.message || error || '').toLowerCase();
  if (
    error?.status === 429 ||
    message.includes('rate limit') ||
    message.includes('too many requests')
  ) {
    return 'محاولات كتير خلال دقيقة. استنى شوية وحاول تاني.';
  }
  if (message.includes('non-2xx') || message.includes('edge function')) {
    return 'الخدمة مش متاحة دلوقتي. تأكد من نشر دالة code-login على Supabase.';
  }
  if (message.includes('failed to fetch') || message.includes('network') || message.includes('fetch')) {
    return 'مفيش اتصال بالسيرفر. تأكد من الإنترنت وحاول تاني.';
  }
  return error?.message || fallback;
}

function resolveNextPath() {
  let next = '/home.html';
  try {
    const stored = sessionStorage.getItem('nusc_next');
    if (stored && stored.startsWith('/') && !stored.startsWith('//') && !/login\.html/i.test(stored)) {
      next = stored;
      sessionStorage.removeItem('nusc_next');
    }
  } catch {
    /* ignore */
  }
  return next;
}

async function checkBannedAndGo(uid) {
  try {
    const profile = await Promise.race([
      getProfile(uid),
      new Promise((resolve) => setTimeout(() => resolve(null), 3500))
    ]);
    if (profile && profile.is_active === false) {
      window.location.replace('/banned.html');
      return;
    }
  } catch {
    /* تابع للترحيب */
  }
  // بعد الدخول: شاشة تجميع كلمة COMANDO ثم التحويل للوجهة
  const next = resolveNextPath();
  const welcome =
    '/welcome.html?next=' + encodeURIComponent(next || '/home.html');
  window.location.replace(welcome);
}

const DEVICE_KEY = 'comando_device_id';

/** معرّف جهاز ثابت لكل متصفح/جهاز — يُستخدم لقفل الحساب على جهاز واحد */
export function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'dev-fallback';
  }
}

export async function loginWithCode(code) {
  const normalized = String(code || '').trim();
  if (!normalized) throw new Error('اكتب الكود الجامعي.');

  const { data, error } = await supabase.functions.invoke('code-login', {
    body: { action: 'login', code: normalized, device_id: getOrCreateDeviceId() || '' }
  });
  if (error) throw new Error(getErrorMessage(error));
  if (data?.error) throw new Error(data.error);

  const tokenHash = data?.token_hash;
  if (!tokenHash) throw new Error('تعذر إكمال تسجيل الدخول.');

  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink'
  });
  if (verifyError) throw new Error(getErrorMessage(verifyError, 'تعذر تأكيد الجلسة.'));

  return {
    session: verifyData?.session || null,
    user: verifyData?.user || null,
    fullName: data?.full_name || verifyData?.user?.user_metadata?.full_name || ''
  };
}

export async function lookupCodesByName(name) {
  const q = String(name || '').trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase.functions.invoke('code-login', {
    body: { action: 'lookup', name: q }
  });
  if (error) throw new Error(getErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  return Array.isArray(data?.results) ? data.results : [];
}

export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) {
    try {
      const next = (window.location.pathname || '') + (window.location.search || '');
      if (next && next.startsWith('/') && !next.startsWith('//') && !/login\.html/i.test(next)) {
        sessionStorage.setItem('nusc_next', next);
      }
    } catch {
      /* ignore */
    }
    window.location.replace('/login.html');
    return null;
  }
  return session;
}

export async function protectPage({ adminOnly = false } = {}) {
  const session = await requireAuth();
  if (!session) return null;

  const profile = await getProfile(session.user.id);
  if (profile && profile.is_active === false) {
    window.location.replace('/banned.html');
    return null;
  }

  if (adminOnly) {
    const role = profile?.role;
    if (role !== 'admin' && role !== 'moderator') {
      window.location.replace('/home.html');
      return null;
    }
  }

  return { session, user: session.user, profile };
}

export async function protectAdminPage() {
  return protectPage({ adminOnly: true });
}

function escapeHtmlSafe(value) {
  return String(value ?? '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"');
}

function renderLookupResults(container, results, onPick) {
  if (!results.length) {
    container.innerHTML = '<p class="auth-lookup-empty">مفيش نتائج مطابقة. حاول تكتب الاسم بطريقة تانية.</p>';
    return;
  }
  container.innerHTML = '';
  for (const item of results) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'auth-lookup-item';
    row.innerHTML =
      '<span class="auth-lookup-name">' +
      escapeHtmlSafe(item.full_name) +
      '</span>' +
      '<span class="auth-lookup-code" dir="ltr">' +
      escapeHtmlSafe(item.code) +
      '</span>';
    row.setAttribute('aria-label', 'تسجيل الدخول باسم ' + (item.full_name || ''));
    row.addEventListener('click', () => onPick(item));
    container.appendChild(row);
  }
}

export function initLoginPage() {
  const form = document.getElementById('code-login-form');
  if (!form) return;

  const codeInput = document.getElementById('student-code');
  const forgotLink = document.getElementById('forgot-code-link');
  const forgotPanel = document.getElementById('forgot-panel');
  const lookupInput = document.getElementById('lookup-name');
  const lookupBtn = document.getElementById('lookup-btn');
  const lookupResults = document.getElementById('lookup-results');
  const errorBox = document.getElementById('login-error');

  const showError = (msg) => {
    if (!errorBox) return;
    errorBox.textContent = msg || '';
    errorBox.classList.toggle('show', !!msg);
  };

  const submitCode = async (rawCode) => {
    const btn = form.querySelector('button[type="submit"]');
    await withLoading(btn, async () => {
      showError('');
      const data = await loginWithCode(rawCode);
      showToast('أهلاً ' + (data?.fullName || '').split(' ')[0], 'success');
      const uid = data?.user?.id || data?.session?.user?.id;
      await checkBannedAndGo(uid);
    });
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await submitCode(codeInput?.value || '');
    } catch (err) {
      console.error('[NUSC] code login failed:', err);
      showError(getErrorMessage(err, 'تعذر تسجيل الدخول. تأكد من الكود وحاول تاني.'));
    }
  });

  if (forgotLink && forgotPanel) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      forgotPanel.classList.toggle('hidden');
    });
  }

  if (lookupBtn && lookupInput && lookupResults) {
    lookupBtn.addEventListener('click', async () => {
      lookupResults.innerHTML = '';
      try {
        await withLoading(lookupBtn, async () => {
          const results = await lookupCodesByName(lookupInput.value);
          renderLookupResults(lookupResults, results, (item) => {
            if (codeInput) codeInput.value = item.code || '';
            forgotPanel?.classList.add('hidden');
            showToast('اتحط الكود، اضغط دخول', 'success');
          });
        });
      } catch (err) {
        showError(getErrorMessage(err, 'تعذر البحث بالاسم.'));
      }
    });
  }
}

export {
  loginWithCode,
  lookupCodesByName,
  getErrorMessage,
  resolveNextPath
};
