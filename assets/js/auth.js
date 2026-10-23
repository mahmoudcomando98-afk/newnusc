
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

  /*
   * عادةً يتم إنشاء سجل profiles من خلال Database Trigger.
   * لا نغيّر role أو أي صلاحيات من جهة المتصفح.
   */
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
      console.warn(
        'Profile update after signup:',
        profileError.message
      );
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

export async function login({ email, password }) {
  if (!email?.trim() || !password) {
    throw new Error('يرجى إدخال البريد الإلكتروني وكلمة المرور.');
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

  if (error) {
    throw new Error(getErrorMessage(error, 'فشل تسجيل الخروج.'));
  }

  window.location.replace('/login.html');
}


/* =========================
   Password Reset
========================= */

export async function requestPasswordReset(email) {
  if (!email?.trim()) {
    throw new Error('أدخل البريد الإلكتروني.');
  }

  const redirectTo =
    `${window.location.origin}/reset-password.html`;

  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo }
  );

  if (error) {
    throw new Error(
      getErrorMessage(error, 'فشل إرسال رابط استعادة كلمة المرور.')
    );
  }
}


export async function updatePassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (error) {
    throw new Error(
      getErrorMessage(error, 'فشل تحديث كلمة المرور.')
    );
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
    // Fail closed: only a signed-in, active account explicitly assigned the
    // admin role in public.profiles may see admin pages. Moderator/student
    // roles and profile lookup failures are not admin access.
    const isAuthorizedAdmin =
      !!profile &&
      profile.role === 'admin' &&
      profile.is_active === true;

    if (!isAuthorizedAdmin) {
      window.location.replace(session?.user ? '/home.html' : '/login.html');
      return null;
    }

    // Admin page HTML is hidden by an early head script until this check passes.
    document.documentElement.classList.remove('admin-auth-pending');
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

        showToast('تم تسجيل الدخول بنجاح.', 'success');
        window.location.href = '/home.html';
      });
    } catch (err) {
      showToast(getErrorMessage(err, 'تعذر تسجيل الدخول.'), 'error');
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
      form.elements.full_name?.value ||
      form.elements.fullName?.value ||
      '';

    const email = form.elements.email?.value || '';
    const password = form.elements.password?.value || '';

    const confirmPassword =
      form.elements.password_confirm?.value ||
      form.elements.confirm_password?.value ||
      form.elements.confirm?.value ||
      '';

    const studentId =
      form.elements.student_id?.value ||
      form.elements.studentId?.value ||
      null;

    if (confirmPassword && password !== confirmPassword) {
      showToast('كلمتا المرور غير متطابقتين.', 'error');
      return;
    }

    const terms = form.elements.terms;

    if (terms && !terms.checked) {
      showToast('يجب الموافقة على الشروط والأحكام.', 'error');
      return;
    }

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
            'تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتأكيده قبل تسجيل الدخول.',
            'success',
            6000
          );
        } else {
          showToast('تم إنشاء الحساب بنجاح.', 'success');
          window.location.href = '/home.html';
        }
      });
    } catch (err) {
      showToast(getErrorMessage(err, 'تعذر إنشاء الحساب.'), 'error');
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

    const email = form.elements.email?.value || '';
    const btn = form.querySelector('button[type="submit"]');

    try {
      await withLoading(btn, async () => {
        await requestPasswordReset(email);

        showToast(
          'إذا كان البريد مسجلًا، فستصلك رسالة لاستعادة كلمة المرور.',
          'success'
        );
      });
    } catch (err) {
      showToast(
        getErrorMessage(err, 'تعذر إرسال رابط الاستعادة.'),
        'error'
      );
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

    const password = form.elements.password?.value || '';

    const confirmPassword =
      form.elements.password_confirm?.value ||
      form.elements.confirm?.value ||
      form.elements.confirm_password?.value ||
      '';

    if (confirmPassword && password !== confirmPassword) {
      showToast('كلمتا المرور غير متطابقتين.', 'error');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');

    try {
      await withLoading(btn, async () => {
        await updatePassword(password);

        showToast('تم تحديث كلمة المرور بنجاح.', 'success');
        window.location.href = '/login.html';
      });
    } catch (err) {
      showToast(
        getErrorMessage(err, 'تعذر تحديث كلمة المرور.'),
        'error'
      );
    }
  });
}


/* =========================
   Default Export
========================= */

export default {
  register,
  login,
  logout,
  requestPasswordReset,
  updatePassword,
  protectPage,
  protectAdminPage,
  initLoginPage,
  initRegisterPage,
  initForgotPasswordPage,
  initResetPasswordPage
};
