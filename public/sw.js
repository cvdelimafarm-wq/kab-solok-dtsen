// (8 Okt 2026) Service worker PWA SIGAP -- permintaan user ("lanjut PWA dulu").
// Prinsip: TIDAK menyimpan (cache) halaman/data aplikasi, supaya setiap update web (push) langsung
// terlihat oleh petugas dan data tidak basi. Yang disimpan hanya halaman "Tidak ada sinyal" (offline.html)
// beserta ikon, untuk ditampilkan saat HP benar-benar tidak terhubung internet.
// Bila nanti perlu mode offline penuh (isi tanpa sinyal), dikembangkan di berkas ini.
// (8 Okt 2026) Notifikasi push: event "push" menampilkan notifikasi (juga saat aplikasi ditutup), "notificationclick" membuka
// halaman tujuan. Isi push dikirim server (lib/sigapPush.ts) sebagai JSON { judul, isi, url, tag }.

const VERSI = "sigap-v2";
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

// ---------------------------------------------------------------- notifikasi push
self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch (_) {
    d = { isi: e.data ? e.data.text() : "" };
  }
  const judul = (d && d.judul) || "SIGAP";
  const opsi = {
    body: (d && d.isi) || "Ada pembaruan di SIGAP.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: (d && d.tag) || "sigap",
    renotify: true,
    lang: "id",
    vibrate: [120, 60, 120],
    data: { url: (d && d.url) || "/" },
  };
  // Browser mewajibkan setiap push menampilkan notifikasi (userVisibleOnly)
  e.waitUntil(self.registration.showNotification(judul, opsi));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  let tujuan = new URL("/", self.location.origin).href;
  try {
    const u = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin);
    if (u.origin === self.location.origin) tujuan = u.href; // hanya halaman SIGAP sendiri
  } catch (_) {
    /* pakai beranda */
  }
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((daftar) => {
      for (const c of daftar) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          return c.focus().then((w) => (w && "navigate" in w ? w.navigate(tujuan) : undefined));
        }
      }
      return self.clients.openWindow(tujuan);
    }),
  );
});
