/**
 * لو المستخدم فتح الرئيسية/المنصة من غير ما يعدّي على شاشة الترحيب،
 * حوّله على index عشان يشوف أنيميشن COMANDO.
 * بعد تسجيل الدخول بنعلّم sessionStorage عشان ما يتكررش في نفس الجلسة.
 */
(function () {
  try {
    if (sessionStorage.getItem('comando_splash_ok') === '1') return;
  } catch (e) {
    return;
  }
  var path = (location.pathname || '').toLowerCase();
  if (path.indexOf('index') !== -1 || path.indexOf('welcome') !== -1 || path.indexOf('login') !== -1) {
    return;
  }
  location.replace('/index.html');
})();
