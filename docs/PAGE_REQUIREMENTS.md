# متطلبات الصفحات (Page Requirements)

كل صفحة لها متطلبات واضحة في `assets/js/page-requirements.js`.

| الصفحة | تسجيل دخول | الأدوار | المطلوب |
|--------|------------|---------|----------|
| index / login / register | لا | — | صفحة عامة |
| home, subjects, quizzes, schedule, … | نعم | student / admin / moderator | حساب مفعّل |
| admin/* | نعم | admin / moderator | صلاحية إدارة |
| admin/settings | نعم | admin فقط | أدمن |
| 404 / 500 / offline / maintenance | لا | — | صفحات نظام |

## الكاش

- `assets/js/cache.js`: تخزين مؤقت في `localStorage` مع مدة صلاحية (TTL).
- ملفات `/assets/*` على Vercel: كاش طويل (`immutable`).
- صفحات HTML: `must-revalidate` حتى تظهر التحديثات فور الـ deploy.

## صفحات الأخطاء

- `404.html` — صفحة غير موجودة
- `500.html` — خطأ خادم
- `offline.html` — بدون اتصال
