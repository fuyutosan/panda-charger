// パンダさんパワー充電器 — オフライン対応サービスワーカー
// v2: index.html はネットワーク優先（更新が即届く）、失敗時だけキャッシュ
const CACHE = 'pp-charger-v29';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './budoux-ja.min.js',
  './profile-share.js',
  './cloud-sync.js',
  './icon-maskable-512.png'
];
// 通信が切れても、初めて引くカードや図鑑・プロフィールの絵を表示する。
const CARD_ASSETS = [['n',12],['r',12],['s',4],['u',2]].flatMap(([prefix,count])=>
  Array.from({length:count},(_,i)=>'./cards/'+prefix+String(i+1).padStart(2,'0')+'.webp'));

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll([...ASSETS,...CARD_ASSETS])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // 累計パワーAPIなど外部はそのままネットワークへ
  if (url.origin !== self.location.origin) return;

  const isPage = e.request.mode === 'navigate' || url.pathname.endsWith('/index.html');
  if (isPage) {
    // ページ本体はネットワーク優先：更新したらすぐ届く。オフライン時はキャッシュ
    e.respondWith(
      fetch(e.request)
        .then(async (res) => {
          if(!res.ok) return (await caches.match(e.request)) || (await caches.match('./index.html')) || res;
          const copy = res.clone();
          try { await caches.open(CACHE).then((c) => c.put(e.request, copy)); }
          catch (_) { /* 保存領域が足りなくても、取得できた画面は返す。 */ }
          return res;
        })
        .catch(() => caches.match(e.request).then((m) => m || caches.match('./index.html')))
    );
  } else {
    // アイコン等はキャッシュ優先
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request))
    );
  }
});
