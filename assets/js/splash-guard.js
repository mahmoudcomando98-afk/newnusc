/**
 * شاشة ترحيب COMANDO:
 * - فتح المنصة من غير index → تحويل للأنيميشن
 * - التطبيق المثبّت: كل فتح جديد يظهر الترحيب
 * - إخفاء الصفحة لحظيًا قبل التحويل عشان ما يحصلش وميض
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
      if (window.navigator.standalone === true) return true;
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

  function hideAndGo(url) {
    try {
      document.documentElement.style.background = '#faf9f7';
      document.documentElement.style.visibility = 'hidden';
    } catch (e) {}
    location.replace(url);
  }

  var hasOk = false;
  try {
    hasOk = sessionStorage.getItem('comando_splash_ok') === '1';
  } catch (e) {
    hasOk = false;
  }

  if (isInstalledApp() && isColdOpen()) {
    try {
      sessionStorage.removeItem('comando_splash_ok');
    } catch (e) {}
    hideAndGo('/index.html?from=app');
    return;
  }

  if (!hasOk) {
    hideAndGo('/index.html');
  }
})();
