const CACHE_NAME = 'topik-study-v88';
const CORE_FILES = [
  '/korean-phrase-cards', '/korean-phrase-cards.js?v=36', '/korean-phrase-cards.css?v=36', '/travel-phrase-search.js?v=36', '/travel-replies.js?v=34', '/travel-destinations.js?v=33',
  '/travel-layout.css',
  '/korea-travel-preparation', '/travel-preparation.js',
  '/seoul-subway-guide', '/seoul-subway-guide.css', '/seoul-subway-guide.js',
  '/', '/index.html', '/seoul-map.js', '/seoul-map-background.svg', '/home-navigation.css?v=40', '/homepage-seo.css', '/seo-reference.css', '/manifest.webmanifest', '/favicon.svg', '/seoul-skyline.svg', '/seoul-skyline-hero.svg', '/mascot-hoya.svg', '/mascot-hoya-cheer.svg', '/app-icon-192.png',
  '/app-icon-512.png', '/apple-touch-icon.png', '/cafe-scene.png',
  '/vocab.js', '/vocab-extra.js', '/vocab-level2.js',
  '/study-explanations.js', '/roadmap-questions.js', '/mock-exam.js?v=41', '/result-viz.css?v=4', '/result-viz.js?v=2', '/exam-pdf.js', '/site-footer.js?v=77', '/back-to-top.js?v=1', '/learning-storage.js', '/learning-bootstrap.js', '/topik1-vocabulary',
  '/topik1-solving-tips', '/topik1-practice', '/topik1-grammar', '/topik1-reading',
  '/topik1-listening', '/topik-guide', '/topik1-exam-results', '/exam-results.js?v=1', '/study-guides.css', '/topik-schedule-2027'
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
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.endsWith('.mp4') || url.pathname.endsWith('.webm') || event.request.destination === 'video') return;
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
