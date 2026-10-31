# تطبيق أندرويد NUSC (Capacitor)

التطبيق غلاف native يفتح المنصة المنشورة على Vercel داخل WebView.
أي تحديث على الموقع يظهر للطلاب تلقائيًا بدون إعادة بناء التطبيق في أغلب الحالات.

## المتطلبات على جهازك (مرة واحدة)

1. **Node.js** (مثبت عندك بالفعل).
2. **Android Studio** من الموقع الرسمي: https://developer.android.com/studio  
   أثناء التثبيت فعّل:
   - Android SDK
   - Android SDK Platform
   - Android Virtual Device (اختياري للمحاكي)
3. من Android Studio → Settings → Languages & Frameworks → Android SDK  
   ثبّت منصة حديثة (مثل API 34) و **Android SDK Build-Tools**.

## خطوات الإنشاء (مرة أولى فقط)

افتح PowerShell داخل مجلد المشروع:

```powershell
cd C:\Windows\system32\newnusc
# أو المسار الصحيح لمجلد newnusc عندك

git pull

npm install

npm run build

npx cap add android
```

إذا ظهر أن مجلد `android` موجود بالفعل، تخطَّ `cap add`.

ثم:

```powershell
npx cap sync android
npx cap open android
```

هيفتح **Android Studio**. انتظر ما يخلص Gradle Sync.

### تشغيل على موبايل أو محاكي
- وصّل الموبايل بـ USB وفعّل **Developer options → USB debugging**، أو شغّل محاكي.
- من Android Studio اضغط **Run** (المثلث الأخضر).

### استخراج APK للتجربة
Android Studio → **Build → Build Bundle(s) / APK(s) → Build APK(s)**  
الملف يظهر تحت: `android/app/build/outputs/apk/debug/app-debug.apk`  
انقله للموبايل وثبّته (قد تحتاج السماح بتثبيت من مصادر غير معروفة).

### رفع على Google Play (لاحقًا)
- Build → Generate Signed Bundle / APK → Android App Bundle  
- تحتاج حساب Google Play Console (~25 دولار مرة واحدة).

## تحديثات لاحقة

بعد أي تغيير في إعدادات Capacitor فقط:

```powershell
npm run cap:sync
npx cap open android
```

تغييرات المنصة على Vercel **تظهر في التطبيق بدون APK جديد** لأن التطبيق يحمّل من:
`https://nusc-doble-m.vercel.app`

## تغيير رابط المنصة

عدّل في `capacitor.config.json`:

```json
"server": {
  "url": "https://YOUR-DOMAIN.vercel.app"
}
```

ثم:

```powershell
npx cap sync android
```

## ملاحظات
- التطبيق يعتمد على إنترنت (نفس المنصة).
- الإشعارات الويب تعمل داخل WebView حسب دعم النظام؛ قد نضيف لاحقًا إشعارات Capacitor native إن احتجت.
- لا ترفع مجلد `android/` كامل على Git إن كان ثقيلًا؛ الإعدادات الأساسية موجودة في `capacitor.config.json`.
