// УсЗасвар Service Worker
// Handles background notifications, push events, and offline caching

const CACHE_NAME = 'uszasvar-v1';

// Install
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus existing window
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // Open new window if none exist
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

// Handle push events (for future backend push support)
self.addEventListener('push', (event) => {
  let data = { title: 'УсЗасвар', body: 'Шинэ мэдэгдэл!' };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) { /* silent */ }
  
  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'uszasvar',
    requireInteraction: true,
    data: data.data || {},
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Background sync for offline support (future)
self.addEventListener('sync', (event) => {
  // Handle background sync if needed
});

// Periodic background fetch (where supported - Chrome only)
self.addEventListener('periodicsync', (event) => {
  // Could poll for new bookings here
});
