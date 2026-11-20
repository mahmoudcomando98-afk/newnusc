/**
 * COMANDO — حارس أدوات المطوّر
 * عند اكتشاف فتح DevTools يتم التحويل لصفحة /devtools-blocked اللي ترجع للرئيسية.
 * مستثنى: الأدمن، الدخول، الصفحات النظامية، والـ localhost (للاختبار).
 */
(function () {
  var host = (location.hostname || '').toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') return;

  var path = (location.pathname || '').toLowerCase();
  if (
    /\/admin\//.test(path) ||
    /login|register|signup|sign-up|devtools-blocked|offline|maintenance|chrome-required|banned|status/.test(
      path
    )
  ) {
    return;
  }

  var warned = false;
  var hits = 0;
  var REDIRECT = '/devtools-blocked.html';

  /* DevTools المدمج بيصغّر مساحة الصفحة جوّه نفس النافذة */
  function looksOpen() {
    var widthGap = window.outerWidth - window.innerWidth;
    var heightGap = window.outerHeight - window.innerHeight;
    return widthGap > 200 || heightGap > 200;
  }

  function block() {
    if (warned) return;
    warned = true;
    try {
      sessionStorage.setItem('comando_devtools_block', '1');
    } catch {
      /* ignore */
    }
    location.replace(REDIRECT);
  }

  function check() {
    /* محاولتين متتاليتين عشان ما يتحولش بسبب تغيير حجم مؤقت */
    if (looksOpen()) {
      hits += 1;
      if (hits >= 2) block();
    } else {
      hits = 0;
    }
  }

  function blockKeys(e) {
    var key = (e.key || '').toLowerCase();
    var ctrl = e.ctrlKey || e.metaKey;
    var shift = e.shiftKey;
    if (key === 'f12') {
      e.preventDefault();
      block();
      return;
    }
    if (ctrl && shift && ['i', 'j', 'c'].includes(key)) {
      e.preventDefault();
      block();
      return;
    }
    if (ctrl && key === 'u') {
      e.preventDefault();
      block();
    }
  }

  document.addEventListener('keydown', blockKeys, true);
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  /* تأخير بسيط عشان ما نعترضش تحميل الصفحة أو تكبير الشاشة */
  setTimeout(function () {
    check();
    setInterval(check, 1200);
  }, 2500);
})();
