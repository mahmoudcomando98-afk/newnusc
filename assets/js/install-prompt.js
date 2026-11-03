/**
 * Bottom sheet: "حمّل التطبيق الآن" when NOT installed as PWA.
 * - Installed (standalone / home screen) → never show
 * - "لاحقاً" / إغلاق → يخفي النافذة فوراً في الزيارة الحالية فقط
 * - أي دخول تاني للرئيسية (تحديث أو فتح من جديد) → تظهر تاني لو لسه مش متثبتة
 */

let deferredPrompt = null;

export function isAppInstalled() {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  } catch {
    /* ignore */
  }
  if (typeof navigator !== 'undefined' && navigator.standalone === true) return true;
  try {
    if (window.Capacitor?.isNativePlatform?.()) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function isIos() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function waitForWaGateClosed(maxMs = 120000) {
  return new Promise((resolve) => {
    const gate = document.getElementById('wa-gate');
    if (!gate || !gate.classList.contains('is-visible')) {
      resolve();
      return;
    }
    const start = Date.now();
    const t = setInterval(() => {
      if (!gate.classList.contains('is-visible') || Date.now() - start > maxMs) {
        clearInterval(t);
        resolve();
      }
    }, 300);
  });
}

function hideSheet(sheet) {
  if (!sheet) return;
  sheet.classList.remove('is-visible');
  sheet.setAttribute('aria-hidden', 'true');
}

function showSheet(sheet) {
  if (!sheet) return;
  sheet.classList.add('is-visible');
  sheet.setAttribute('aria-hidden', 'false');
}

export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.__comandoDeferredInstall = e;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.__comandoDeferredInstall = null;
    hideSheet(document.getElementById('install-sheet'));
  });
}

export async function setupInstallPrompt() {
  const sheet = document.getElementById('install-sheet');
  if (!sheet) return;

  if (isAppInstalled()) {
    hideSheet(sheet);
    return;
  }

  // امسح أي إخفاء قديم من جلسات سابقة عشان تظهر كل دخول جديد
  try {
    sessionStorage.removeItem('comando_install_dismiss_session');
  } catch {
    /* ignore */
  }

  await waitForWaGateClosed();

  if (isAppInstalled()) {
    hideSheet(sheet);
    return;
  }

  const howto = document.getElementById('install-howto');
  const btnInstall = document.getElementById('install-btn');
  const btnLater = document.getElementById('install-later');
  const btnClose = document.getElementById('install-close');

  if (isIos() && howto) {
    howto.innerHTML =
      '<strong>على الآيفون:</strong><br />1) اضغط زر المشاركة (□↑) أسفل سفاري<br />2) اختار «إضافة إلى الشاشة الرئيسية»<br />3) اضغط إضافة';
  } else if (howto) {
    howto.innerHTML =
      '<strong>إضافة للشاشة الرئيسية:</strong><br />من قائمة المتصفح ⋮ اختار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».';
  }

  const dismissNow = () => {
    hideSheet(sheet);
  };

  btnLater?.addEventListener('click', dismissNow);
  btnClose?.addEventListener('click', dismissNow);

  btnInstall?.addEventListener('click', async () => {
    const promptEvent = deferredPrompt || window.__comandoDeferredInstall;
    if (promptEvent) {
      try {
        promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        deferredPrompt = null;
        window.__comandoDeferredInstall = null;
        if (choice?.outcome === 'accepted') {
          hideSheet(sheet);
          return;
        }
      } catch {
        /* fall through */
      }
    }
    if (howto) howto.classList.add('is-open');
  });

  setTimeout(() => showSheet(sheet), 500);
}

captureInstallPrompt();
