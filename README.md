# COMANDO — منصة COMANDO التعليمية

منصة تعليمية للملفات، الكويزات، الجدول، والإعلانات.

## التشغيل المحلي

```bash
git clone https://github.com/mahmoudcomando98-afk/newnusc.git
cd newnusc
npm install
cp .env.example .env
# عدّل قيم Supabase في .env
npm run dev
```

## متغيرات البيئة

| المتغير | الوصف |
|---------|--------|
| `VITE_SUPABASE_URL` | رابط مشروع Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | المفتاح العام (anon / publishable) |
| `VITE_VAPID_PUBLIC_KEY` | مفتاح Web Push العام (اختياري) |

**لا تضع Service Role Key في الفرونت أبدًا.**

## الدخول

الطلاب والإدارة يدخلون بـ **الكود الجامعي** من `/login.html` (لا بريد ولا كلمة مرور).

1. نفّذ `supabase/student_codes.sql` مرة واحدة من SQL Editor في Supabase.
2. انشر دالة الدخول: `npx supabase functions deploy code-login --no-verify-jwt`
3. أضف نفسك كأدمن: `INSERT INTO public.student_codes (code, full_name, role) VALUES ('20260001', 'اسمك', 'admin');`
4. ادخل من `/login.html` واكتب الكود.

إدارة القائمة من **لوحة التحكم → كودات الطلاب**: إضافة يدوية، استيراد xlsx/csv تلقائي، تصدير CSV، استبعاد/تفعيل.

## Deploy

- الاستضافة: **Vercel** (فرع `main`).
- Edge Function للإشعارات: `supabase/functions/send-push` (اختياري).

## التطوير

Mahmoud Oshiba
