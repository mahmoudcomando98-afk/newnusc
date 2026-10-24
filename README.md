# NUSC Student Hub

منصة جامعية متكاملة لطلاب الفرقة الأولى — كلية الحاسبات والمعلومات — جامعة NUSC

## التقنيات

- HTML5 + CSS3 + JavaScript (Vanilla)
- Vite
- Supabase (Auth + PostgreSQL + Storage)

## متطلبات التشغيل

- Node.js 22 أو أحدث.
- npm يدعم lockfile الإصدار 3.

## التشغيل المحلي

```bash
git clone https://github.com/mahmoudcomando98-afk/newnusc.git
cd newnusc
npm install
cp .env.example .env
```

عدّل `.env`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

```bash
npm run dev
```

## إعداد Supabase

1. أنشئ مشروعاً جديداً في [supabase.com](https://supabase.com)
2. نفّذ ملفات SQL بالترتيب:
   - `supabase/schema.sql`
   - `supabase/policies.sql`
   - `supabase/storage.sql`
   - `supabase/functions.sql`
   - `supabase/maintenance_lockdown.sql`
   - `supabase/secure_admin_access.sql`
   - `supabase/security_hardening.sql` (بعد ملف الصيانة، لتطبيق قيود RPC النهائية)
   - `supabase/seed.sql` (اختياري)
3. Authentication → Providers → Email: فعّل Email
4. Authentication → URL Configuration: أضف `http://localhost:5173`

### إنشاء حساب مدير

1. سجّل حساباً عادياً من الواجهة
2. في SQL Editor:

```sql
UPDATE public.profiles SET role = 'admin' WHERE email = 'your@email.com';
```

## البناء والنشر

```bash
npm run build
```

ارفع مجلد `dist/` على Vercel / Netlify / Cloudflare Pages.

## الميزات

- تسجيل دخول بدون موافقة إدارة
- مواد ومحاضرات وملفات
- كويزات وقواعد
- جدول دراسي
- إعلانات وإشعارات
- مفضلة وبحث
- لوحة إدارة كاملة
- RLS وأمان Supabase

## الترخيص

MIT
