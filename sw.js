// STAFF PRO — Service Worker v1.0
// Notifications lock screen pour sortie territoire + chat

self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(clients.claim()); });

// Recevoir un message de l'app → afficher notification lock screen
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

  event.waitUntil(
    self.registration.showNotification(d.title || 'STAFF PRO', options)
  );
});

// Clic sur notification → ouvrir/focus l'app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action || 'default';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Si l'app est déjà ouverte → focus + envoyer action
      for(const client of list) {
        if(client.url.includes('employe.html')) {
          client.focus();
          client.postMessage({ type: 'NOTIF_CLICK', action: data.action, payload: data });
          return;
        }
      }
      // Sinon ouvrir l'app
      return clients.openWindow('/staff-pro/employe.html');
    })
  );
});
