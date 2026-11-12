/**
 * نافذة تثبيت التطبيق / اختصار سطح المكتب (PWA)
 * - موبايل + كمبيوتر (Chrome / Edge)
 * - لو متثبت أو مفتوح كـ standalone → مش بتظهر
 * - «لاحقاً» يخفي فوراً؛ الدخول التالي من المتصفح يعرضها لو لسه مش متثبتة
 */

const INSTALLED_FLAG = 'comando_pwa_installed_v1';

let deferredPrompt = null;

export function isAppInstalled() {
  try {
    if (localStorage.getItem(INSTALLED_FLAG) === '1') return true;
  } catch {
    /* ignore */
  }

  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
    if (window.matchMedia('(display-mode: window-controls-overlay)').matches) return true;
  } catch {
    /* ignore */
  }

  if (typeof navigator !== 'undefined' && navigator.standalone === true) return true;

  try {
    if (window.Capacitor?.isNativePlatform?.()) return true;
  } catch {
    /* ignore */
  }

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

function isDesktop() {
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return false;
  if (navigator.maxTouchPoints > 1 && /iPad|Macintosh/i.test(ua)) return false;
  return true;
}

/** تسجيل مبكر عشان قبلinstallprompt يشتغل على الكمبيوتر */
async function ensureServiceWorkerRegistered() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return reg;
  } catch (err) {
    console.warn('[COMANDO] SW register:', err?.message || err);
    return null;
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

function applyDesktopCopy() {
  const title = document.getElementById('install-title');
  const copy = document.querySelector('.install-sheet-copy p');
  const btn = document.getElementById('install-btn');
  const howto = document.getElementById('install-howto');

  if (isDesktop()) {
    if (title) title.textContent = 'ثبّت المنصة على الكمبيوتر';
    if (copy) {
      copy.textContent =
        'اضغط تثبيت عشان يتعمل اختصار لـ COMANDO على سطح المكتب وقائمة التطبيقات، وتفتحها كنافذة مستقلة.';
    }
    if (btn) btn.textContent = 'تثبيت على سطح المكتب';
    if (howto) {
      howto.innerHTML =
        '<strong>على الكمبيوتر (Chrome أو Edge):</strong><br />1) اضغط «تثبيت على سطح المكتب»<br />2) أكّد التثبيت في نافذة المتصفح<br />3) هتلاقي اختصار COMANDO على سطح المكتب أو قائمة Start';
    }
  } else if (isIos()) {
    if (title) title.textContent = 'حمّل التطبيق الآن';
    if (howto) {
      howto.innerHTML =
        '<strong>على الآيفون:</strong><br />1) اضغط زر المشاركة (□↑) أسفل سفاري<br />2) اختار «إضافة إلى الشاشة الرئيسية»<br />3) اضغط إضافة';
    }
  } else {
    if (title) title.textContent = 'حمّل التطبيق الآن';
    if (howto) {
      howto.innerHTML =
        '<strong>إضافة للشاشة الرئيسية:</strong><br />من قائمة المتصفح ⋮ اختار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».';
    }
  }
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

  hideSheet(sheet);

  if (isAppInstalled()) {
    markInstalled();
    return;
  }

  // سجّل الـ SW بدري عشان التثبيت يشتغل على الكمبيوتر
  await ensureServiceWorkerRegistered();

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

  applyDesktopCopy();

  const howto = document.getElementById('install-howto');
  const btnInstall = document.getElementById('install-btn');
  const btnLater = document.getElementById('install-later');
  const btnClose = document.getElementById('install-close');

  if (howto) howto.classList.remove('is-open');

  const dismissNow = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    hideSheet(sheet);
  };

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
          // رفض المستخدم — نخفي للزيارة دي
          hideSheet(sheet);
          return;
        } catch {
          /* fall through */
        }
      }

      // مفيش prompt جاهز (Firefox / Safari سطح مكتب) → خطوات يدوية
      if (howto) howto.classList.add('is-open');
    });
  }

  // استنى شوية عشان beforeinstallprompt يلحق يتسجل بعد SW
  setTimeout(() => {
    if (!isAppInstalled()) showSheet(sheet);
  }, isDesktop() ? 900 : 500);
}

captureInstallPrompt();

if (isAppInstalled()) {
  markInstalled();
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => hideSheet(document.getElementById('install-sheet')),
      { once: true }
    );
  } else {
    hideSheet(document.getElementById('install-sheet'));
  }
}
