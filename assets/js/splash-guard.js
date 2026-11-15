/**
 * شاشة ترحيب COMANDO:
 * - أي فتح للمنصة من غير ما يعدّي على index → يتحوّل للأنيميشن
 * - التطبيق المثبّت (PWA / standalone): كل فتح جديد (مفيش referrer داخلي)
 *   يظهر الأنيميشن حتى لو الجلسة لسه مفتوحة
 */
(function () {
  var path = (location.pathname || '').toLowerCase();
  if (
    path.indexOf('index') !== -1 ||
    path.indexOf('welcome') !== -1 ||
    path.indexOf('login') !== -1
  ) {
    return;
  }

  function isInstalledApp() {
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) return true;
      if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
    } catch (e) {}
    try {
      if (window.navigator.standalone === true) return true; // iOS Safari
    } catch (e) {}
    try {
      if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function isColdOpen() {
    try {
      if (!document.referrer) return true;
      var ref = new URL(document.referrer);
      return ref.origin !== location.origin;
    } catch (e) {
      return true;
    }
  }

  var hasOk = false;
  try {
    hasOk = sessionStorage.getItem('comando_splash_ok') === '1';
  } catch (e) {
    hasOk = false;
  }

  // فتح التطبيق المثبّت من الأيقونة (مش تنقل جوه المنصة) → أنيميشن دائمًا
  if (isInstalledApp() && isColdOpen()) {
    try {
      sessionStorage.removeItem('comando_splash_ok');
    } catch (e) {}
    location.replace('/index.html?from=app');
    return;
  }

  if (!hasOk) {
    location.replace('/index.html');
  }
})();
