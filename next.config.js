/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // (7 Okt 2026) SIGAP PEDIA: pustaka email/DKIM dijalankan apa adanya dari node_modules (tidak di-bundle
  // webpack) supaya require dinamis & modul Node bawaan (dns, crypto) aman.
  serverExternalPackages: ["mailauth", "mailparser"],
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
