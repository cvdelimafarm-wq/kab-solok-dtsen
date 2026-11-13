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
| L10 | Tingkat 1 (kerangka): setiap halaman SIGAP yang pernah dibuka bersinyal disimpan HTML-nya (cache `sigap-halaman-v1`, kunci tanpa `?query`, dibatasi jumlahnya), jaringan dulu; tanpa sinyal tampil salinan terakhir, baru `offline.html`. API tidak disimpan. Salinan dibuang saat keluar akun (pesan `hapus-halaman`). |
| L11 | Tanpa sinyal tidak pernah membingungkan: pita "Tanpa sinyal · terakhir tersambung pukul ..." tampil di semua halaman (`app/components/PitaLuring.tsx`, dipasang di `app/layout.tsx`). |
| L12 | Tingkat 3 (kerja luring), mulai dari pretest/posttest: tiap ketukan langsung ditulis ke HP (`lib/luringSimpan.ts`, awalan `sigap_luring:`); tanpa sinyal soal, jawaban, dan jam dipulihkan dari HP (waktu tetap berjalan, refresh tidak menambah waktu); yang belum terkirim bertanda `kotor`, dikirim otomatis saat tersambung, dan TIDAK dibuang saat keluar akun. Kunci jawaban tidak disimpan di HP. |
