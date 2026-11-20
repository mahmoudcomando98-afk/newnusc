/**
 * COMANDO — زر تحديث التطبيق (أيقونة إعادة التحميل في الهيدر)
 * الموبايل والتطبيق المثبّت فقط — بيحدّث الـ Service Worker في صمت من غير رسايل.
 */

let registrationRef = null;

function isStandalone() {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  } catch {
    /* ignore */
  }
  return navigator.standalone === true;
}

function isMobile() {
  try {
    return window.matchMedia('(max-width: 980px)').matches;
  } catch {
    return false;
  }
}

function applyUpdate() {
  const waiting = registrationRef?.waiting;
  if (waiting) {
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => window.location.reload(),
      { once: true }
    );
    waiting.postMessage({ type: 'SKIP_WAITING' });
  } else {
    window.location.reload();
  }
}

async function refreshApp() {
  try {
    if (registrationRef) await registrationRef.update();
  } catch {
    /* ignore */
  }
  applyUpdate();
}

function init() {
  const button = document.getElementById('app-update-btn');
  if (!button) return;

  if (isStandalone() || isMobile()) {
    button.classList.remove('hidden');
    button.addEventListener('click', refreshApp);
  }

  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .getRegistration()
    .then((reg) => reg || navigator.serviceWorker.register('/sw.js', { scope: '/' }))
    .then((reg) => {
      registrationRef = reg;
    })
    .catch(() => {
      /* تحديث التطبيق مش متاح — باقي المنصة شغالة عادي */
    });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
