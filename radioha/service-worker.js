const CACHE_NAME = 'radioha-pwa-v1';
const ASSETS = [
  './',
  './manifest.json',
  './icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // 스트리밍 API나 플레이어 동작 요청 등은 캐싱에서 완전 배제
  if (event.request.url.includes('/radio') || 
      event.request.url.includes('/play_on_player') || 
      event.request.url.includes('/media_action') || 
      event.request.url.includes('/set_volume') || 
      event.request.url.includes('/mute_volume')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
