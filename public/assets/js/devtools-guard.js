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
  var REDIRECT = '/devtools-blocked.html';

  function trap() {
    var started = performance.now();
    /* eslint-disable-next-line no-debugger */
    debugger;
    return performance.now() - started > 120;
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
    if (trap()) block();
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
    setInterval(check, 3000);
  }, 3500);
})();
