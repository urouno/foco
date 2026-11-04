// Foco: funciona sin conexión. Cambia la versión cuando subas cambios para forzar la actualización.
const PREFIJO = 'foco-';
const CACHE = PREFIJO + 'v10';
const ARCHIVOS = ['./', './index.html', './manifest.json', './icon-180.png', './icon-512.png', './icon-maskable-512.png'];
const ESPERA_RED = 3500; // con red lenta, después de esto se usa la copia guardada

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

// Solo se limpian las cachés antiguas de Foco; las de otras apps del mismo dominio no se tocan.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIJO) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function guardar(req, r) {
  if (r && r.ok && !new URL(req.url).search) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
  return r;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Google Apps Script y demás: siempre a la red

  // Documento: primero la red para recibir actualizaciones, pero sin esperar indefinidamente.
  if (req.mode === 'navigate') {
    e.respondWith(new Promise(resolve => {
      let listo = false;
      const usarCopia = () => caches.match(req, { ignoreSearch:true })
        .then(r => r || caches.match('./index.html'))
        .then(r => { if (!listo && r) { listo = true; resolve(r); } return r; });
      const t = setTimeout(usarCopia, ESPERA_RED);
      fetch(req)
        .then(r => { clearTimeout(t); guardar(req, r); if (!listo) { listo = true; resolve(r); } })
        .catch(() => { clearTimeout(t); usarCopia().then(r => { if (!listo) { listo = true; resolve(r || Response.error()); } }); });
    }));
    return;
  }

  // Recursos (iconos, manifiesto): la copia guardada al instante y se actualiza en segundo plano.
  e.respondWith(
    caches.match(req, { ignoreSearch:true }).then(copia => {
      const red = fetch(req).then(r => guardar(req, r)).catch(() => copia);
      return copia || red;
    })
  );
});
