/**
 * sw.js - Service Worker für die Festkasse Sportschützen Muhen
 * Garantiert 100% Offline-Verfügbarkeit auf iPads & iPhones im Festzelt
 */

const CACHE_NAME = 'festkasse-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './kasse.css',
  './kasse.js',
  './db.js',
  './schichtplan.js',
  './abschluss.js',
  './kellner.js',
  './manifest.json',
  '../apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Assets werden gecacht für Offline-Betrieb...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Altes Cache gelöscht:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Navigation & Static Assets: Cache first, fall back to network
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Im Hintergrund aktualisieren (stale-while-revalidate für lokale Dateien)
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            }
          })
          .catch(() => {/* Offline, ignorieren */});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Fallback wenn komplett offline und Ressource nicht im Cache
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
