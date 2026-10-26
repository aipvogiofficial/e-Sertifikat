/* Service worker e-Serti AIPVOGI
 * Naikkan VERSI setiap kali file aplikasi diubah agar perangkat admin memuat versi baru. */
const VERSI = 'eserti-v1.4.0';
const FILE = [
  './', 'index.html', 'cek.html', 'manifest.webmanifest',
  'css/style.css', 'css/cek.css',
  'js/config.js', 'js/render.js', 'js/demo-api.js', 'js/app.js', 'js/cek.js',
  'vendor/jspdf.umd.min.js', 'vendor/qrcode.js', 'vendor/xlsx.mini.min.js', 'vendor/jszip.min.js',
  'vendor/fonts/arimo-latin-400-normal.woff2', 'vendor/fonts/arimo-latin-700-normal.woff2',
  'assets/template.jpg', 'assets/judul-sertifikat.png', 'assets/logo.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSI).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSI).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API Apps Script langsung ke jaringan
  // jaringan dulu untuk halaman & kode (agar update cepat), cache untuk aset
  const kode = e.request.mode === 'navigate' || /\.(js|css|html|webmanifest)$/.test(url.pathname);
  if (kode) {
    e.respondWith(fetch(e.request).then(r => {
      const salin = r.clone(); caches.open(VERSI).then(c => c.put(e.request, salin)); return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  } else {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
