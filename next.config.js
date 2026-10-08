// (9 Okt 2026) [alamat baru, alamat lama (berkas halaman)] -- /sigap/kelola/<modul>
const PETA_KELOLA = [
  ["/sigap/kelola/pelatihan", "/sigap/pelatihan/kelola"],
  ["/sigap/kelola/translok", "/sigap/admin"],
  ["/sigap/kelola/pedia", "/sigap/pedia/kelola"],
  ["/sigap/kelola/pengadaan", "/sigap/kontrak"],
  ["/sigap/kelola/akses", "/sigap/akses"],
  ["/sigap/kelola/aplikasi", "/portal/admin"],
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
