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
    /* تابع للرئيسية */
  }
  window.location.replace(resolveNextPath());
}

/** الدخول (أو التسجيل تلقائيًا) بالكود الجامعي */
export async function loginWithCode(code) {
  const normalized = String(code || '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!normalized) throw new Error('اكتب الكود الجامعي أولًا.');

  const { data, error } = await supabase.functions.invoke('code-login', {
    body: { action: 'login', code: normalized }
  });
  if (error) {
    // supabase-js v2: non-2xx → error.context (Response) — اقرأ الرسالة الحقيقية إن وُجدت
    let detail = null;
    try { detail = await error.context?.json?.(); } catch { /* غير JSON أو غير متاح */ }
    if (detail?.error) throw new Error(detail.error);
    throw new Error(getErrorMessage(error, 'تعذر تسجيل الدخول. حاول مرة أخرى.'));
  }
  if (data?.error) {
    const err = new Error(data.error);
    err.status = data.status || 400;
    throw err;
  }
  if (!data?.token_hash) throw new Error('رد غير متوقع من الخدمة. حاول مرة أخرى.');

  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: data.token_hash,
    type: 'magiclink'
  });
  if (verifyError) throw new Error(getErrorMessage(verifyError, 'تعذر إنشاء الجلسة. حاول مرة أخرى.'));
  return { ...verifyData, fullName: data.full_name, role: data.role };
}

/** البحث عن كود جامعي بالاسم — للذين نسوا كودهم */
export async function lookupStudentCode(query) {
  const q = String(query || '').trim();
  if (q.length < 3) throw new Error('اكتب 3 أحرف على الأقل من اسمك.');

  const { data, error } = await supabase.functions.invoke('code-login', {
    body: { action: 'lookup', query: q }
  });
  if (error) {
    let detail = null;
    try { detail = await error.context?.json?.(); } catch { /* غير JSON */ }
    if (detail?.error) throw new Error(detail.error);
    throw new Error(getErrorMessage(error, 'تعذر البحث الآن. حاول مرة أخرى.'));
  }
  if (data?.error) throw new Error(data.error);
  return Array.isArray(data?.results) ? data.results : [];
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  window.location.href = '/login.html';
}

export async function protectPage({ adminOnly = false } = {}) {
  let session = await getSession();
  if (!session) {
    try {
      const { data } = await supabase.auth.refreshSession();
      session = data?.session || null;
    } catch {
      /* ignore */
    }
  }
  if (!session) {
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
  const profile = await getProfile(session.user.id);

  if (profile && profile.is_active === false && !adminOnly) {
    const path = (window.location.pathname || '').toLowerCase();
    if (!path.endsWith('/banned.html')) {
      window.location.replace('/banned.html');
    }
    return null;
  }

  if (adminOnly) {
    const isAuthorizedAdmin = !!profile && profile.role === 'admin' && profile.is_active === true;
    if (!isAuthorizedAdmin) {
      window.location.replace(session?.user ? '/home.html' : '/login.html');
      return null;
    }
    document.documentElement.classList.remove('admin-auth-pending');
  }
  try {
    const uid = session.user?.id || profile?.id;
    if (uid && !adminOnly) {
      import('./push.js')
        .then((m) => m.initPushNotifications(uid))
        .catch(() => {});
    }
  } catch {
    /* ignore */
  }
  return { session, user: session.user, profile };
}

export async function protectAdminPage() {
  return await protectPage({ adminOnly: true });
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
      '<span class="auth-lookup-name">' + escapeHtmlSafe(item.full_name) + '</span>' +
      '<span class="auth-lookup-code" dir="ltr">' + escapeHtmlSafe(item.code) + '</span>';
    row.setAttribute('aria-label', 'تسجيل الدخول باسم ' + item.full_name);
    row.addEventListener('click', () => onPick(item));
    container.appendChild(row);
  }
}

function escapeHtmlSafe(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

  // "هل نسيت الكود الجامعي؟" — إظهار لوحة البحث بالاسم
  if (forgotLink && forgotPanel) {
    forgotLink.addEventListener('click', (e) => {
      e.preventDefault();
      forgotPanel.hidden = !forgotPanel.hidden;
      if (!forgotPanel.hidden && lookupInput) lookupInput.focus();
    });
  }

  if (lookupBtn && lookupInput && lookupResults) {
    const runLookup = async () => {
      lookupBtn.disabled = true;
      lookupBtn.textContent = '...';
      lookupResults.innerHTML = '';
      try {
        const results = await lookupStudentCode(lookupInput.value);
        renderLookupResults(lookupResults, results, async (item) => {
          // الطالب اختار نفسه: سجّل بالكود فورًا
          try {
            await submitCode(item.code);
          } catch (err) {
            showError(getErrorMessage(err, 'تعذر تسجيل الدخول. حاول تاني.'));
          }
        });
      } catch (err) {
        lookupResults.innerHTML =
          '<p class="auth-lookup-empty">' + escapeHtmlSafe(getErrorMessage(err, 'تعذر البحث.')) + '</p>';
      } finally {
        lookupBtn.disabled = false;
        lookupBtn.textContent = 'بحث';
      }
    };
    lookupBtn.addEventListener('click', runLookup);
    lookupInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runLookup();
      }
    });
  }
}

export default {
  loginWithCode,
  lookupStudentCode,
  logout,
  protectPage,
  protectAdminPage,
  initLoginPage
};
