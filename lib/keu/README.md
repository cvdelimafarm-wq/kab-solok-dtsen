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

## Tahap 3: mengubah dari halaman RO + unggah realisasi
Semua perubahan lewat gerbang (`/panggil`, `/tulis`); tombol hanya tampil bila `keu_boleh` mengizinkan, yang memutuskan tetap basis data.

- `lib/keu/kekurangan.ts` + `app/sigap/ro/[kode]/Kekurangan.tsx`: tab Kekurangan RAB (catat, ubah, tarik). Tes 9.
- `lib/keu/rab.ts` + `app/sigap/ro/[kode]/Rab.tsx`: tab RAB (susun baru/revisi, item, rincian baris, "sama dengan item", hapus rincian, tandai selesai, ajukan, setuju ketua, sahkan, kembalikan dengan catatan, batalkan, jejak). Tes 13.
- `app/sigap/ro/useKeu.ts`: tambahan `aksiKeu`, `useBoleh`, `tulisKeuKlien`, `useKirim`, `useRabRo`.
- `lib/keu/glp039.ts`: penguraian Excel GLP039 (murni; diuji pada berkas asli Kegiatan 2906: 52 item, Rp 395.774.000, semua pemeriksaan lolos). Tes 13.
- `lib/keu/glp039-xlsx.ts`: pembungkus SheetJS (dimuat dinamis), hash SHA-256, `argsRealisasiMasuk`. Tes 2.
- `app/sigap/realisasi/page.tsx`: bendahara memilih Excel, pratinjau dan pemeriksaan di perangkat, kirim ke `keu_realisasi_masuk`, daftar unggahan, batalkan dengan alasan.
- Prasyarat SQL: `20261024n_keu_v_rab_baris.sql` (tampilan `keu_v_rab_baris` dan `keu_v_rab_jejak`), lalu `20261024z9_cek_kesehatan_keu_n.sql` (empat baris pertama harus 0).
- Tes seluruh `lib/keu`: 83 lulus.

## Tahap 4: layar PPK dan keputusan kekurangan
Tanpa SQL baru (cukup berkas n dari tahap 3). Hak ditegakkan basis data; tombol hanya tampil bila `keu_boleh` mengizinkan.

- `lib/keu/revisi.ts`: logika murni jadwal (aksi tersedia per status), pengesahan (nomor + tanggal dokumen), tambahan pagu resmi, keputusan penuhi/tunda/tolak (jumlah dipenuhi tidak boleh melebihi tambahan; tolak wajib alasan). Tes 10.
- `app/sigap/revisi/page.tsx` (`/sigap/revisi`): jadwal revisi (buat jadwal bulanan, buka, tutup, terapkan, nyatakan sah, lewati, pulihkan), daftar usulan RO per jadwal dengan sahkan/kembalikan, tambahan pagu resmi (catat, batalkan). Semua pegawai dapat melihat.
- `app/sigap/ro/[kode]/Kekurangan.tsx`: panel keputusan kekurangan untuk ketua tim saat ada tambahan pagu terbuka (saran sistem sebagai titik awal, simpan semua sekaligus).
- `lib/keu/tampilan.ts`: ditambah `keu_revisi_sah`.
- Uji SQL 48 (`claude/skema-sql/fase-a/uji/48_uji_layar_ppk_realisasi.sql`) membuktikan muatan JSON yang dikirim aplikasi diterima gerbang.
- Tes seluruh `lib/keu`: 93 lulus.

## Yang sengaja belum ada
Kertas kerja Semula/Menjadi, usulan struktur (level baru), unggah dokumen Administrasi, unggah POK resmi (pembaca PDF), dan Master data.
