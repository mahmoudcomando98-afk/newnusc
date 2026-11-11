# أمان منصة NUSC

## ما تم تنفيذه في الكود
1. **CSP + headers أمنية** في `vercel.json` (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy).
2. **لا يوجد `service_role` في الفرونت** — المفتاح الظاهر هو publishable/anon فقط مع RLS.
3. **دوال `is_admin` / `is_active_user` من نوع SECURITY DEFINER** لتفادي recursion في RLS.
4. **منع ترقية الصلاحيات** من الواجهة (trigger على `profiles.role` و `is_active`).
5. **حظر الحساب** عبر `profiles.is_active` + توجيه لـ `/banned.html`.
6. **سجل تدقيق** `audit_logs` + دالة `write_audit_log`.
7. **حد معدّل** `check_rate_limit` للإجراءات الحساسة.
8. **Edge Function `send-push`**: يتطلب JWT أدمن نشط — ممنوع الاستدعاء بدون صلاحية.
9. **Storage**: باكت `materials` غير عام؛ القراءة للمسجّلين النشطين؛ الرفع للأدمن فقط.
10. **Fallback الملف الشخصي**: لا يعتمد على `user_metadata.role` لمنح أدمن.

## خطوة يدوية إلزامية (مرة واحدة)
في Supabase → **SQL Editor** نفّذ الملف كاملًا:

`supabase/security_hardening_complete.sql`

ثم أعد نشر دالة الإشعارات من جهازك (من مجلد المشروع):

```bash
npx supabase functions deploy send-push --no-verify-jwt
```

ملاحظة: `--no-verify-jwt` يعني أن بوابة Supabase لا ترفض الطلب مبكرًا؛ **التحقق من الأدمن يتم داخل الكود** وهو إلزامي الآن.

## إعدادات يُفضّل ضبطها من لوحة Supabase
- Authentication → Providers → Email: تفعيل Confirm email إن مناسب ليك.
- Authentication → Rate Limits: الإبقاء على الحدود الافتراضية أو تشديدها.
- لو ظهر مفتاح في Git قديمًا: **Rotate** الـ anon key وحدّث متغيرات Vercel.

## ما لا يحمي المنصة وحدها
- منع F12 / DevTools من المتصفح (التخطي سهل؛ الحماية الحقيقية في RLS والـ backend).

## نظام الدخول بالكود الجامعي (الإصدار الجديد)

- **الدخول/التسجيل** بقا بالكود الجامعي فقط؛ لا بريد ولا كلمة مرور. الكود هو مصدر هوية الطالب.
- **`student_codes`**: جدول الكودات (كود + الاسم + الدور `student|moderator|admin` + ربط بالمستخدم `linked_user_id`). RLS: الأدمن/المشرف فقط يديرون الكل؛ الطالب يشوف سطره فقط.
- **`supabase/functions/code-login`** (Edge Function، Service Role):
  - `login`: تتحقق من الكود → ينشئ/يربط مستخدم Supabase ببريد اصطناعي مشتق من الكود (هش غير قابل للعكس) → يرجع `token_hash` (رابط سحر)، والعميل يتحقق منه عبر `supabase.auth.verifyOtp` — الجلسة حقيقية من Supabase فكل RLS الحالية سليمة.
  - `lookup`: بحث بالاسم لمن نسي كوده — حد 6 نتائج؛ اكتب 3 أحرف على الأقل؛ محدّ بـ 60 طلب/دقيقة شامل.
- الحسابات تُنشأ ببريد اصطناعي `sc-<hex>@codes.comando.local` بكلمة سر عشوائية غير مستخدمة، والاسم والدور يُزامَنان من الكود عند كل دخول.
- **تحذير مقبول**: الكود بحد ذاته مفتاح دخول — أي حد يلاقي كود يدخل بحساب صاحبه. لذلك الكودات سرّية بين الطالب والإدارة، ولا تُعرض في أي مكان عام.
- **خطوات التفعيل مرة واحدة**: نفّذ `supabase/student_codes.sql`، ثم انشر الدالة: `npx supabase functions deploy code-login --no-verify-jwt`، ثم أضف صفك: `INSERT INTO public.student_codes (code, full_name, role) VALUES ('الكود', 'الاسم', 'admin');` ثم ادخل من `/login.html`.
