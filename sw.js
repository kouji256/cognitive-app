// オフライン対応: アプリ本体(HTML/JS/CSS)だけを端末に保存する。記録の送信(POST)や Google への通信は一切触らない。
// 更新したら CACHE の名前を変える(古い版が残り続けるのを防ぐ)
const CACHE = 'cogapp-v2';
const SHELL = [
  './', './index.html', './style.css', './manifest.webmanifest',
  './js/main.js', './js/ui.js', './js/store.js', './js/forms.js', './js/recall.js',
  './js/testcommon.js', './js/tests_span.js', './js/test_rotation.js', './js/geom.js', './js/explain.js', './js/explain_content.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // 他サイト・POSTは素通し
  // ネット優先(つながるなら最新を取り、キャッシュも更新)。つながらなければキャッシュ
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((m) => m || caches.match('./index.html'))));
});
