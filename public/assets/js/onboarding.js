/**
 * COMANDO — جولة تعريفية قصيرة للطالب الجديد (3 خطوات، مرة واحدة فقط)
 */
(function () {
  var KEY = 'comando_onboarding_done_v1';
  var path = (window.location.pathname || '').toLowerCase();

  if (
    /login|register|signup|sign-up|admin|\/chat(\.html)?$|offline|maintenance|status|chrome-required|banned|devtools-blocked/.test(
      path
    )
  ) {
    return;
  }
  try {
    if (localStorage.getItem(KEY) === '1') return;
  } catch {
    return;
  }

  var SVG =
    'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  var ICONS = [
    '<svg ' + SVG + '><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    '<svg ' + SVG + '><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 4v4M8 4v4M3 10h18"/><path d="M9 15l2 2 4-4"/></svg>',
    '<svg ' + SVG + '><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
  ];
  var STEPS = [
    {
      title: 'كل موادك في مكان واحد',
      text: 'دخل على «المواد» تلاقي المحاضرات والملفات والسكاشن مرتّبة حسب المادة.',
      sub: 'أي ملف جديد بيوصلك إشعار فيه أول بأول.'
    },
    {
      title: 'الكويزات ومواعيدها',
      text: 'صفحة «الكويزات» بتعرض لك المواعيد والتعليمات قبل الامتحان.',
      sub: 'و«خطتي» بتساعدك ترتّب مذاكرتك يوم بيوم.'
    },
    {
      title: 'مفيش حاجة تفوتك',
      text: 'فعّل إشعارات التليفون من الصفحة الرئيسية عشان توصلك التنبيهات فورًا.',
      sub: 'ومع كيرو أو توتا تسأل عن أي حاجة في أي وقت.'
    }
  ];

  var step = 0;
  var overlay = null;

  function finish() {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') finish();
  }

  function render() {
    var item = STEPS[step];
    var dots = STEPS.map(function (_, i) {
      return '<span class="onboarding-dot' + (i === step ? ' is-active' : '') + '"></span>';
    }).join('');

    overlay.innerHTML =
      '<div class="onboarding-card" role="dialog" aria-modal="true" aria-label="جولة تعريفية">' +
        '<div class="onboarding-top">' +
          '<span class="onboarding-brand">COMANDO</span>' +
          '<button type="button" class="onboarding-skip">تخطي</button>' +
          '<div class="onboarding-title">' + item.title + '</div>' +
        '</div>' +
        '<div class="onboarding-body">' +
          '<div class="onboarding-icon" aria-hidden="true">' + ICONS[step] + '</div>' +
          '<p class="onboarding-text">' + item.text + '</p>' +
          '<p class="onboarding-sub">' + item.sub + '</p>' +
        '</div>' +
        '<div class="onboarding-dots" aria-hidden="true">' + dots + '</div>' +
        '<div class="onboarding-actions">' +
          '<button type="button" class="btn btn-secondary onboarding-prev"' + (step === 0 ? ' disabled' : '') + '>السابق</button>' +
          '<button type="button" class="btn btn-primary onboarding-next">' +
            (step === STEPS.length - 1 ? 'فهمت، ابدأ' : 'التالي') +
          '</button>' +
        '</div>' +
      '</div>';

    overlay.querySelector('.onboarding-skip').addEventListener('click', finish);
    overlay.querySelector('.onboarding-prev').addEventListener('click', function () {
      if (step > 0) {
        step -= 1;
        render();
      }
    });
    overlay.querySelector('.onboarding-next').addEventListener('click', function () {
      if (step < STEPS.length - 1) {
        step += 1;
        render();
      } else {
        finish();
      }
    });
  }

  function show() {
    overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';
    overlay.dir = 'rtl';
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey);
    render();
  }

  function waitForSlot(tries) {
    tries = tries || 0;
    var busy = document.querySelector('.install-sheet.is-visible, #wa-gate.is-visible');
    if (busy && tries < 12) {
      setTimeout(function () {
        waitForSlot(tries + 1);
      }, 300);
      return;
    }
    show();
  }

  function start() {
    setTimeout(function () {
      waitForSlot(0);
    }, 900);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
