// Epzshock — service worker: la app funciona sin conexión.
const CACHE = 'epzshock-v12';
const ARCHIVOS = ['./', 'index.html', 'app.css', 'tema.js', 'biblioteca.js', 'app.js', 'asistente.js', 'dieta.js', 'retos.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'config.js', 'vendor/supabase-2.119.1.js', 'nube.js', 'cliente.js', 'portal.js', 'privacidad.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(claves => Promise.all(claves.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Red primero (para recibir mejoras), caché si no hay conexión.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
