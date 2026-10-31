# تطبيق أندرويد NUSC (Capacitor)

التطبيق غلاف native يفتح المنصة على Vercel. تحديثات الموقع تظهر تلقائيًا.

## أيقونة التطبيق = شعار الموقع (`nusc.png.jpeg`)

1. `npx cap open android`
2. من الشمال: `app` → كليك يمين على `res`
3. **New → Image Asset**
4. Icon Type: **Launcher Icons (Adaptive and Legacy)**
5. Foreground → Path → اختار ملف:
   `public\nusc.png.jpeg` داخل مجلد المشروع
6. Background: أبيض `#FFFFFF`
7. Next → Finish
8. امسح التطبيق من الموبايل لو لسه بالأيقونة القديمة، وبعدين **Run** تاني

## تفعيل الإشعارات (أندرويد 13+)

افتح: `android/app/src/main/AndroidManifest.xml`

داخل `<manifest>` وقبل `<application>` تأكد من وجود:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

بعدها Run من جديد. داخل التطبيق: سجّل دخول → **تفعيل** من بانر الإشعارات على الرئيسية → اسمح من نظام الموبايل.

## تصميم أصغر

الستايل المضغوط على الموقع (`app-compact.css`) يشتغل في التطبيق بعد Deploy على Vercel — اقفل وافتح التطبيق بعد التحديث.

## أوامر

```powershell
git pull
npm install
npx cap sync android
npx cap open android
```

## APK

Build → Build APK(s) → `android/app/build/outputs/apk/debug/app-debug.apk`
