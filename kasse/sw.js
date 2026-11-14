/**
 * sw.js - Service Worker für die Festkasse Sportschützen Muhen
 * Garantiert 100% Offline-Verfügbarkeit auf iPads & iPhones im Festzelt
 * WebKit / Safari Härtung: Verhindert "response served by service worker has redirections"
 */

const CACHE_NAME = 'festkasse-v19';
const ASSETS_TO_CACHE = [
  './index.html',
  './kasse.css',
  './kasse.js',
  './epos-print.js',
  './qrcode.min.js',
  './db.js',
  './abschluss.js',
  './kellner.js',
  './manifest.json',
  '../apple-touch-icon.png'
];

// Hilfsfunktion: Bereinigt Responses von WebKit Redirect-Metadaten
function cleanResponse(response) {
  if (!response) return response;
  if (!response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[ServiceWorker] Assets werden gecacht für Offline-Betrieb...');
      for (const asset of ASSETS_TO_CACHE) {
        try {
          const response = await fetch(asset);
          if (response.ok) {
            // WebKit Safari Schutz: Niemals redirected Responses im Cache ablegen
            const clean = response.redirected
              ? new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers })
              : response;
            await cache.put(asset, clean);
          }
        } catch (err) {
          console.warn('[ServiceWorker] Konnte Asset nicht cachen:', asset, err);
        }
      }
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
  if (event.request.method !== 'GET') return;

  // 1. Navigation Request (PWA-Start vom Homescreen, Adressleiste, Seitenaufruf)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Zuerst im Cache nach index.html suchen (Offline-First)
          const cached = await caches.match('./index.html') || await caches.match('index.html');
          if (cached) {
            // Safari WebKit Fix: Neues sauberes Response-Objekt zurückgeben
            return new Response(cached.body, {
              status: cached.status,
              statusText: cached.statusText,
              headers: cached.headers
            });
          }

          // Wenn noch nicht im Cache, aus dem Netzwerk holen
          const network = await fetch(event.request);
          if (network.redirected) {
            return new Response(network.body, {
              status: network.status,
              statusText: network.statusText,
              headers: network.headers
            });
          }
          return network;
        } catch (err) {
          const fallback = await caches.match('./index.html') || await caches.match('index.html');
          if (fallback) {
            return new Response(fallback.body, {
              status: fallback.status,
              statusText: fallback.statusText,
              headers: fallback.headers
            });
          }
          throw err;
        }
      })()
    );
    return;
  }

  // 2. Statische Assets (CSS, JS, Fonts, Icons)
  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);
      if (cached) {
        // Im Hintergrund aktualisieren (stale-while-revalidate), aber nur ohne Redirect
        fetch(event.request).then(async (net) => {
          if (net && net.status === 200 && !net.redirected) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(event.request, net);
          }
        }).catch(() => {});

        return cleanResponse(cached);
      }

      try {
        const network = await fetch(event.request);
        if (network && network.status === 200 && network.type === 'basic') {
          const cache = await caches.open(CACHE_NAME);
          const toCache = network.redirected
            ? new Response(network.clone().body, { status: network.status, statusText: network.statusText, headers: network.headers })
            : network.clone();
          cache.put(event.request, toCache);
        }
        return cleanResponse(network);
      } catch (err) {
        throw err;
      }
    })()
  );
});
