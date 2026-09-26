const CACHE_NAME = 'topik-study-v3';
const CORE_FILES = [
  '/', '/index.html', '/manifest.webmanifest', '/app-icon-192.png',
  '/app-icon-512.png', '/apple-touch-icon.png', '/cafe-scene.png',
  '/vocab.js', '/vocab-extra.js', '/vocab-level2.js',
  '/roadmap-questions.js', '/site-footer.js', '/learning-storage.js', '/topik1-vocabulary.html',
  '/topik1-practice.html', '/topik1-grammar.html', '/topik1-reading.html',
  '/topik1-listening.html', '/topik-guide.html'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(async () => (await caches.match(event.request)) || caches.match('/index.html')));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)
    .then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    })));
});
