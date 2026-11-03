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

## Deploy

- الاستضافة: **Vercel** (فرع `main`).
- Edge Function للإشعارات: `supabase/functions/send-push` (اختياري).

## التطوير

Mahmoud Oshiba
