
/**
 * NUSC Student Hub - Authentication
 */

import { supabase, getSession, getProfile } from './supabase.js';

import {
  showToast,
  withLoading,
  redirectIfAuthenticated
} from './utils.js';


/* =========================
   Helpers
========================= */

function getErrorMessage(error, fallback = 'حدث خطأ، حاول مرة أخرى') {
  const message = String(error?.message || '').toLowerCase();

  if (
    error?.status === 429 ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('email rate limit')
  ) {
    return 'تم تجاوز حد المحاولات أو رسائل البريد مؤقتًا. انتظر قليلًا قبل المحاولة مجددًا.';
  }

  if (
    message.includes('already registered') ||
    message.includes('already been registered')
  ) {
    return 'هذا البريد مسجل بالفعل. جرّب تسجيل الدخول أو استعادة كلمة المرور.';
  }

  if (
    message.includes('invalid login credentials') ||
    message.includes('invalid login')
  ) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  }

  if (message.includes('email not confirmed')) {
    return 'يرجى تأكيد البريد الإلكتروني قبل تسجيل الدخول.';
  }

  return error?.message || fallback;
}


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
    throw new Error('يرجى تعبئة جميع الحقول المطلوبة.');
  }

  if (password.length < 6) {
    throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = fullName.trim();
  const normalizedStudentId = studentId?.trim() || null;

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/login.html`,
      data: {
        full_name: normalizedName,
        student_id: normalizedStudentId
      }
    }
  });

  if (error) {
    throw new Error(getErrorMessage(error, 'فشل إنشاء الحساب.'));
  }

  const user = data?.user;
  const session = data?.session;

  if (!user) {
    throw new Error('لم يتم إنشاء الحساب. حاول مرة أخرى.');
  }

  if (session) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        full_name: normalizedName,
        student_id: normalizedStudentId,
        email: normalizedEmail
      })
      .eq('id', user.id);

    if (profileError) {
      console.warn('Profile update after signup:', profileError.message);
    }
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

export async function login(email, password) {
  if (!email?.trim() || !password) {
    throw new Error('أدخل البريد وكلمة المرور.');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  });

  if (error) {
    throw new Error(getErrorMessage(error, 'فشل تسجيل الدخول.'));
  }

  return data;
}


/* =========================
   Logout
========================= */

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) console.warn('logout:', error.message);
  window.location.replace('/login.html');
}


/* =========================
   Password reset
========================= */

export async function requestPasswordReset(email) {
  if (!email?.trim()) throw new Error('أدخل البريد الإلكتروني.');

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/reset-password.html`
  });

  if (error) {
    throw new Error(getErrorMessage(error, 'تعذر إرسال رابط الاستعادة.'));
  }
}

export async function updatePassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw new Error(getErrorMessage(error, 'تعذر تحديث كلمة المرور.'));
  }
}


/* =========================
   Route guards
========================= */

export async function protectPage({ adminOnly = false } = {}) {
  const session = await getSession();

  if (!session) {
    window.location.replace('/login.html');
    return null;
  }

  const profile = await getProfile(session.user.id);

  if (adminOnly) {
    const isAuthorizedAdmin =
      !!profile &&
      profile.role === 'admin' &&
      profile.is_active === true;

    if (!isAuthorizedAdmin) {
      window.location.replace(session?.user ? '/home.html' : '/login.html');
      return null;
    }

    document.documentElement.classList.remove('admin-auth-pending');
  }

  // Background notifications (non-blocking)
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

  return {
    session,
    user: session.user,
    profile
  };
}


export async function protectAdminPage() {
  return await protectPage({ adminOnly: true });
}


/* =========================
   Login Page
========================= */

export function initLoginPage() {
  const requestedNext = new URLSearchParams(window.location.search).get('next') || '';
  const loginRedirect =
    requestedNext.startsWith('/') && !requestedNext.startsWith('//')
      ? requestedNext
      : '/home.html';

  redirectIfAuthenticated(loginRedirect);

  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email')?.value;
    const password = document.getElementById('password')?.value;
    const btn = form.querySelector('[type=submit]');

    await withLoading(btn, async () => {
      try {
        await login(email, password);
        window.location.replace(loginRedirect);
      } catch (err) {
        showToast(err.message || 'فشل تسجيل الدخول', 'error');
      }
    })();
  });
}

export function initRegisterPage() {
  redirectIfAuthenticated('/home.html');
  const form = document.getElementById('register-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('full_name')?.value;
    const email = document.getElementById('email')?.value;
    const password = document.getElementById('password')?.value;
    const studentId = document.getElementById('student_id')?.value;
    const btn = form.querySelector('[type=submit]');

    await withLoading(btn, async () => {
      try {
        const result = await register({ fullName, email, password, studentId });
        if (result.needsEmailConfirmation) {
          showToast('تم إنشاء الحساب. راجع بريدك لتأكيد الحساب.', 'success');
        } else {
          window.location.replace('/home.html');
        }
      } catch (err) {
        showToast(err.message || 'فشل إنشاء الحساب', 'error');
      }
    })();
  });
}
