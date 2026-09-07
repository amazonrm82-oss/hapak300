/* eslint-disable no-undef */
/**
 * Service worker: makes the app installable and delivers the reminder pushes.
 *
 * Deliberately no offline caching of unit data — the unit decided offline is
 * not required, and a stale roster or attendance list is worse than none.
 * Only the shell is pre-cached so the app opens and can say it needs a network.
 */

const SHELL = 'hapak-shell-v1';
const SHELL_FILES = ['/manifest.webmanifest', '/emblem.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!SHELL_FILES.includes(url.pathname)) return;
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request)));
});

self.addEventListener('push', (event) => {
  let payload = { title: 'כשירות חפ״ק מח״ט 300', body: '', url: '/schedule' };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/emblem.png',
      badge: '/emblem.png',
      dir: 'rtl',
      lang: 'he',
      tag: payload.tag || undefined,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/schedule';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
