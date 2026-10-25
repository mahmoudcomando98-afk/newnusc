/**
 * NUSC Web Push — request permission, register SW, save subscription.
 */

import { supabase } from './supabase.js';

const VAPID_PUBLIC =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    (import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim()) ||
  // Default project key (replace via VITE_VAPID_PUBLIC_KEY in production)
  'BPMz4yfOTRot0gDUO_0USJVuqzKYhlY7OWcpvproCs1BlfWpwBNCO-ugCrhLdRJXRcDoFGF-Qi9Y7ItaMlaK9xQ';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

async function ensureServiceWorker() {
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  return reg;
}

async function saveSubscription(subscription, userId) {
  if (!subscription || !userId) return;
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh || '';
  const auth = json.keys?.auth || '';

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'endpoint' }
  );

  if (error) console.warn('[NUSC push] save subscription:', error.message);
}

/**
 * Ask for notification permission once, register SW, store push subscription.
 * Safe to call on every protected page — only prompts when permission is default.
 */
export async function initPushNotifications(userId) {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };

  try {
    const reg = await ensureServiceWorker();

    let permission = Notification.permission;
    if (permission === 'default') {
      // Browser shows the native prompt
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      return { ok: false, reason: 'denied' };
    }

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
      });
    }

    if (userId) await saveSubscription(sub, userId);

    return { ok: true, subscription: sub };
  } catch (err) {
    console.warn('[NUSC push] init failed:', err);
    return { ok: false, reason: String(err?.message || err) };
  }
}

/** Show a local notification (when tab is open / after permission). */
export async function showLocalNotification(title, options = {}) {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body: options.body || '',
      icon: options.icon || '/favicon.ico',
      data: { url: options.url || '/notifications.html' },
      dir: 'rtl',
      lang: 'ar',
      tag: options.tag || 'nusc-local'
    });
  } catch (err) {
    console.warn('[NUSC push] local notification:', err);
  }
}

/** Admin / server helper: ask edge function to fan-out push. */
export async function sendPushToAll({ title, body, url = '/notifications.html' }) {
  try {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: { title, body, url }
    });
    if (error) {
      console.warn('[NUSC push] send-push:', error.message || error);
      return { ok: false, error };
    }
    return { ok: true, data };
  } catch (err) {
    console.warn('[NUSC push] send-push invoke failed:', err);
    return { ok: false, error: err };
  }
}
