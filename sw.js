// sw.js — Cross-Platform PWA Service Worker for CRIMOTHY: Grand Theft Possum
const CACHE_NAME = 'crimothy-xplat-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/main.js',
  './js/game.js',
  './js/player.js',
  './js/entities.js',
  './js/world.js',
  './js/ui.js',
  './js/audio.js',
  './js/constants.js',
  './js/pool.js',
  './js/network.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
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

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

