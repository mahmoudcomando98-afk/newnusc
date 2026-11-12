/**
 * COMANDO Web Push — enable, confirm, save subscription, admin fan-out.
 * Important: never call Notification.requestPermission() except from a user click.
 */

import { supabase } from './supabase.js';

const VAPID_PUBLIC =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    (import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim()) ||
  'BPMz4yfOTRot0gDUO_0USJVuqzKYhlY7OWcpvproCs1BlfWpwBNCO-ugCrhLdRJXRcDoFGF-Qi9Y7ItaMlaK9xQ';

const WELCOME_TITLE = 'تم تفعيل الإشعارات';
const WELCOME_BODY = 'سيتم ارسال الاشعارات المهمه اليك';

function siteIconUrl() {
  try {
    return new URL('/nusc.png.jpeg', window.location.origin).href;
  } catch {
    return '/nusc.png.jpeg';
  }
}

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
    'Notification' in window &&
    (window.isSecureContext === true || location.hostname === 'localhost')
  );
}

export function notificationPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

async function ensureServiceWorker() {
  const reg = await navigator.serviceWorker.register('/sw.js?v=5', { scope: '/' });
  await navigator.serviceWorker.ready;
  return reg;
}

async function saveSubscription(subscription, userId) {
  if (!subscription || !userId) return { ok: false, reason: 'missing' };
  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh || '';
  const auth = json.keys?.auth || '';
  if (!endpoint || !p256dh || !auth) {
    return { ok: false, reason: 'invalid-keys' };
  }

  const row = {
    user_id: userId,
    endpoint,
    p256dh,
    auth,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
    updated_at: new Date().toISOString()
  };

  let { error } = await supabase.from('push_subscriptions').upsert(row, {
    onConflict: 'endpoint'
  });

  if (error) {
    const del = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (!del.error) {
      const ins = await supabase.from('push_subscriptions').insert(row);
      error = ins.error;
    }
  }

  if (error) {
    console.warn('[push] save subscription:', error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

async function getOrCreateSubscription(reg) {
  let sub = await reg.pushManager.getSubscription();
  if (sub) return sub;

  sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
  });
  return sub;
}

export async function showLocalNotification(title, options = {}) {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const icon = options.icon || siteIconUrl();
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body: options.body || '',
      icon,
      badge: icon,
      data: { url: options.url || '/notifications.html' },
      dir: 'rtl',
      lang: 'ar',
      tag: options.tag || 'comando-local',
      renotify: true,
      vibrate: [160, 80, 160]
    });
    return true;
  } catch (err) {
    console.warn('[push] local notification:', err);
    try {
      // eslint-disable-next-line no-new
      new Notification(title, {
        body: options.body || '',
        icon,
        dir: 'rtl',
        lang: 'ar',
        tag: options.tag || 'comando-local'
      });
      return true;
    } catch {
      return false;
    }
  }
}

export async function initPushNotifications(userId, opts = {}) {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (!userId) return { ok: false, reason: 'no-user' };

  const allowPrompt = opts.requestPermission === true;

  try {
    let permission = Notification.permission;

    if (permission === 'default') {
      if (!allowPrompt) {
        return { ok: false, reason: 'needs-gesture' };
      }
      permission = await Notification.requestPermission();
    }

    if (permission !== 'granted') {
      return { ok: false, reason: permission === 'denied' ? 'denied' : 'not-granted' };
    }

    const reg = await ensureServiceWorker();

    let sub;
    try {
      sub = await getOrCreateSubscription(reg);
    } catch (subErr) {
      try {
        const old = await reg.pushManager.getSubscription();
        if (old) await old.unsubscribe();
      } catch {
        /* ignore */
      }
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
      });
    }

    const saved = await saveSubscription(sub, userId);
    if (!saved.ok) return { ok: false, reason: saved.reason || 'save-failed' };

    if (opts.welcome) {
      await showLocalNotification(WELCOME_TITLE, {
        body: WELCOME_BODY,
        url: '/notifications.html',
        tag: 'comando-welcome'
      });
    }

    return { ok: true, subscription: sub };
  } catch (err) {
    console.warn('[push] init failed:', err);
    return { ok: false, reason: String(err?.message || err) };
  }
}

export async function enablePushFromUserGesture(userId) {
  return initPushNotifications(userId, { welcome: true, requestPermission: true });
}

export async function countPushDevices() {
  try {
    const { count, error } = await supabase
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true });
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

async function readFunctionsError(error, data) {
  if (data?.error) return String(data.error);
  if (!error) return 'تعذر إرسال إشعار التليفون';

  // supabase-js v2: body often on error.context
  try {
    const ctx = error.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
      if (body?.message) return String(body.message);
    }
  } catch {
    /* ignore */
  }

  try {
    if (error.context && typeof error.context.text === 'function') {
      const t = await error.context.text();
      const body = JSON.parse(t);
      if (body?.error) return String(body.error);
    }
  } catch {
    /* ignore */
  }

  const msg = String(error.message || error);
  if (/Failed to send|FunctionsHttpError|non-2xx/i.test(msg)) {
    return 'فشل استدعاء send-push. تأكد إن الدالة منشورة على نفس مشروع Supabase ومفاتيح VAPID متضبوطة.';
  }
  if (/Failed to fetch|NetworkError/i.test(msg)) {
    return 'مفيش اتصال بدالة send-push. راجع النشر على Supabase.';
  }
  return msg;
}

export async function sendPushToAll({ title, body, url = '/notifications.html' }) {
  try {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { ok: false, error: 'لازم تسجيل دخول الأدمن' };
    }

    const { data, error } = await supabase.functions.invoke('send-push', {
      body: {
        title: String(title || 'COMANDO').slice(0, 120),
        body: String(body || '').slice(0, 500),
        url: url || '/notifications.html'
      }
    });

    if (error) {
      const msg = await readFunctionsError(error, data);
      console.warn('[push] send-push:', msg, error);
      return { ok: false, error: msg, data };
    }

    if (data?.error) {
      return { ok: false, error: String(data.error), data };
    }

    const sent = data?.sent ?? 0;
    const total = data?.total ?? 0;
    return {
      ok: true,
      sent,
      failed: data?.failed ?? 0,
      total,
      data,
      noDevices: total === 0
    };
  } catch (err) {
    console.warn('[push] send-push invoke failed:', err);
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function notifyStudents(payload) {
  return sendPushToAll(payload || {});
}
