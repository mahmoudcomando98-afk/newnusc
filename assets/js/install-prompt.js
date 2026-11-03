/**
 * Bottom sheet: "حمّل التطبيق الآن"
 * - لو التطبيق متثبت (standalone / الشاشة الرئيسية) → مش بيظهر خالص
 * - لاحقاً / × → إخفاء فوري كامل (display:none)
 * - دخول تاني من المتصفح (مش مثبت) → يظهر تاني
 */

const INSTALLED_FLAG = 'comando_pwa_installed_v1';

let deferredPrompt = null;

export function isAppInstalled() {
  // بعد تثبيت ناجح من نفس الجهاز
  try {
    if (localStorage.getItem(INSTALLED_FLAG) === '1') return true;
  } catch {
    /* ignore */
  }

  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  } catch {
    /* ignore */
  }

  // iOS: فتح من أيقونة الشاشة الرئيسية
  if (typeof navigator !== 'undefined' && navigator.standalone === true) return true;

  try {
    if (window.Capacitor?.isNativePlatform?.()) return true;
  } catch {
    /* ignore */
  }

  // Android Chrome sometimes exposes this
  try {
    if (document.referrer && document.referrer.startsWith('android-app://')) return true;
  } catch {
    /* ignore */
  }

  return false;
}

function markInstalled() {
  try {
    localStorage.setItem(INSTALLED_FLAG, '1');
  } catch {
    /* ignore */
  }
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

/** إخفاء كامل — مفيش جزء ظاهر تحت */
function hideSheet(sheet) {
  if (!sheet) return;
  sheet.classList.remove('is-visible');
  sheet.setAttribute('aria-hidden', 'true');
  sheet.hidden = true;
  sheet.style.display = 'none';
}

function showSheet(sheet) {
  if (!sheet || isAppInstalled()) {
    hideSheet(sheet);
    return;
  }
  sheet.hidden = false;
  sheet.style.display = '';
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
    markInstalled();
    hideSheet(document.getElementById('install-sheet'));
  });
}

export async function setupInstallPrompt() {
  const sheet = document.getElementById('install-sheet');
  if (!sheet) return;

  // ابدأ دايمًا مخفي تمامًا
  hideSheet(sheet);

  if (isAppInstalled()) {
    return;
  }

  // لو المتصفح بيدعم related apps
  try {
    if (navigator.getInstalledRelatedApps) {
      const apps = await navigator.getInstalledRelatedApps();
      if (Array.isArray(apps) && apps.length > 0) {
        markInstalled();
        return;
      }
    }
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

  if (howto) {
    howto.classList.remove('is-open');
    if (isIos()) {
      howto.innerHTML =
        '<strong>على الآيفون:</strong><br />1) اضغط زر المشاركة (□↑) أسفل سفاري<br />2) اختار «إضافة إلى الشاشة الرئيسية»<br />3) اضغط إضافة';
    } else {
      howto.innerHTML =
        '<strong>إضافة للشاشة الرئيسية:</strong><br />من قائمة المتصفح ⋮ اختار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».';
    }
  }

  const dismissNow = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    hideSheet(sheet);
  };

  // اربط مرة واحدة
  if (!sheet.dataset.bound) {
    sheet.dataset.bound = '1';
    btnLater?.addEventListener('click', dismissNow);
    btnClose?.addEventListener('click', dismissNow);

    btnInstall?.addEventListener('click', async () => {
      if (isAppInstalled()) {
        hideSheet(sheet);
        return;
      }
      const promptEvent = deferredPrompt || window.__comandoDeferredInstall;
      if (promptEvent) {
        try {
          promptEvent.prompt();
          const choice = await promptEvent.userChoice;
          deferredPrompt = null;
          window.__comandoDeferredInstall = null;
          if (choice?.outcome === 'accepted') {
            markInstalled();
            hideSheet(sheet);
            return;
          }
        } catch {
          /* fall through */
        }
      }
      if (howto) howto.classList.add('is-open');
    });
  }

  setTimeout(() => {
    if (!isAppInstalled()) showSheet(sheet);
  }, 500);
}

captureInstallPrompt();

// لو الصفحة اتفتحت أصلًا كـ PWA، علّم وابقَ مخفي
if (isAppInstalled()) {
  markInstalled();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => hideSheet(document.getElementById('install-sheet')), {
      once: true
    });
  } else {
    hideSheet(document.getElementById('install-sheet'));
  }
}
