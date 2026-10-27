// (8 Okt 2026) Service worker PWA SIGAP -- permintaan user ("lanjut PWA dulu").
// Prinsip: TIDAK menyimpan (cache) halaman/data aplikasi, supaya setiap update web (push) langsung
// terlihat oleh petugas dan data tidak basi. Yang disimpan hanya halaman "Tidak ada sinyal" (offline.html)
// beserta ikon, untuk ditampilkan saat HP benar-benar tidak terhubung internet.
// Bila nanti perlu mode offline penuh (isi tanpa sinyal), dikembangkan di berkas ini.
// (10 Okt 2026) Pengecualian: peta wilayah kerja yang diunduh ke HP (cache "sigap-peta-v1", diisi app/portal/petaOffline.ts) dilayani dari sini
// lewat alamat tetap /peta-cache/<wa|sls>/<nama berkas> supaya terbuka seketika dan tanpa sinyal. Halaman & data aplikasi tetap TIDAK di-cache di sini.
// (8 Okt 2026) Notifikasi push: event "push" menampilkan notifikasi (juga saat aplikasi ditutup), "notificationclick" membuka
// halaman tujuan. Isi push dikirim server (lib/sigapPush.ts) sebagai JSON { judul, isi, url, tag }.
// (23 Okt 2026) PENGECUALIAN KEDUA terhadap prinsip "tidak menyimpan halaman": KAMERA SIGAP harus bisa dibuka dari awal (HP baru dinyalakan/aplikasi
// baru dibuka) di daerah tanpa sinyal. Maka disimpan di cache "sigap-app-v1": (a) berkas /_next/static/* (nama berkasnya memuat hash isi, jadi
// tidak pernah basi; cache-first), dan (b) HANYA satu halaman, /sigap/foto (jaringan dulu; bila gagal/lambat > 4 dtk dan ada salinan -> salinan).
// Halaman lain, API, dan data TIDAK disimpan; update web tetap langsung terlihat saat ada sinyal.

// (11 Okt 2026) v4: offline.html baru (membedakan "tidak ada sinyal" dari "server tidak terjangkau", daftar peta tersimpan) & ikon yang benar
// (offline.html memakai /icons/icon-192.png; dulu yang disimpan /ikon/ikon-192.png sehingga ikon hilang saat luring).
// (23 Okt 2026) v5: cache aplikasi "sigap-app-v1" (lihat catatan di atas) + pesan "simpan-halaman-kamera" dari halaman.
const VERSI = "sigap-v5";
const CACHE_PETA = "sigap-peta-v1";
const CACHE_APP = "sigap-app-v1";
const MAKS_BERKAS_APP = 400; // batas jumlah berkas di CACHE_APP; yang tertua dibuang
const HALAMAN_KAMERA = "/sigap/foto";
const TUNGGU_JARINGAN_MS = 4000;
const BERKAS_OFFLINE = ["/offline.html", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSI).then((c) => c.addAll(BERKAS_OFFLINE)));
  self.skipWaiting(); // versi baru service worker langsung aktif
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((kunci) => Promise.all(kunci.filter((k) => k !== VERSI && k !== CACHE_PETA && k !== CACHE_APP).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// (23 Okt 2026) Buang berkas tertua bila cache melebihi batas (urutan keys() = urutan masuk).
async function pangkas(cache) {
  const halaman = new URL(HALAMAN_KAMERA, self.location.origin).href;
  const ks = (await cache.keys()).filter((r) => r.url !== halaman); // salinan halaman kamera tidak pernah ikut dibuang
  for (let i = 0; i < ks.length - MAKS_BERKAS_APP; i++) await cache.delete(ks[i]);
}

// /_next/static/*: cache-first. Hanya jawaban 200 yang disimpan.
function berkasStatis(req) {
  return caches.open(CACHE_APP).then((c) =>
    c.match(req).then(
      (ada) =>
        ada ||
        fetch(req).then((res) => {
          if (res && res.status === 200) {
            const salinan = res.clone();
            c.put(req, salinan).then(() => pangkas(c)).catch(() => undefined);
          }
          return res;
        }),
    ),
  );
}

// Halaman kamera: jaringan dulu; jawaban HTML yang baik disimpan; jaringan gagal/lambat/5xx -> salinan tersimpan -> offline.html.
function halamanKamera(e, req) {
  const kunci = new URL(HALAMAN_KAMERA, self.location.origin).href;
  const jaringan = fetch(req).then((res) => {
    if (res.ok && (res.headers.get("content-type") || "").indexOf("text/html") >= 0) {
      const salinan = res.clone();
      caches.open(CACHE_APP).then((c) => c.put(kunci, salinan)).catch(() => undefined);
    }
    return res;
  });
  e.waitUntil(jaringan.catch(() => undefined)); // tetap menyimpan walau salinan lama sudah dipakai karena jaringan lambat
  const tunggu = new Promise((r) => setTimeout(() => r(null), TUNGGU_JARINGAN_MS));
  return Promise.race([jaringan.catch(() => null), tunggu]).then((res) => {
    if (res && res.status < 500) return res;
    return caches
      .open(CACHE_APP)
      .then((c) => c.match(kunci))
      .then((ada) => ada || res || jaringan.catch(() => null))
      .then((hasil) => hasil || caches.match("/offline.html"));
  });
}

// Halaman minta simpan: ambil halaman kamera + semua berkas /_next/static yang disebut di dalamnya (untuk kasus pengguna tiba di sini lewat
// perpindahan di dalam aplikasi, sehingga halaman ini belum pernah dibuka sebagai navigasi penuh).
async function simpanHalamanKamera() {
  const asal = self.location.origin;
  const res = await fetch(HALAMAN_KAMERA, { cache: "no-store", credentials: "same-origin" });
  if (!res.ok || (res.headers.get("content-type") || "").indexOf("text/html") < 0) return;
  const teks = await res.clone().text();
  const c = await caches.open(CACHE_APP);
  await c.put(new URL(HALAMAN_KAMERA, asal).href, res);
  const daftar = new Set();
  (teks.match(/\/_next\/static\/[A-Za-z0-9_\-\/.%~]+/g) || []).forEach((x) => daftar.add(x));
  (teks.match(/static\/(?:chunks|css|media)\/[A-Za-z0-9_\-\/.%~]+/g) || []).forEach((x) => daftar.add("/_next/" + x));
  for (const x of daftar) {
    if (!/\.(?:js|css|woff2?)$/.test(x)) continue;
    const alamat = new URL(x, asal).href;
    if (await c.match(alamat)) continue;
    try {
      const r = await fetch(alamat);
      if (r.status === 200) await c.put(alamat, r);
    } catch (_) {
      /* sinyal putus di tengah: yang sudah tersimpan tetap ada */
    }
  }
  await pangkas(c);
}

self.addEventListener("message", (e) => {
  if (e.data && e.data.tipe === "simpan-halaman-kamera") e.waitUntil(simpanHalamanKamera().catch(() => undefined));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // (10 Okt 2026) peta yang tersimpan di HP
  if (req.method === "GET") {
    const u = new URL(req.url);
    if (u.origin === self.location.origin && u.pathname.startsWith("/peta-cache/")) {
      e.respondWith(
        caches
          .open(CACHE_PETA)
          .then((c) => c.match(u.origin + u.pathname))
          .then((r) => r || new Response("Peta ini belum tersimpan di HP.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } })),
      );
      return;
    }
  }
  // (23 Okt 2026) berkas statis aplikasi (cache-first)
  if (req.method === "GET") {
    const u = new URL(req.url);
    if (u.origin === self.location.origin && u.pathname.startsWith("/_next/static/")) {
      e.respondWith(berkasStatis(req));
      return;
    }
    // halaman kamera (navigasi penuh ke /sigap/foto, dengan atau tanpa ?kegiatan=)
    if (req.mode === "navigate" && u.origin === self.location.origin && u.pathname.replace(/\/$/, "") === HALAMAN_KAMERA) {
      e.respondWith(halamanKamera(e, req));
      return;
    }
  }
  // Hanya navigasi halaman (buka/pindah halaman) yang ditangani; API, gambar, unggah foto dll dibiarkan
  // langsung ke jaringan seperti web biasa.
  if (req.method !== "GET" || req.mode !== "navigate") return;
  // (11 Okt 2026) Temuan audit: satu kegagalan sesaat (server restart saat deploy, koneksi putus di tengah) langsung menampilkan
  // "Tidak ada sinyal" walau internet ada. Kini dicoba ULANG sekali setelah 1,5 dtk; baru bila tetap gagal tampil offline.html
  // (yang membedakan sendiri "tidak ada sinyal" dan "server tidak terjangkau").
  e.respondWith(
    fetch(req)
      .catch(() => new Promise((r) => setTimeout(r, 1500)).then(() => fetch(req)))
      .catch(() => caches.match("/offline.html")),
  );
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
  // (28 Okt 2026) pengingat QC Pemahaman: tombol "Tunda 2 jam" (Android/komputer; iPhone tidak menampilkan tombol, di sana tersedia di modal QC)
  if (d && d.tunda) opsi.actions = [{ action: "tunda", title: "Tunda 2 jam" }];
  // Browser mewajibkan setiap push menampilkan notifikasi (userVisibleOnly)
  e.waitUntil(self.registration.showNotification(judul, opsi));
});

// (28 Okt 2026) Tombol "Tunda 2 jam": service worker tidak punya sesi, jadi petugas dikenali dari alamat langganan push perangkat ini.
// Hanya menunda notifikasi pengingat; modal QC di aplikasi tetap wajib sampai nilai 100.
async function tundaQc() {
  let isi = "Pengingat ditunda 2 jam. Soal tetap wajib diisi.";
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (!sub) throw new Error("tanpa langganan");
    const res = await fetch("/api/sigap/qc/tunda", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j && j.pesan) isi = j.pesan;
    else if (j && j.error) isi = j.error;
    else if (!res.ok) throw new Error("gagal");
  } catch (_) {
    isi = "Gagal menunda (periksa sinyal). Buka SIGAP untuk mengerjakan QC.";
  }
  return self.registration.showNotification("QC Pemahaman Petugas", {
    body: isi,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: "qc-tunda",
    lang: "id",
    silent: true,
    data: { url: "/" },
  });
}

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  if (e.action === "tunda") {
    e.waitUntil(tundaQc());
    return;
  }
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
