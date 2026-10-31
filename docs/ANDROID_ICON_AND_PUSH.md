# أيقونة التطبيق + الإشعارات (أندرويد)

## 1) تغيير أيقونة التطبيق لشعار الموقع

شعار الموقع موجود في المشروع: `public/nusc.png.jpeg`

### الطريقة الأسهل (من Android Studio بعد `npx cap open android`)

1. في لوحة Project افتح:
   `android/app/src/main/res/`
2. انسخ `nusc.png.jpeg` من مجلد المشروع إلى جهازك وحوّله لـ PNG إن لزم (أو استخدمه كما هو في بعض الإصدارات).
3. كليك يمين على مجلد `res` → **New → Image Asset**
4. Icon Type: **Launcher Icons (Adaptive and Legacy)**
5. Foreground: اختار صورة الشعار `nusc.png.jpeg`
6. Background: لون أبيض `#FFFFFF` أو نفس خلفية الشعار
7. Next → Finish
8. Run ▶ من جديد على الموبايل

كده أيقونة التطبيق على الشاشة الرئيسية تبقى شعار NUSC.

### بديل سطر أوامر (اختياري)
ضع صورة مربعة 1024×1024 باسم:
`resources/icon.png`
ثم:
```powershell
npm i -D @capacitor/assets
npx capacitor-assets generate --android
npx cap sync android
```

## 2) الإشعارات من الأدمن

التطبيق يفتح نفس موقع Vercel، فـ **نفس نظام Web Push** الحالي يُستخدم:

1. الطالب يفتح التطبيق ويسجّل دخول
2. من الرئيسية يظهر بانر **«فعّل إشعارات التليفون»** → يضغط **تفعيل** → سماح
3. الأدمن يبعت من لوحة الإشعارات كالعادة

### أندرويد 13+ صلاحية النظام
بعد `npx cap add android`، تأكد أن الملف:
`android/app/src/main/AndroidManifest.xml`
فيه داخل `<manifest>`:
```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```
لو مش موجود، أضفه يدويًا ثم:
```powershell
npx cap sync android
```
وشغّل Run تاني.

### لو الإشعار مش بيوصل داخل التطبيق
- تأكد إن الطالب ضغط **تفعيل** والسماح من إعدادات التطبيق
- إعدادات الهاتف → التطبيقات → NUSC → الإشعارات → مسموح
- نفس خطوات Web Push (VAPID + send-push) تبقى شغالة من قبل

## 3) واجهة أصغر على الموبايل
تم تشديد `assets/css/app-compact.css` (خط أصغر، هوامش أقل، كروت أضيق).
بعد نشر Vercel حدّث الصفحة أو أعد فتح التطبيق؛ التغييرات على الموقع تظهر في التطبيق تلقائيًا لأن الغلاف يحمّل من الإنترنت.
