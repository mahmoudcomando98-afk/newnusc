/**
 * Capacitor / installed-app helpers:
 * - denser UI class
 * - encourage notification permission (uses existing push.js flow)
 */

function isNativeShell() {
  try {
    if (window.Capacitor?.isNativePlatform?.()) return true;
  } catch {
    /* ignore */
  }
  const ua = navigator.userAgent || '';
  if (/; wv\)|Capacitor/i.test(ua)) return true;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function applyNativeAppClass() {
  if (typeof document === 'undefined') return false;
  const native = isNativeShell();
  document.documentElement.classList.add('nusc-compact');
  if (native) document.documentElement.classList.add('nusc-native-app');
  return native;
}

/** Call after login when you have user id — soft banner only, no auto prompt */
export async function ensureNativePushReady(userId) {
  if (!userId) return;
  try {
    const { pushSupported, notificationPermission, initPushNotifications } = await import(
      './push.js'
    );
    if (!pushSupported()) return;
    if (notificationPermission() === 'granted') {
      await initPushNotifications(userId, { requestPermission: false, welcome: false });
    }
  } catch (err) {
    console.warn('[NUSC] native push ready:', err?.message || err);
  }
}

applyNativeAppClass();
