/**
 * COMANDO — زر تحديث التطبيق (أيقونة إعادة التحميل في الهيدر)
 * الموبايل والتطبيق المثبّت فقط. بيفحص النسخة، بيلفّ وبعدين بيقول النتيجة — من غير إعادة تحميل للصفحة.
 */

const STATUS_MS = 3000;
let registrationRef = null;
let busy = false;
let statusTimer = null;

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

function setStatus(text) {
  const el = document.getElementById('app-update-status');
  if (!el) return;
  clearTimeout(statusTimer);
  el.textContent = text;
  el.classList.add('is-visible');
  if (text !== 'جاري التحقق من التحديثات') {
    statusTimer = setTimeout(() => el.classList.remove('is-visible'), STATUS_MS);
  }
}

function setLoading(loading) {
  const btn = document.getElementById('app-update-btn');
  if (!btn) return;
  btn.classList.toggle('is-loading', loading);
  btn.disabled = loading;
}

async function checkUpdate() {
  if (busy) return;
  busy = true;
  setLoading(true);
  setStatus('جاري التحقق من التحديثات');

  let controllerChanged = false;
  const onControllerChange = () => {
    controllerChanged = true;
  };
  navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange, { once: true });

  try {
    if (registrationRef) await registrationRef.update();
    // مهلة قصيرة عشان حدث تفعيل النسخة الجديدة يلحق يوصل
    await new Promise((resolve) => setTimeout(resolve, 500));

    const waiting = registrationRef?.waiting;
    const hasUpdate = controllerChanged || !!waiting;

    if (hasUpdate) {
      if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
      setStatus('تم التحديث');
    } else {
      setStatus('النسخة محدثة بالفعل');
    }
  } catch {
    setStatus('تعذر التحقق من التحديثات');
  } finally {
    navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
    setLoading(false);
    busy = false;
  }
}

function init() {
  const wrap = document.getElementById('app-update-wrap');
  const button = document.getElementById('app-update-btn');
  if (!wrap || !button) return;

  if (isStandalone() || isMobile()) {
    wrap.classList.remove('hidden');
    button.addEventListener('click', checkUpdate);
  }

  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .getRegistration()
    .then((reg) => reg || navigator.serviceWorker.register('/sw.js', { scope: '/' }))
    .then((reg) => {
      registrationRef = reg;
    })
    .catch(() => {
      /* التحديث مش متاح — باقي المنصة شغالة عادي */
    });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
