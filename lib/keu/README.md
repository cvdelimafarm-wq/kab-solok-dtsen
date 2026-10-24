# lib/keu — gerbang aplikasi ke basis data keuangan (SIGAP Kertas Kerja Revisi POK)

Dipasang bersama berkas SQL `20261024l_keu_tulis.sql` (fungsi `keu_jalankan` dan `keu_tulis`). Tanpa berkas itu rute ini membalas 502 "migrasi belum dijalankan".

## Berkas
- `lib/keu/galat.ts`: SQLSTATE basis data -> status HTTP + pesan (pesan RAISE berbahasa Indonesia diteruskan; galat tak terduga tidak dibocorkan).
- `lib/keu/gerbang.ts`: `panggilKeu`, `tulisKeu` (hanya memakai `db.rpc`), pemeriksa masukan, dan `tanganiPanggil` / `tanganiTulis` (logika rute yang bisa diuji). Sesi "masuk sebagai" hanya boleh memanggil `FUNGSI_BACA`.
- `app/api/sigap/keu/panggil/route.ts`: `POST { fungsi, args }` (Authorization: Bearer <sesi>).
- `app/api/sigap/keu/tulis/route.ts`: `POST { tabel, op: "insert"|"update", data, kunci? }`.
- `lib/keu/__tests__/gerbang.test.ts`: 19 tes.

## Cara memakai dari halaman (contoh)
```ts
const r = await fetch("/api/sigap/keu/panggil", {
  method: "POST",
  headers: { Authorization: `Bearer ${sesi}`, "Content-Type": "application/json" },
  body: JSON.stringify({ fungsi: "keu_struktur_aksi", args: { p_id: 12, p_aksi: "ajukan" } }),
});
const j = await r.json(); // { data } atau { error, kode } dengan status 403/422/409/...
```
`p_akun` tidak pernah dikirim klien; server mengisinya dari sesi. Hak ditegakkan basis data, bukan rute ini.

## Tahap 2: baca data dan halaman RO (hanya baca)
Keputusan Bapak 24 Okt 2026: semua pegawai organik boleh MELIHAT semua RO (hanya baca); daftar RO mengikuti hak lihat itu. Mengubah tetap lewat gerbang di atas, hak ditegakkan basis data.

- `lib/keu/tampilan.ts`: daftar putih tampilan (`keu_v_*`) dan tabel yang boleh dibaca beserta kolomnya. Bila kolom tampilan berubah di SQL, perbarui daftar ini.
- `lib/keu/baca.ts`: `periksaMasukanBaca`, `akunBolehBaca` (akun aktif dan organik atau super), `bacaKeu` (halaman 1000 baris), `tanganiBaca`.
- `app/api/sigap/keu/baca/route.ts`: `GET ?tampilan=&kolom=&urut=&batas=&<kolom>=<nilai>` (`a|b` = salah satu dari, `null` = kosong). Balasan `{ data, jumlah, terpotong }`, tanpa simpanan HTTP.
- `lib/keu/ro.ts`: logika murni halaman RO (format angka, tab, `susunAnggaran`, `pilihRab`, `penugasanRo`, `ringkasRo`, `urlBaca`).
- `app/sigap/ro/useKeu.ts`: `useBacaKeu` (lewat `useData`), `usePenugasan`, `useAnggaranRo`.
- `app/sigap/ro/page.tsx`: daftar RO (cari kode atau nama; pagu, realisasi, ketua tim, kekurangan).
- `app/sigap/ro/[kode]/page.tsx` + `Tab.tsx`: satu alamat per RO dan per tab: `/sigap/ro/<KODE>?tab=ringkasan|anggaran|administrasi|kekurangan`.
- Tes: `gerbang.test.ts` (19), `baca.test.ts` (13), `ro.test.ts` (14).

Nama ketua tim, admin RO, dan akses Administrasi diambil dari tampilan `keu_v_penugasan_ro` (berkas SQL `20261024m_keu_v_penugasan_ro.sql`). Sebelum berkas itu dijalankan halaman tetap jalan; hanya nama penugasan yang kosong.

## Yang sengaja belum ada
Tombol mengubah di halaman RO (RAB, kertas kerja revisi, usulan struktur, unggah dokumen Administrasi, catatan kekurangan), pembaca berkas POK PDF dan Excel realisasi GLP039, serta layar PPK (jadwal dan pengesahan).
