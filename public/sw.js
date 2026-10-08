// (8 Okt 2026) Service worker PWA SIGAP -- permintaan user ("lanjut PWA dulu").
// Prinsip: TIDAK menyimpan (cache) halaman/data aplikasi, supaya setiap update web (push) langsung
// terlihat oleh petugas dan data tidak basi. Yang disimpan hanya halaman "Tidak ada sinyal" (offline.html)
// beserta ikon, untuk ditampilkan saat HP benar-benar tidak terhubung internet.
// Bila nanti perlu mode offline penuh (isi tanpa sinyal), dikembangkan di berkas ini.

const VERSI = "sigap-v1";
const BERKAS_OFFLINE = ["/offline.html", "/ikon/ikon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSI).then((c) => c.addAll(BERKAS_OFFLINE)));
  self.skipWaiting(); // versi baru service worker langsung aktif
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((kunci) => Promise.all(kunci.filter((k) => k !== VERSI).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // Hanya navigasi halaman (buka/pindah halaman) yang ditangani; API, gambar, unggah foto dll dibiarkan
  // langsung ke jaringan seperti web biasa.
  if (req.method !== "GET" || req.mode !== "navigate") return;
  e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
});
