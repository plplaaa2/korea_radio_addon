// Cache only public install assets. Related: Dockerfile, index.js, manifest.json.
const CACHE_NAME = 'radioha-pwa-v5';
const ASSETS = [
  './manifest.json',
  './icon.png'
];

// 서비스 워커 설치 시 즉시 대기 상태 해제
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// 활성화 시 구버전 캐시 자동 세정 및 즉시 제어권 확보
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache.startsWith('radioha-pwa-') && cache !== CACHE_NAME) {
            console.log('[ServiceWorker] 구형 캐시 삭제 중:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' ||
      !ASSETS.some(asset => new URL(asset, self.registration.scope).href === event.request.url)) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => cache.match(event.request)).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
