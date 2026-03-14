/**
 * Service Worker — Fred VTC PWA
 * Stratégie : Cache First pour les assets statiques, Network First pour les API
 */

const CACHE_NAME    = 'fred-vtc-v1';
const CACHE_OFFLINE = 'fred-vtc-offline-v1';

// Assets à mettre en cache immédiatement à l'installation
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  // Fonts Google (elles seront cachées à la première visite)
];

// URLs qui ne doivent JAMAIS être cachées (APIs dynamiques)
const NEVER_CACHE = [
  'api-adresse.data.gouv.fr',
  'router.project-osrm.org',
];

// ── INSTALLATION ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()) // Active immédiatement le nouveau SW
  );
});

// ── ACTIVATION ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== CACHE_OFFLINE)
          .map(key => caches.delete(key)) // Purge les anciens caches
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne jamais intercepter les appels API/fonctions
  if (NEVER_CACHE.some(u => request.url.includes(u))) {
    return; // Laisse passer sans interception
  }

  // Ne gérer que GET
  if (request.method !== 'GET') return;

  // Tuiles cartographiques : cache agressif (elles changent rarement)
  if (url.hostname.includes('cartocdn.com') || url.hostname.includes('tile.openstreetmap')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      })
    );
    return;
  }

  // Fonts Google : cache first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      })
    );
    return;
  }

  // Leaflet CDN
  if (url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      })
    );
    return;
  }

  // App shell (index.html + assets locaux) : Network First avec fallback cache
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        // Offline : retourner depuis le cache
        const cached = await caches.match(request);
        if (cached) return cached;
        // Fallback ultime : page principale
        return caches.match('/index.html');
      })
  );
});

// ── MESSAGE : forcer la mise à jour ──
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
