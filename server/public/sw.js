/* PROMAR Helpdesk — Service Worker
   Web push bildirişlərini göstərir (brauzer/tab bağlı olanda da) */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Sadə cache: şəbəkə yoxdursa son çalışan resursu qaytarırıq
// (şəbəkə əvvəli sınanır — yenilənmə həmən görünür)
const CACHE = 'promar-v1';
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // yalnız öz resurslarımız
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(async () => {
        const cached = (await caches.match(req)) || (await caches.match('/index.html'));
        // respondWith heç vaxt undefined qəbul etmir — Response yoxdursa
        if (cached) return cached;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
  );
});

// Server-dən push gələndə
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'PROMAR', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'PROMAR Helpdesk';
  const options = {
    body: data.body || '',
    icon: '/favicon-192.png',
    badge: '/favicon-192.png',
    tag: data.tag || 'promar',
    renotify: true,
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Bildirişə toxunanda proqramı aç
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.focus();
          if (client.url.includes('/problemler')) return;
          // yeni səhifə aç
          return self.clients.openWindow(url);
        }
      }
      return self.clients.openWindow(url);
    })
  );
});