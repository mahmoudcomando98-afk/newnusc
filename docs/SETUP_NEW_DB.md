# إعداد القاعدة الجديدة (nusc-v2)

## 1) SQL مرة واحدة

في **Supabase Dashboard → SQL Editor** نفّذ الملف:

`supabase/SETUP_NEW_DB.sql`

يشمل:
- `is_admin()` و `check_rate_limit`
- إصلاح `profiles.name` / `full_name`
- جدول `student_codes` + سياسات
- أعمدة materials / announcements / lectures / quizzes
- جداول و RPC للكويزات التفاعلية

## 2) Edge Function للدخول

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy code-login --no-verify-jwt
```

## 3) أول أدمن

```sql
INSERT INTO public.student_codes (code, full_name, role)
VALUES ('20260001', 'اسمك هنا', 'admin');
```

ادخل من `/login.html` بنفس الكود.

## 4) متغيرات Vercel

- `VITE_SUPABASE_URL` = رابط المشروع الجديد
- `VITE_SUPABASE_PUBLISHABLE_KEY` = المفتاح العام

ثم Redeploy.

## 5) اختياري — Push

```bash
npx supabase secrets set VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." VAPID_SUBJECT="mailto:you@example.com"
npx supabase functions deploy send-push --no-verify-jwt
```
