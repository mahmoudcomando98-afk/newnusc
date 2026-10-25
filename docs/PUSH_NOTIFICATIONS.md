# إشعارات الخلفية (Web Push)

## 1) SQL
نفّذ في Supabase SQL Editor:
- `supabase/push_subscriptions.sql`

## 2) مفاتيح VAPID
المفتاح العام الافتراضي موجود في `assets/js/push.js`.
المفتاح الخاص (للسيرفر فقط):

```
VAPID_PUBLIC_KEY=BPMz4yfOTRot0gDUO_0USJVuqzKYhlY7OWcpvproCs1BlfWpwBNCO-ugCrhLdRJXRcDoFGF-Qi9Y7ItaMlaK9xQ
VAPID_PRIVATE_KEY=vJf9vQtcxUteJhyL6WXyjFXcA-R6IWph2m_tsYE7E_A
VAPID_SUBJECT=mailto:your-email@example.com
```

في `.env` للفرونت (اختياري):
```
VITE_VAPID_PUBLIC_KEY=BPMz4yfOTRot0gDUO_0USJVuqzKYhlY7OWcpvproCs1BlfWpwBNCO-ugCrhLdRJXRcDoFGF-Qi9Y7ItaMlaK9xQ
```

## 3) Edge Function
```bash
supabase functions deploy send-push
supabase secrets set VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." VAPID_SUBJECT="mailto:..."
```

## 4) سلوك المستخدم
- عند دخول المنصة (مسجّل دخول) يظهر طلب إذن الإشعارات من المتصفح.
- عند الموافقة يُحفظ الاشتراك في `push_subscriptions`.
- عند نشر إعلان من الأدمن يُستدعى `send-push` فيصل الإشعار حتى لو التطبيق في الخلفية.
