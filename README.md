# NUSC Student Hub

منصة أكاديمية لطلاب كلية الحاسبات والمعلومات — ملفات المواد، الكويزات، الجدول، والإعلانات.

## التشغيل المحلي

```bash
git clone https://github.com/mahmoudcomando98-afk/newnusc.git
cd newnusc
npm install
cp .env.example .env
# عدّل قيم Supabase في .env
npm run dev
```

افتح العنوان اللي يظهره Vite (عادةً `http://localhost:5173`).

## متغيرات البيئة

| المتغير | الوصف |
|---------|--------|
| `VITE_SUPABASE_URL` | رابط مشروع Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | المفتاح العام (anon / publishable) |
| `VITE_VAPID_PUBLIC_KEY` | مفتاح Web Push العام (اختياري) |

**لا تضع Service Role Key في الفرونت أبدًا.**

## Supabase

نفّذ ملفات SQL من مجلد `supabase/` بالترتيب المناسب لمشروعك (على الأقل `schema.sql` و `policies.sql`).  
لجدول المواعيد الحالي في الإنتاج: `schedule_items` + `fix_student_schedule_read.sql`.

## Deploy

- الاستضافة: **Vercel** (ربط فرع `main`).
- بعد كل push كبير: Redeploy بدون Build Cache لو التغييرات مش ظاهرة.
- Edge Function للإشعارات: `supabase/functions/send-push` (اختياري).

## الصفحات

| المسار | الوصف |
|--------|--------|
| `/` | تحويل تلقائي لوجين أو الرئيسية |
| `/login` `/register` | الحساب |
| `/home` | لوحة الطالب |
| `/subjects` `/quizzes` `/schedule` | المحتوى الدراسي |
| `/admin/*` | لوحة الإدارة (صلاحية admin) |

## التطوير

Mahmoud Oshiba
