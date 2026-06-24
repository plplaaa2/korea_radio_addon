const CACHE_NAME = 'radioha-pwa-v3';
const ASSETS = [
  './',
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
          if (cache !== CACHE_NAME) {
            console.log('[ServiceWorker] 구형 캐시 삭제 중:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // 스트리밍 API, 재생 컨트롤 및 상태 조회 API는 캐싱에서 완전 배제
  if (event.request.url.includes('/radio') || 
      event.request.url.includes('/play_on_player') || 
      event.request.url.includes('/media_action') || 
      event.request.url.includes('/set_volume') || 
      event.request.url.includes('/mute_volume') ||
      event.request.url.includes('/get_players') ||
      event.request.url.includes('/get_radio_list')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
