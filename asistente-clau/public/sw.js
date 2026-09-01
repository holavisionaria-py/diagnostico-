/* Cachea el armazón de la app para que abra al toque, incluso sin señal.
   Los datos del correo siempre van a la red: nunca se guardan acá. */
const CACHE = 'clau-v1';
const ARMAZON = ['/', '/index.html', '/styles.css', '/app.js', '/icon.svg', '/icon.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARMAZON)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // Nada de la API se cachea: siempre red.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/auth')) return;

  e.respondWith(
    caches.match(e.request).then((hit) => {
      const red = fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => hit ?? caches.match('/index.html'));
      return hit ?? red;
    })
  );
});
