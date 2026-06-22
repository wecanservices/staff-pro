// STAFF PRO — Service Worker v1.0
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });

self.addEventListener('message', event => {
  const d = event.data;
  if(!d || d.type !== 'SHOW_NOTIF') return;
  const options = {
    body: d.body || '',
    icon: d.icon || '/staff-pro/logo.svg',
    badge: d.icon || '/staff-pro/logo.svg',
    vibrate: d.vibrate || [300, 100, 300],
    requireInteraction: d.requireInteraction !== false,
    tag: d.tag || 'staffpro-notif',
    renotify: true,
    data: d.data || {},
    silent: false
  };
  if(d.actions) options.actions = d.actions;
  event.waitUntil(self.registration.showNotification(d.title || 'STAFF PRO', options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for(const client of list) {
        if(client.url.includes('employe.html')) {
          client.focus();
          client.postMessage({ type: 'NOTIF_CLICK', action: data.action, payload: data });
          return;
        }
      }
      return clients.openWindow('/staff-pro/employe.html');
    })
  );
});