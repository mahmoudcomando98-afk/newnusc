/**
 * Bottom sheet: "حمّل التطبيق الآن" when the site is NOT running as installed PWA.
 * Hidden permanently while display-mode is standalone / iOS home-screen.
 * "لاحقاً" hides for the current tab session only; next visit shows again if still not installed.
 */

const SESSION_DISMISS = 'comando_install_dismiss_session';

let deferredPrompt = null;

export function isAppInstalled() {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  } catch {
    /* ignore */
  }
  // iOS Safari home screen
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

function isSessionDismissed() {
  try {
    return sessionStorage.getItem(SESSION_DISMISS) === '1';
  } catch {
    return false;
  }
}

function markSessionDismissed() {
  try {
    sessionStorage.setItem(SESSION_DISMISS, '1');
  } catch {
    /* ignore */
  }
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

/** Capture Chrome/Edge install event early */
export function captureInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.__comandoDeferredInstall = e;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const sheet = document.getElementById('install-sheet');
    hideSheet(sheet);
  });
}

export async function setupInstallPrompt() {
  const sheet = document.getElementById('install-sheet');
  if (!sheet) return;

  if (isAppInstalled()) {
    hideSheet(sheet);
    return;
  }

  if (isSessionDismissed()) {
    hideSheet(sheet);
    return;
  }

  await waitForWaGateClosed();

  // Re-check after WA gate (user might have switched)
  if (isAppInstalled() || isSessionDismissed()) {
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

  const dismiss = () => {
    markSessionDismissed();
    hideSheet(sheet);
  };

  btnLater?.addEventListener('click', dismiss);
  btnClose?.addEventListener('click', dismiss);

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
        /* fall through to howto */
      }
    }
    // No native prompt (iOS / unsupported) → show steps
    if (howto) howto.classList.add('is-open');
  });

  // Small delay so home content paints first
  setTimeout(() => showSheet(sheet), 600);
}

// Start listening as soon as module loads
captureInstallPrompt();
