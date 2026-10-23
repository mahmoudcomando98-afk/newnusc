
/**
 * NUSC Student Hub - Authentication
 */

import { supabase, getSession, getProfile } from './supabase.js';
import {
  showToast,
  escapeHtml,
  withLoading,
  redirectIfAuthenticated,
  requireAuth
} from './utils.js';


/* =========================
   Register
========================= */

export async function register({
  fullName,
  email,
  password,
  studentId = null
}) {
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
    if (
      error.message.includes('already registered') ||
      error.message.includes('already been registered')
    ) {
      throw new Error(
        'هذا البريد الإلكتروني مسجل مسبقاً. يمكنك تسجيل الدخول أو استعادة كلمة المرور.'
      );
    }

    throw new Error(error.message || 'فشل إنشاء الحساب');
  }

  const session = data.session;
  const user = data.user;

  if (!user) {
    throw new Error('لم يتم إنشاء الحساب. حاول مرة أخرى.');
  }

  try {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        student_id: studentId?.trim() || null,
        email: email.trim().toLowerCase()
      })
      .eq('id', user.id);

    if (profileError) {
      console.warn(
        'Profile update after signup:',
        profileError.message
      );
    }
  } catch (e) {
    console.warn('Profile update after signup:', e);
  }

  return {
    user,
    session,
    needsEmailConfirmation: !session
  };
}


/* =========================
   Login
========================= */

export async function login({ email, password }) {
  if (!email?.trim() || !password) {
    throw new Error('يرجى إدخال البريد وكلمة المرور');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });

  if (error) {
    if (error.message.includes('Invalid login')) {
      throw new Error('البريد أو كلمة المرور غير صحيحة');
    }

    if (error.message.includes('Email not confirmed')) {
      throw new Error('يرجى تأكيد البريد الإلكتروني أولاً');
    }

    throw new Error(error.message || 'فشل تسجيل الدخول');
  }

  return data;
}


/* =========================
   Password Reset
========================= */

export async function requestPasswordReset(email) {
  if (!email?.trim()) {
    throw new Error('أدخل البريد الإلكتروني');
  }

  const redirectTo =
    `${window.location.origin}/reset-password.html`;

  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo }
  );

  if (error) {
    throw new Error(
      error.message || 'فشل إرسال رابط استعادة كلمة المرور'
    );
  }
}


export async function updatePassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (error) {
    throw new Error(error.message || 'فشل تحديث كلمة المرور');
  }
}


/* =========================
   Page Protection
========================= */

export async function protectPage({ adminOnly = false } = {}) {
  const session = await getSession();

  if (!session) {
    window.location.replace('/login.html');
    return null;
  }

  const profile = await getProfile(session.user.id);

  if (adminOnly) {
    const role = profile?.role;

    if (role !== 'admin' && role !== 'moderator') {
      window.location.replace('/home.html');
      return null;
    }
  }

  return {
    session,
    user: session.user,
    profile
  };
}


/* =========================
   Admin Page Protection
========================= */

export async function protectAdminPage() {
  return await protectPage({ adminOnly: true });
}


/* =========================
   Login Page
========================= */

export function initLoginPage() {
  redirectIfAuthenticated('/home.html');

  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = form.email.value;
    const password = form.password.value;

    const btn = form.querySelector('button[type="submit"]');

    try {
      await withLoading(btn, async () => {
        await login({ email, password });

        showToast('تم تسجيل الدخول بنجاح', 'success');

        window.location.href = '/home.html';
      });
    } catch (err) {
      showToast(err.message || 'حدث خطأ', 'error');
    }
  });
}


/* =========================
   Register Page
========================= */

export function initRegisterPage() {
  redirectIfAuthenticated('/home.html');

  const form = document.getElementById('register-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullName =
      form.fullName?.value || form.full_name?.value;

    const email = form.email.value;
    const password = form.password.value;

    const studentId =
      form.studentId?.value ||
      form.student_id?.value ||
      null;

    const btn = form.querySelector('button[type="submit"]');

    try {
      await withLoading(btn, async () => {
        const result = await register({
          fullName,
          email,
          password,
          studentId
        });

        if (result.needsEmailConfirmation) {
          showToast(
            'تم إنشاء الحساب. تحقق من بريدك لتأكيد الحساب.',
            'success'
          );
        } else {
          showToast('تم إنشاء الحساب بنجاح', 'success');
          window.location.href = '/home.html';
        }
      });
    } catch (err) {
      showToast(err.message || 'حدث خطأ', 'error');
    }
  });
}


/* =========================
   Forgot Password Page
========================= */

export function initForgotPasswordPage() {
  const form = document.getElementById('forgot-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = form.email.value;
    const btn = form.querySelector('button[type="submit"]');

    try {
      await withLoading(btn, async () => {
        await requestPasswordReset(email);

        showToast(
          'إن كان البريد مسجلاً ستصلك رسالة استعادة',
          'success'
        );
      });
    } catch (err) {
      showToast(err.message || 'حدث خطأ', 'error');
    }
  });
}


/* =========================
   Reset Password Page
========================= */

export function initResetPasswordPage() {
  const form = document.getElementById('reset-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const password = form.password.value;

    const confirm =
      form.confirm?.value ||
      form.password_confirm?.value;

    if (confirm && password !== confirm) {
      showToast('كلمتا المرور غير متطابقتين', 'error');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');

    try {
      await withLoading(btn, async () => {
        await updatePassword(password);

        showToast('تم تحديث كلمة المرور', 'success');

        window.location.href = '/login.html';
      });
    } catch (err) {
      showToast(err.message || 'حدث خطأ', 'error');
    }
  });
}


/* =========================
   Default Export
========================= */

export default {
  register,
  login,
  protectPage,
  protectAdminPage,
  initLoginPage,
  initRegisterPage,
  initForgotPasswordPage,
  initResetPasswordPage
};
