// (9 Okt 2026) [alamat baru, alamat lama (berkas halaman)] -- /sigap/kelola/<modul>
const PETA_KELOLA = [
  ["/sigap/kelola/pelatihan", "/sigap/pelatihan/kelola"],
  ["/sigap/kelola/translok", "/sigap/admin"],
  ["/sigap/kelola/pedia", "/sigap/pedia/kelola"],
  ["/sigap/kelola/pengadaan", "/sigap/kontrak"],
  ["/sigap/kelola/akses", "/sigap/akses"],
  ["/sigap/kelola/aplikasi", "/portal/admin"],
];

// (10 Okt 2026) Id build: dipakai HP untuk mengetahui ada deploy baru (header X-Build-Id pada jawaban /api/*, lihat app/portal/PembaruanTersedia.tsx).
// Data simpanan TIDAK dibuang karena deploy -- tiap jenis data punya nomor skema sendiri (app/portal/dataBersama.ts).
const BUILD_ID = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.SOURCE_COMMIT || String(Date.now());

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: BUILD_ID },
  reactStrictMode: true,
  // (10 Okt 2026) Metadata WAJIB di <head> untuk semua browser -- perbaikan tombol "Instal SIGAP" yang mendadak tidak memunculkan dialog
  // di beberapa HP sekaligus. Penyebab (terbukti lewat uji Chrome): sejak Next.js 15.2+ metadata (title, <link rel="manifest">, ikon) dikirim
  // belakangan (streaming) dan jatuh di <body> untuk browser biasa; Chrome tidak menemukan manifest di sana ("no-manifest" -> tidak dianggap
  // aplikasi yang bisa dipasang -> beforeinstallprompt tidak pernah datang). htmlLimitedBots bawaan hanya mencakup mesin pencari; regex ini
  // menyuruh Next menunggu metadata dan menaruhnya di <head> untuk semua pengguna. Harga: awal pengiriman halaman menunggu metadata (milidetik).
  htmlLimitedBots: /.*/,
  // (7 Okt 2026) SIGAP PEDIA: pustaka email/DKIM dijalankan apa adanya dari node_modules (tidak di-bundle
  // webpack) supaya require dinamis & modul Node bawaan (dns, crypto) aman.
  serverExternalPackages: ["mailauth", "mailparser"],
  // (9 Okt 2026) Alamat halaman pengelolaan diseragamkan menjadi /sigap/kelola/<modul> -- permintaan user
  // ("halaman utama kelola jadikan sigap/kelola/pelatihan; yang berubah pelatihan-anggaran-delego-sigap pedia dll").
  // Berkas halaman tidak dipindah: alamat baru dilayani lewat rewrites (isi = halaman lama), alamat lama dialihkan ke
  // alamat baru (redirects) supaya tautan yang sudah tersebar di WhatsApp/notifikasi tetap jalan.
  async redirects() {
    return PETA_KELOLA.map(([baru, lama]) => ({ source: `${lama}/:path*`, destination: `${baru}/:path*`, permanent: false }));
  },
  async rewrites() {
    return PETA_KELOLA.map(([baru, lama]) => ({ source: `${baru}/:path*`, destination: `${lama}/:path*` }));
  },
  // (8 Okt 2026) PWA: sw.js jangan di-cache browser supaya versi service worker baru cepat terpakai
  async headers() {
    return [
      { source: "/api/:path*", headers: [{ key: "X-Build-Id", value: BUILD_ID }] },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
