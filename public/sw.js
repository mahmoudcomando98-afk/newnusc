/* COMANDO Service Worker — push + installability + شبكة ثابتة على الموبايل */
const ICON_PATH = '/nusc.png.jpeg';
const SW_VERSION = 'comando-sw-v5';
const RUNTIME_CACHE = 'comando-runtime-v5';

function iconUrl() {
  try {
    return new URL(ICON_PATH, self.location.origin).href;
  } catch {
    return ICON_PATH;
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

/* زر «تحديث التطبيق» بيبعت إشارة عشان النسخة المستنية تتفعل فورًا */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      /* نمسح أي كاش قديم من نسخ سابقة عشان ميتلخبطش كاش قديم مع جديد */
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== RUNTIME_CACHE).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

/* ملفات البناء المهدومة (hashed) — أولوية الكاش: ثابتة المحتوى واسم الملف بيتبدل مع كل نسخة */
const HASHED_ASSET = /\/assets\/.+-[A-Za-z0-9_-]{8}\.(?:js|css|woff2?|png|jpe?g|svg|webp|ico)$/i;

async function cacheFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

async function networkFirst(req, { cachePage = false } = {}) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok && cachePage) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    if (req.mode === 'navigate') {
      return new Response(
        '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>COMANDO</title></head><body style="font-family:sans-serif;text-align:center;padding:40px"><h1>لا يوجد اتصال</h1><p>اتأكد من الشبكة ثم أعد المحاولة.</p></body></html>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

/* بدل الـ 503 الفاضي على أي هزّة في النت: كاش احتياطي يخلي المنصة تشتغل وتجيب بيانات المستخدم دايمًا */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  /* غير GET (تسجيل دخول، تحديث بيانات...) يعدّي عادي */
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  /* طلبات خارجية (Supabase, fonts...) تعدّي عادي */
  if (url.origin !== self.location.origin) return;

  /* صفحات HTML (navigate) — دائمًا من الشبكة أولاً عشان الموبايل ما يظهِرش نسخة قديمة */
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cache = await caches.open(RUNTIME_CACHE);
          const hit = await cache.match(req);
          if (hit) return hit;
          return new Response(
            '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>COMANDO</title></head><body style="font-family:sans-serif;text-align:center;padding:40px"><h1>لا يوجد اتصال</h1><p>اتأكد من الشبكة ثم أعد المحاولة.</p></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })()
    );
    return;
  }

  /* ملفات JS/CSS — جرب الشبكة أولاً، لو مش فيه نت استخدم الكاش المخزن */
  if (HASHED_ASSET.test(url.pathname) || url.pathname.startsWith('/assets/js/') || url.pathname.startsWith('/assets/css/')) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cache = await caches.open(RUNTIME_CACHE);
          const hit = await cache.match(req);
          if (hit) return hit;
          return new Response('', { status: 503, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  event.respondWith(networkFirst(req, { cachePage: false }));
});

self.addEventListener('push', (event) => {
  const icon = iconUrl();
  let data = {
    title: 'COMANDO',
    body: 'لديك إشعار جديد من المنصة',
    url: '/notifications.html',
    tag: 'comando-push',
    icon,
    badge: icon
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    try {
      const text = event.data && event.data.text();
      if (text) data.body = text;
    } catch {
      /* ignore */
    }
  }

  const title = String(data.title || 'COMANDO').slice(0, 120);
  const options = {
    body: String(data.body || '').slice(0, 500),
    icon,
    badge: icon,
    data: { url: data.url || '/notifications.html' },
    tag: data.tag || 'comando-push',
    renotify: true,
    dir: 'rtl',
    lang: 'ar',
    vibrate: [160, 80, 160],
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(title, options).catch((err) => {
      console.error('[COMANDO SW]', SW_VERSION, 'showNotification failed', err);
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || '/notifications.html';
  let absolute;
  try {
    absolute = new URL(target, self.location.origin).href;
  } catch {
    absolute = self.location.origin + '/notifications.html';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          if ('navigate' in client) {
            try {
              client.navigate(absolute);
            } catch {
              /* ignore */
            }
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(absolute);
    })
  );
});
