# ربط واتساب بإشعارات NUSC

واتساب **ما بيبعتش مجانًا من الموقع مباشرة**. محتاج حساب أعمال رسمي (Twilio WhatsApp أو Meta Cloud API).

## التدفق
1. الطالب يكتب رقم واتساب ويوافق من صفحة **حسابي**.
2. الأدمن يبعت إشعار ويفعّل «أرسل على واتساب».
3. Edge Function `send-whatsapp` تبعت الرسالة عبر Twilio لكل من وافق.

## 1) SQL
نفّذ في Supabase SQL Editor:

```sql
-- من الملف whatsapp_opt_in.sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT false;
```

## 2) Twilio
1. اعمل حساب [Twilio](https://www.twilio.com/) وفعّل WhatsApp (Sandbox للتجربة أو رقم معتمد للإنتاج).
2. خُد: Account SID · Auth Token · From مثل `whatsapp:+14155238886`.

## 3) Secrets + Deploy

```bash
supabase login
supabase link --project-ref keaoerzmdxthrgpqnwvs

supabase secrets set \
  TWILIO_ACCOUNT_SID="ACxxxx" \
  TWILIO_AUTH_TOKEN="xxxx" \
  TWILIO_WHATSAPP_FROM="whatsapp:+14155238886" \
  WHATSAPP_ENABLED="true"

supabase functions deploy send-whatsapp
```

## 4) ملاحظات مهمة
- في الإنتاج، واتساب غالبًا يطلب **قوالب رسائل (Templates)** معتمدة للرسائل الجماعية خارج نافذة 24 ساعة.
- الرسائل ليها تكلفة حسب Twilio.
- ابعت بس للطلاب اللي **وافقوا** (whatsapp_opt_in = true).
- الرقم يتخزن بصيغة مصرية `01…` أو دولية `2010…` والدالة بتظبطه.

## 5) تجربة
1. طالب: حسابي → رقم واتساب + تفعيل الموافقة.
2. لو Sandbox: الطالب لازم يبعت رسالة تفعيل لرقم Twilio مرة واحدة.
3. أدمن: إرسال إشعار مع تفعيل واتساب.
