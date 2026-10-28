/* NUSC Service Worker — system notification tray */
const ICON = '/nusc.png.jpeg';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {
    title: 'NUSC',
    body: 'لديك إشعار جديد من المنصة',
    url: '/notifications.html',
    tag: 'nusc-push'
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

  const title = String(data.title || 'NUSC').slice(0, 120);
  const options = {
    body: String(data.body || '').slice(0, 500),
    icon: data.icon || ICON,
    badge: data.badge || ICON,
    image: data.image || undefined,
    data: { url: data.url || '/notifications.html' },
    tag: data.tag || 'nusc-push',
    renotify: true,
    dir: 'rtl',
    lang: 'ar',
    vibrate: [120, 60, 120],
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(title, options).catch((err) => {
      console.error('[NUSC SW] showNotification failed', err);
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
