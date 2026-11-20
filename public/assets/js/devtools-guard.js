/**
 * COMANDO — حارس أدوات المطوّر
 * عند اكتشاف فتح DevTools تظهر صفحة المانع تلقائيًا.
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
  var FLAG = 'comando_devtools_block';
  var justBlocked = false;

  try {
    if (sessionStorage.getItem(FLAG) === '1') {
      sessionStorage.removeItem(FLAG);
      justBlocked = true;
    }
  } catch {
    /* ignore */
  }

  /* فخ Console: المتصفح بيترجم رسائل console بس لما أدوات المطوّر تكون مفتوحة،
     فأول ما تفتح الـ getters بتتCalled ونحوّل فورًا من غير أي تجميد */
  function consoleTrap() {
    var fired = false;
    var probe = {};
    Object.defineProperty(probe, 'id', {
      configurable: true,
      get: function () {
        if (!fired) {
          fired = true;
          block();
        }
        return 'COMANDO';
      }
    });
    probe.toString = function () {
      if (!fired) {
        fired = true;
        block();
      }
      return 'COMANDO';
    };
    console.log('%o', probe);
  }

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
      sessionStorage.setItem(FLAG, '1');
    } catch {
      /* ignore */
    }
    location.replace(REDIRECT);
  }

  function check() {
    consoleTrap();
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
    var alt = e.altKey;

    var devtoolsCombo =
      key === 'f12' ||
      (ctrl && shift && ['i', 'j', 'c', 'k', 'm', 'e'].includes(key)) ||
      (ctrl && alt && ['i', 'j', 'c', 'u'].includes(key)) ||
      (ctrl && key === 'u');

    if (devtoolsCombo) {
      e.preventDefault();
      e.stopPropagation();
      block();
    }
  }

  document.addEventListener('keydown', blockKeys, true);
  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  /* فحص سريع ومستمر — التحويل لصفحة المانع أول ما يتكشف الفتح */
  setTimeout(function () {
    check();
    setInterval(check, 700);
  }, justBlocked ? 1800 : 1200);
})();
