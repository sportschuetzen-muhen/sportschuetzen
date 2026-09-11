const CACHE_NAME = 'sportschuetzen-cache-v1';

const STATIC_ASSETS = [
    './',
    './index.html',
    './verein.html',
    './resultate.html',
    './schuetzenhaus_vermietung.html',
    './datenschutz.html',
    './css/style.css',
    './js/components.js',
    './js/main.js',
    './js/resultate.js',
    './assets/logo.png',
    './assets/fonts/inter-latin-400-normal.woff2',
    './assets/fonts/inter-latin-600-normal.woff2',
    './assets/fonts/inter-latin-800-normal.woff2',
    './assets/fonts/outfit-latin-400-normal.woff2',
    './assets/fonts/outfit-latin-700-normal.woff2',
    './manifest.webmanifest'
];

// Install: Statische Kern-Assets cachen
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Activate: Veraltete Caches bereinigen
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch: Stale-While-Revalidate / Network-First Strategie
self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // Nur GET-Requests cachen
    if (req.method !== 'GET') return;

    // Statische Assets (CSS, JS, Fonts, Bilder) -> Cache-First mit Revalidate
    if (
        url.pathname.includes('/css/') ||
        url.pathname.includes('/assets/') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.woff2') ||
        url.pathname.endsWith('.png') ||
        url.pathname.endsWith('.jpg')
    ) {
        event.respondWith(
            caches.match(req).then((cached) => {
                const fetchPromise = fetch(req).then((networkRes) => {
                    if (networkRes.ok) {
                        const clone = networkRes.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
                    }
                    return networkRes;
                }).catch(() => cached);

                return cached || fetchPromise;
            })
        );
        return;
    }

    // HTML-Seiten & dynamische Daten (Termine, Resultate, Berichte) -> Network-First mit Offline-Fallback
    event.respondWith(
        fetch(req).then((networkRes) => {
            if (networkRes.ok) {
                const clone = networkRes.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
            return networkRes;
        }).catch(() => {
            return caches.match(req).then((cached) => {
                if (cached) return cached;
                // Fallback für HTML
                if (req.headers.get('accept') && req.headers.get('accept').includes('text/html')) {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
