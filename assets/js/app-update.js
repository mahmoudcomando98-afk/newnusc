/**
 * COMANDO — زر «تحديث التطبيق» (PWA)
 * بيفحص الـ Service Worker وينبّه الطالب لما فيه نسخة جديدة، ويعمل reload بأمان.
 */
import { showToast } from './utils.js';

let registrationRef = null;
let updateReady = false;
let reloadScheduled = false;

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

function showBanner(text) {
  const banner = document.getElementById('app-update-banner');
  if (!banner) return;
  const label = document.getElementById('app-update-text');
  if (label) label.textContent = text;
  banner.classList.remove('hidden');
  banner.setAttribute('aria-hidden', 'false');
}

function hideBanner() {
  const banner = document.getElementById('app-update-banner');
  if (!banner) return;
  banner.classList.add('hidden');
  banner.setAttribute('aria-hidden', 'true');
}

function showButton() {
  const button = document.getElementById('app-update-btn');
  if (!button) return;
  // التطبيق المثبّت أو أي شاشة موبايل — الكمبيوتر العادي مش محتاج الزر
  if (isStandalone() || isMobile()) button.classList.remove('hidden');
}

function watchForUpdates(reg) {
  reg.addEventListener('updatefound', () => {
    const installing = reg.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        showBanner('فيه نسخة جديدة جاهزة — اضغط «تحديث الآن» عشان تشوف آخر التغييرات.');
      }
    });
  });

  if (reg.waiting && navigator.serviceWorker.controller) {
    showBanner('فيه نسخة جديدة جاهزة — اضغط «تحديث الآن» عشان تشوف آخر التغييرات.');
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateReady || reloadScheduled) return;
    reloadScheduled = true;
    window.location.reload();
  });
}

async function checkForUpdate() {
  if (!registrationRef) {
    showToast('تحديث التطبيق مش متاح في المتصفح ده');
    return;
  }

  showToast('جاري البحث عن تحديث…');
  try {
    await registrationRef.update();
    if (registrationRef.waiting || updateReady) {
      showBanner('فيه نسخة جديدة جاهزة — اضغط «تحديث الآن» عشان تشوف آخر التغييرات.');
    } else {
      showToast('التطبيق محدث بالفعل ✅');
    }
  } catch {
    showToast('تعذر البحث عن تحديث — جرّب تاني بعد شوية');
  }
}

function applyUpdate() {
  const waiting = registrationRef?.waiting;
  updateReady = true;
  if (waiting) {
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // احتياطي لو message مش وصل لأي سبب
    setTimeout(() => {
      if (!reloadScheduled) {
        reloadScheduled = true;
        window.location.reload();
      }
    }, 1200);
    return;
  }
  reloadScheduled = true;
  window.location.reload();
}

async function init() {
  showButton();

  const reloadBtn = document.getElementById('app-update-reload');
  const checkBtn = document.getElementById('app-update-btn');
  checkBtn?.addEventListener('click', checkForUpdate);
  reloadBtn?.addEventListener('click', applyUpdate);

  if (!('serviceWorker' in navigator)) return;

  try {
    registrationRef =
      (await navigator.serviceWorker.getRegistration()) ||
      (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
    if (registrationRef) watchForUpdates(registrationRef);
  } catch {
    /* تحديث التطبيق مش متاح — باقي المنصة شغالة عادي */
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
