/* Guarda el armazón de la app para que abra sin señal, pero SIEMPRE prioriza
   la versión de la red: así los cambios que subimos se ven en cuanto recarga,
   sin quedar pegada a una copia vieja. La copia sólo entra a jugar si no hay
   internet. Los datos del correo nunca se cachean. */
const CACHE = 'clau-v2';
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

  // La API y el login siempre van directo a la red, nunca se cachean.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/auth')) return;

  // Red primero: si responde, esa es la versión que se ve y se guarda de respaldo.
  // Si no hay internet, recién ahí usamos la copia guardada.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit ?? caches.match('/index.html')))
  );
});
