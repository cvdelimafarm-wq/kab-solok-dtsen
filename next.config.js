/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // (7 Okt 2026) SIGAP PEDIA: pustaka email/DKIM dijalankan apa adanya dari node_modules (tidak di-bundle
  // webpack) supaya require dinamis & modul Node bawaan (dns, crypto) aman.
  serverExternalPackages: ["mailauth", "mailparser"],
};

module.exports = nextConfig;
