# Aturan luring SIGAP (wajib dijaga)

Sumber: `claude/rancangan-luring-pendataan-pelatihan-13nov.md` (keputusan Iqbal 13 Nov 2026). Tiap aturan punya tes penjaga di `lib/__tests__/swPenjaga.test.ts` (nomor sama).
Tes penjaga TIDAK boleh dihapus atau dilonggarkan tanpa persetujuan Iqbal. Bila tes gagal: berhenti dan laporkan; jangan push.

| No | Aturan |
|---|---|
| L1 | SIGAP tetap PWA. Service worker satu berkas: `public/sw.js`, didaftarkan dari akar situs. |
| L2 | Halaman Kamera SIGAP (`/sigap/foto`) selalu tersimpan dan terbuka tanpa sinyal: jaringan dulu, salinan bila gagal atau lebih dari 4 detik. Salinannya tidak pernah ikut dipangkas. |
| L3 | Ganti versi service worker TIDAK membuang simpanan luring: cache peta (`sigap-peta-v1`) dan cache aplikasi (`sigap-app-v1`) selalu dikecualikan saat `activate`. Nama cache yang sudah dipakai tidak diganti tanpa migrasi isinya. |
| L4 | Antrean kirim (data yang belum terkirim) tidak boleh dibuang oleh service worker: `sw.js` tidak menghapus IndexedDB, localStorage, atau cache selain yang berversi lama. |
| L5 | Pola "jaringan dulu" untuk halaman, supaya deploy baru langsung terlihat; API (`/api/`) tidak dilayani dari simpanan oleh service worker. |
| L6 | Tanpa sinyal tidak pernah layar kosong: navigasi yang gagal (setelah satu coba ulang) menampilkan `offline.html`; `offline.html` dan ikonnya ikut tersimpan saat pemasangan. |
| L7 | Berkas `/_next/static/*` disimpan cache-first (nama berkas memuat hash isi), dibatasi jumlahnya. |
| L8 | Pesan `simpan-halaman-kamera` dari halaman tetap didukung (penyiapan Kamera luring tanpa tombol). |
| L9 | `npm test` wajib lulus sebelum push (`push.ps1` berhenti bila gagal). |
