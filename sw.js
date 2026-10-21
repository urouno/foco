// Foco: funciona sin conexión. Cambia la versión cuando subas cambios para forzar la actualización.
const CACHE = 'foco-v4';
const ARCHIVOS = ['./', './index.html', './manifest.json', './icon-180.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // Google Apps Script y demás: siempre a la red

  // Primero la red (para recibir actualizaciones); si no hay internet, la copia guardada.
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r.ok && !url.search) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch:true }).then(r => r || caches.match('./index.html')))
  );
});
