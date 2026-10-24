/**
 * Page requirements for NUSC routes.
 * Each page declares: auth, roles, and short description.
 */

export const PAGE_REQUIREMENTS = {
  '/index.html': {
    auth: false,
    roles: [],
    title: 'البداية',
    needs: 'لا يتطلب تسجيل دخول'
  },
  '/login.html': {
    auth: false,
    roles: [],
    guestOnly: true,
    title: 'تسجيل الدخول',
    needs: 'بريد وكلمة مرور صالحين'
  },
  '/register.html': {
    auth: false,
    roles: [],
    guestOnly: true,
    title: 'إنشاء حساب',
    needs: 'بيانات الطالب الأساسية'
  },
  '/forgot-password.html': {
    auth: false,
    roles: [],
    title: 'استعادة كلمة المرور',
    needs: 'بريد مسجّل'
  },
  '/reset-password.html': {
    auth: false,
    roles: [],
    title: 'تعيين كلمة مرور',
    needs: 'رابط استعادة صالح'
  },
  '/home.html': {
    auth: true,
    roles: ['student', 'admin', 'moderator'],
    title: 'الرئيسية',
    needs: 'جلسة نشطة + حساب مفعّل'
  },
  '/subjects.html': {
    auth: true,
    roles: ['student', 'admin', 'moderator'],
    title: 'المواد',
    needs: 'جلسة نشطة'
  },
  '/subject-details.html': {
    auth: true,
    roles: ['student', 'admin', 'moderator'],
    title: 'تفاصيل المادة',
    needs: 'جلسة نشطة + معرّف مادة'
  },
  '/lecture-details.html': {
    auth: true,
    roles: ['student', 'admin', 'moderator'],
    title: 'المحاضرة',
    needs: 'جلسة نشطة + معرّف محاضرة'
  },
  '/quizzes.html': {
    auth: true,
    roles: ['student', 'admin', 'moderator'],
    title: 'الكويزات',
    needs: 'جلسة نشطة'
  },
  '/quiz-rules.html': {
    auth: true,
    roles: ['student', 'admin', 'moderator'],
    title: 'قواعد الكويز',
    needs: 'جلسة نشطة'
  },
  '/schedule.html': {
    auth: true,
    roles: ['student', 'admin', 'moderator'],
    title: 'الجدول',
    needs: 'جلسة نشطة'
  },
  '/announcements.html': {
    auth: true,
    roles: ['student', 'admin', 'moderator'],
    title: 'الإعلانات',
    needs: 'جلسة نشطة'
  },
  '/notifications.html': {
    auth: true,
    roles: ['student', 'admin', 'moderator'],
    title: 'الإشعارات',
    needs: 'جلسة نشطة'
  },
  '/favorites.html': {
    auth: true,
    roles: ['student', 'admin', 'moderator'],
    title: 'المفضلة',
    needs: 'جلسة نشطة'
  },
  '/faq.html': {
    auth: true,
    roles: ['student', 'admin', 'moderator'],
    title: 'الأسئلة الشائعة',
    needs: 'جلسة نشطة'
  },
  '/profile.html': {
    auth: true,
    roles: ['student', 'admin', 'moderator'],
    title: 'الملف الشخصي',
    needs: 'جلسة نشطة'
  },
  '/admin/index.html': {
    auth: true,
    roles: ['admin', 'moderator'],
    title: 'لوحة التحكم',
    needs: 'صلاحية أدمن أو مشرف'
  },
  '/admin/students.html': {
    auth: true,
    roles: ['admin', 'moderator'],
    title: 'الطلاب',
    needs: 'صلاحية أدمن أو مشرف'
  },
  '/admin/subjects.html': {
    auth: true,
    roles: ['admin', 'moderator'],
    title: 'إدارة المواد',
    needs: 'صلاحية أدمن أو مشرف'
  },
  '/admin/materials.html': {
    auth: true,
    roles: ['admin', 'moderator'],
    title: 'إدارة الملفات',
    needs: 'صلاحية أدمن أو مشرف'
  },
  '/admin/quizzes.html': {
    auth: true,
    roles: ['admin', 'moderator'],
    title: 'إدارة الكويزات',
    needs: 'صلاحية أدمن أو مشرف'
  },
  '/admin/schedule.html': {
    auth: true,
    roles: ['admin', 'moderator'],
    title: 'إدارة الجدول',
    needs: 'صلاحية أدمن أو مشرف'
  },
  '/admin/announcements.html': {
    auth: true,
    roles: ['admin', 'moderator'],
    title: 'إدارة الإعلانات',
    needs: 'صلاحية أدمن أو مشرف'
  },
  '/admin/faq.html': {
    auth: true,
    roles: ['admin', 'moderator'],
    title: 'إدارة الأسئلة',
    needs: 'صلاحية أدمن أو مشرف'
  },
  '/admin/settings.html': {
    auth: true,
    roles: ['admin'],
    title: 'إعدادات المنصة',
    needs: 'صلاحية أدمن فقط'
  },
  '/maintenance.html': {
    auth: false,
    roles: [],
    title: 'الصيانة',
    needs: 'لا يتطلب تسجيل دخول'
  },
  '/maintenance-mode.html': {
    auth: false,
    roles: [],
    title: 'وضع الصيانة',
    needs: 'لا يتطلب تسجيل دخول'
  },
  '/404.html': {
    auth: false,
    roles: [],
    title: 'غير موجود',
    needs: 'لا يتطلب تسجيل دخول'
  },
  '/500.html': {
    auth: false,
    roles: [],
    title: 'خطأ خادم',
    needs: 'لا يتطلب تسجيل دخول'
  },
  '/offline.html': {
    auth: false,
    roles: [],
    title: 'بدون اتصال',
    needs: 'لا يتطلب تسجيل دخول'
  }
};

export function getPagePath() {
  let path = window.location.pathname || '/';
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (path === '/' || path === '') return '/index.html';
  if (!path.endsWith('.html')) {
    // Vite/pretty URLs fallback
    const guess = path + '.html';
    if (PAGE_REQUIREMENTS[guess]) return guess;
  }
  return path;
}

export function getPageRequirements(path = getPagePath()) {
  return (
    PAGE_REQUIREMENTS[path] || {
      auth: true,
      roles: ['student', 'admin', 'moderator'],
      title: 'صفحة',
      needs: 'جلسة نشطة'
    }
  );
}

/**
 * Enforce requirements for the current page.
 * Returns { ok, session, profile, requirements } or redirects.
 */
export async function enforcePageRequirements() {
  const requirements = getPageRequirements();
  const { getSession, getProfile } = await import('./supabase.js');

  const session = await getSession();

  if (requirements.guestOnly && session) {
    window.location.replace('/home.html');
    return { ok: false, session, profile: null, requirements };
  }

  if (requirements.auth && !session) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace('/login.html?next=' + next);
    return { ok: false, session: null, profile: null, requirements };
  }

  let profile = null;
  if (session) {
    profile = await getProfile();
    if (requirements.auth && (!profile || profile.is_active === false)) {
      window.location.replace('/login.html');
      return { ok: false, session, profile, requirements };
    }
    if (requirements.roles?.length) {
      const role = profile?.role || 'student';
      if (!requirements.roles.includes(role)) {
        window.location.replace('/home.html');
        return { ok: false, session, profile, requirements };
      }
    }
  }

  // Expose for debugging / future UI
  try {
    document.documentElement.dataset.page = requirements.title || '';
    document.documentElement.dataset.pageNeeds = requirements.needs || '';
  } catch {
    /* ignore */
  }

  return { ok: true, session, profile, requirements };
}
