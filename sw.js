const CACHE_NAME = 'mm-ut-studyapp-v2';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './catalog.json',
  './mobile-patch.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './vendor/mathjax/tex-svg.js',
  './vendor/chartjs/chart.umd.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(CORE_ASSETS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for app shell/code & HTML (always get fresh when online,
// fall back to cache when offline). Cache-first for heavy static assets.
function isCodeOrContent(url) {
  return /\.(html|js|json|css)$/i.test(url.pathname) ||
         url.pathname.endsWith('/') ||
         url.pathname === '' ;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;

  if (isCodeOrContent(url)) {
    // Network-first
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((c) => c || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for images, fonts, vendor libs, etc.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
