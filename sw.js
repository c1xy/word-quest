/* 单词大冒险 · Service Worker（网络优先，离线回落缓存） */
'use strict';
var CACHE = 'wq-cache-v26';

/* ── 发布更新清单（缺一不可，否则回访用户首次刷新可能新旧混版）──────────
   1) bump 上面的 CACHE 版本号（v15 → v16 …）：旧 SW 缓存整体作废重建；
   2) bump index.html 里静态资源的 ?v= 参数（style.css / words.js / game.js）：
      URL 变了，HTTP 缓存与 CDN（GitHub Pages 有 10 分钟 max-age）都不会再吐旧文件，
      同时覆盖无 Service Worker 的部署形态（局域网 http，见 deploy.md 方式三）。
   在线新鲜度由下方 fetch 的 no-cache 再验证保证；离线可用性由 install 预缓存保证。 */

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      var urls = ['./', './index.html', './style.css', './words.js', './game.js', './libs/qrcode.min.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
      /* 预缓存逐项容错：单项 404/瞬断只跳过该项（离线回落兜底），不再 all-or-nothing
         阻断 install —— 否则新 SW 永不 skipWaiting/接管，版本更新静默停摆。
         预缓存也强制再验证：install 里发起的 fetch 不经过本 SW 的 fetch 处理器，
         若走默认缓存模式，会把 HTTP 缓存里启发式新鲜的旧文件直接存进新版本缓存 */
      return Promise.all(urls.map(function (u) {
        return fetch(new Request(u, { cache: 'no-cache' })).then(function (r) {
          if (!r || !r.ok) return null;
          return c.put(u, r);
        }).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
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

/* 网络优先：在线时总是拿最新文件（离线时回落缓存）。
   关键：SW 内 fetch(request) 若原样透传，请求继承 HTTP 缓存的 'default' 模式——
   条目在启发式新鲜期内（Last-Modified 越旧窗口越长，本地 python -m http.server 只发
   Last-Modified 不发 Cache-Control，正中此洞）会绕过网络直接回旧文件，造成
   「更新后首次加载 HTML/JS 新、CSS 旧」的混版渲染。这里把同源 GET 一律改写为
   cache:'no-cache' 强制向服务器再验证（服务器有 Last-Modified/If-Modified-Since 时
   未变更的文件走 304，不增加流量）；页面自带的 reload/no-store 等绕缓存模式保持原样。 */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(revalidate(e.request));
});

function revalidate(req) {
  var fetchReq = req;
  try {
    if (new URL(req.url).origin === location.origin && req.cache === 'default') {
      fetchReq = (req.mode === 'navigate')
        ? new Request(req.url, { cache: 'no-cache' })     /* 导航请求不可克隆改写，按 URL 重建 */
        : new Request(req, { cache: 'no-cache' });        /* 子资源：继承原请求，仅改缓存模式 */
    }
  } catch (err) { fetchReq = req; }                       /* 老浏览器不支持改写时退回原行为 */
  return fetch(fetchReq).then(function (resp) {
    if (resp && resp.ok && new URL(req.url).origin === location.origin) {
      var cp = resp.clone();
      caches.open(CACHE).then(function (c) { c.put(req, cp); });
    }
    return resp;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      /* 只允许「导航请求」回落 index.html：子资源（game.js/style.css/图片）失败也回
         HTML 会造成「HTML 当 JS/CSS」——轻则死页重则渲染崩坏。子资源直接返回网络
         错误，让浏览器走自己的失败处理。 */
      if (req.mode === 'navigate') return caches.match('./index.html');
      return new Response('Word Quest: offline and not in cache', { status: 504, statusText: 'Gateway Timeout' });
    });
  });
}
