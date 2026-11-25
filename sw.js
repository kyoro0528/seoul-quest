const CACHE_NAME = 'topik-study-v108';
const CORE_FILES = [
  '/korean-phrase-cards', '/korean-phrase-cards.js?v=36', '/korean-phrase-cards.css?v=37', '/travel-phrase-search.js?v=36', '/travel-replies.js?v=34', '/travel-destinations.js?v=33',
  '/travel-layout.css?v=1',
  '/korea-travel-preparation', '/travel-preparation.js',
  '/seoul-subway-guide', '/seoul-subway-guide.css?v=1', '/seoul-subway-guide.js',
  '/', '/index.html', '/seoul-map.js', '/seoul-map-background.svg', '/home-navigation.css?v=41', '/homepage-seo.css?v=1', '/seo-reference.css?v=1', '/manifest.webmanifest', '/favicon.svg', '/seoul-skyline.svg', '/seoul-skyline-hero.svg', '/mascot-hoya.svg', '/mascot-hoya-cheer.svg', '/app-icon-192.png',
  '/app-icon-512.png', '/apple-touch-icon.png', '/cafe-scene.png',
  '/vocab.js', '/vocab-extra.js', '/vocab-level2.js',
  '/study-explanations.js', '/roadmap-questions.js', '/mock-exam.js?v=42', '/result-viz.css?v=5', '/result-viz.js?v=2', '/exam-pdf.js', '/site-footer.js?v=77', '/back-to-top.js?v=1', '/learning-storage.js', '/learning-bootstrap.js', '/topik1-vocabulary',
  '/topik1-solving-tips', '/topik1-practice', '/topik1-grammar', '/topik1-reading',
  '/topik1-listening', '/topik-guide', '/topik1-exam-results', '/exam-results.js?v=2', '/study-guides.css?v=3', '/next-learning.css?v=1', '/topik-schedule-2027', '/speaking-practice', '/speaking-phrases.js?v=1', '/speaking-practice.js?v=2', '/speaking-practice.css?v=2',
  '/dictation', '/dictation-items.js?v=1', '/dictation.js?v=1', '/dictation.css?v=2',
  '/study-plan', '/study-plan.js?v=1', '/study-plan.css?v=2', '/home-design.css?v=2', '/design-system.css?v=1'
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
