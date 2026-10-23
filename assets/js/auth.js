/**
 * NUSC Student Hub - Authentication
 */

import { supabase, getSession, getProfile, isSupabaseConfigured } from './supabase.js';
import { showToast, escapeHtml, withLoading, redirectIfAuthenticated, requireAuth } from './utils.js';

export async function register({ fullName, email, password, studentId = null }) {
  if (!isSupabaseConfigured()) {
    throw new Error('إعدادات Supabase غير مكتملة. راجع ملف .env');
  }
  if (!fullName?.trim() || !email?.trim() || !password) {
    throw new Error('يرجى تعبئة جميع الحقول المطلوبة');
  }
  if (password.length < 6) {
    throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
  }
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        full_name: fullName.trim(),
        student_id: studentId?.trim() || null
      }
    }
  });
  if (error) {
    if (error.message.includes('already registered') || error.message.includes('already been registered')) {
      throw new Error('هذا البريد الإلكتروني مسجل مسبقاً. يمكنك تسجيل الدخول أو استعادة كلمة المرور.');
    }
    throw new Error(error.message || 'فشل إنشاء الحساب');
  }
  const session = data.session;
  const user = data.user;
  if (!user) {
    throw new Error('لم يتم إنشاء الحساب. حاول مرة أخرى.');
  }
  if (session) {
    if (studentId?.trim()) {
      await supabase.from('profiles').update({ student_id: studentId.trim(), full_name: fullName.trim() }).eq('id', user.id);
    }
    return { user, session, needsConfirmation: false };
  }
  return { user, session: null, needsConfirmation: true };
}

export async function login({ email, password }) {
  if (!isSupabaseConfigured()) {
    throw new Error('إعدادات Supabase غير مكتملة. راجع ملف .env');
  }
  if (!email?.trim() || !password) {
    throw new Error('يرجى إدخال البريد الإلكتروني وكلمة المرور');
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });
  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }
    if (error.message.includes('Email not confirmed')) {
      throw new Error('يرجى تأكيد بريدك الإلكتروني أولاً من الرابط المرسل إليك');
    }
    throw new Error(error.message || 'فشل تسجيل الدخول');
  }
  if (!data.session) {
    throw new Error('لم يتم إنشاء جلسة. حاول مرة أخرى.');
  }
  return data;
}

export async function requestPasswordReset(email) {
  if (!email?.trim()) {
    throw new Error('يرجى إدخال البريد الإلكتروني');
  }
  const redirectTo = `${window.location.origin}/reset-password.html`;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
  if (error) {
    throw new Error(error.message || 'فشل إرسال رابط الاستعادة');
  }
  return true;
}

export async function updatePassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw new Error(error.message || 'فشل تحديث كلمة المرور');
  }
  return true;
}

export function initRegisterPage() {
  redirectIfAuthenticated('/home.html');
  const form = document.getElementById('register-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = form.querySelector('[name="full_name"]').value;
    const email = form.querySelector('[name="email"]').value;
    const password = form.querySelector('[name="password"]').value;
    const passwordConfirm = form.querySelector('[name="password_confirm"]').value;
    const studentId = form.querySelector('[name="student_id"]')?.value || null;
    const terms = form.querySelector('[name="terms"]');
    if (password !== passwordConfirm) {
      showToast('كلمتا المرور غير متطابقتين', 'error');
      return;
    }
    if (terms && !terms.checked) {
      showToast('يجب الموافقة على شروط الاستخدام', 'error');
      return;
    }
    const btn = form.querySelector('[type="submit"]');
    const handler = withLoading(btn, async () => {
      try {
        const result = await register({ fullName, email, password, studentId });
        if (result.needsConfirmation) {
          showToast('تم إنشاء الحساب. يرجى تأكيد بريدك الإلكتروني من الرابط المرسل إليك.', 'success', 6000);
          setTimeout(() => { window.location.href = '/login.html'; }, 2500);
        } else {
          showToast('تم إنشاء الحساب بنجاح!', 'success');
          setTimeout(() => { window.location.href = '/home.html'; }, 800);
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    await handler();
  });
}

export function initLoginPage() {
  redirectIfAuthenticated('/home.html');
  const form = document.getElementById('login-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.querySelector('[name="email"]').value;
    const password = form.querySelector('[name="password"]').value;
    const btn = form.querySelector('[type="submit"]');
    const handler = withLoading(btn, async () => {
      try {
        await login({ email, password });
        showToast('تم تسجيل الدخول بنجاح', 'success');
        setTimeout(() => { window.location.href = '/home.html'; }, 500);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    await handler();
  });
}

export function initForgotPasswordPage() {
  const form = document.getElementById('forgot-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.querySelector('[name="email"]').value;
    const btn = form.querySelector('[type="submit"]');
    const handler = withLoading(btn, async () => {
      try {
        await requestPasswordReset(email);
        showToast('تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني', 'success', 6000);
        form.reset();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    await handler();
  });
}

export function initResetPasswordPage() {
  const form = document.getElementById('reset-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = form.querySelector('[name="password"]').value;
    const passwordConfirm = form.querySelector('[name="password_confirm"]').value;
    if (password !== passwordConfirm) {
      showToast('كلمتا المرور غير متطابقتين', 'error');
      return;
    }
    const btn = form.querySelector('[type="submit"]');
    const handler = withLoading(btn, async () => {
      try {
        await updatePassword(password);
        showToast('تم تحديث كلمة المرور بنجاح', 'success');
        setTimeout(() => { window.location.href = '/login.html'; }, 1500);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    await handler();
  });
}

export async function protectPage() {
  const session = await requireAuth('/login.html');
  if (!session) return null;
  const profile = await getProfile(session.user.id);
  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    window.location.href = '/login.html';
    return null;
  }
  return { session, profile };
}

export async function protectAdminPage() {
  const result = await protectPage();
  if (!result) return null;
  if (result.profile.role !== 'admin' && result.profile.role !== 'moderator') {
    showToast('ليس لديك صلاحية الوصول لهذه الصفحة', 'error');
    window.location.href = '/home.html';
    return null;
  }
  return result;
}
