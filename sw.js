/* 单词大冒险 · Service Worker（网络优先，离线回落缓存） */
'use strict';
var CACHE = 'wq-cache-v12';

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(['./', './index.html', './style.css', './words.js', './game.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png']); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* 网络优先：在线时总是拿最新文件（更新无需手动升版本号）；断网时回落缓存 */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(function (resp) {
      if (resp && resp.ok && new URL(e.request.url).origin === location.origin) {
        var cp = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, cp); });
      }
      return resp;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
