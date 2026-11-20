# إشعارات الخلفية (Web Push)

## 1) SQL
نفّذ في Supabase SQL Editor:
- `supabase/push_subscriptions.sql`

## 2) مفاتيح VAPID
- **المفتاح العام (Public)** يمكن وضعه في الفرونت (`assets/js/push.js` أو `VITE_VAPID_PUBLIC_KEY`).
- **المفتاح الخاص (Private)** يُخزَّن فقط في Secrets على Supabase — **ممنوع** وضعه في Git أو في أي ملف واجهة.

إنشاء زوج مفاتيح جديد (مستحسن لو المفتاح القديم ظهر في Git):

```bash
npx web-push generate-vapid-keys
```

ضبط الأسرار على المشروع:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set \
  VAPID_PUBLIC_KEY="مفتاح_عام_جديد" \
  VAPID_PRIVATE_KEY="مفتاح_خاص_جديد" \
  VAPID_SUBJECT="mailto:your-email@example.com"
```

في `.env` للفرونت (اختياري — العام فقط):

```
VITE_VAPID_PUBLIC_KEY=مفتاح_عام_جديد
```

حدّث نفس المفتاح العام في `assets/js/push.js` إن لم تستخدم متغير البيئة.

## 3) Edge Function

```bash
npx supabase functions deploy send-push --no-verify-jwt
```

(الدالة تقرأ المفاتيح من Secrets فقط.)

## 4) سلوك المستخدم
- بعد تسجيل الدخول يمكن طلب تفعيل الإشعارات من زر في الواجهة.
- عند الموافقة يُحفظ الاشتراك في `push_subscriptions`.
- عند إرسال إشعار من الأدمن تُستدعى `send-push` فيصل الإشعار حتى لو التطبيق في الخلفية.
