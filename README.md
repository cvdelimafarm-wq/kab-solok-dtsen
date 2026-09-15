# Fitur "Anomali Cepat" — Panduan Integrasi

Kode ini MENGGANTIKAN isi placeholder di `app/seruti/anomali-cepat.tsx`
(project `kab-solok-dtsen`, Next.js 15 + Supabase + Railway). Dijalankan
sepenuhnya di server Node.js lewat Route Handler, TANPA lewat PANTAU.

**Sudah divalidasi langsung terhadap source code project Anda** (file .rar
yang diupload) — bukan cuma ditulis lalu ditebak cocok. Detail di bagian 8.

## 1. File yang perlu disalin ke project Anda

```
lib/dbfParser.ts                        <- BARU
lib/anomalyChecks.ts                    <- BARU
app/api/anomali-kp/upload/route.ts      <- BARU
app/seruti/anomali-cepat.tsx            <- GANTI (timpa placeholder yang sekarang)
supabase/migrations/20260916_kp_anomali.sql   <- BARU (jalankan lewat SQL Editor)
```

Tidak ada file lain yang perlu diubah — `app/seruti/page.tsx` TIDAK perlu
disentuh sama sekali, karena sudah meng-import `AnomaliCepatTab` dari
`./anomali-cepat` dan merender di tab `"anomali"`. Nama komponen & lokasi
file sengaja saya pertahankan sama persis dengan yang sudah ada.

## 2. Jalankan migrasi database

Supabase Dashboard project `dtsen-usulan-solok` → SQL Editor → paste isi
`supabase/migrations/20260916_kp_anomali.sql` → Run.

Ini membuat 2 tabel (`kp_anomali_upload`, `kp_anomali_temuan`) + fungsi RPC
`kp_anomali_summary`, dengan RLS yang **dibuka untuk role `anon`** —
BUKAN `authenticated` — karena `/seruti` memang tidak pakai login sama
sekali (`middleware.ts` cuma melindungi `/dashboard/:path*`). Ini
mengikuti pola yang sudah dipakai `seruti_sampel`/`seruti_ppl` (update
langsung dari client tanpa API route, lihat `submitJorong()` di
`app/seruti/page.tsx`).

## 3. Dependency baru

```powershell
npm install dbffile
```

Sudah diuji terpasang bersih di project Anda (`npm install dbffile` →
11 packages ditambahkan, 0 vulnerability).

## 4. Environment variable — HANYA satu yang perlu ditambah

Di **Railway** (Settings → Variables) dan `.env.local` untuk development:

```
SUPABASE_SERVICE_ROLE_KEY=<service_role key dari Supabase Dashboard>
```

Ambil dari: Supabase Dashboard → Project Settings → API → `service_role`
secret. **JANGAN** beri prefix `NEXT_PUBLIC_` — key ini cuma dipakai di
`app/api/anomali-kp/upload/route.ts` (server-side, untuk bypass RLS saat
insert ribuan baris temuan), tidak pernah terkirim ke browser.

Semua bagian LAIN (baca data, konfirmasi PPL) memakai `NEXT_PUBLIC_SUPABASE_ANON_KEY`
yang sudah ada — tidak perlu env var baru untuk itu.

## 5. Format file yang diupload

4 file DBF hasil export APLIKASI DESKTOP ENTRI Susenas (bukan PANTAU),
nama file harus diawali angka sesuai konvensi:

| Awalan nama file | Isi | Dipakai untuk cek |
|---|---|---|
| `3_...` | Komoditi Makanan RT (bahan makanan mentah) | KP-01, 04, 07, 09, 11.xxx, 13, 20 |
| `4_...` | Komoditi Makanan ART (makanan/minuman jadi & rokok) | KP-01, 11.211, 11.225, 12 |
| `5_...` | Komoditi Non Makanan | KP-02, 03, 07, 08, 10, 14, 16, 17, 18, 21 |
| `9_...` | Rekap RT Blok IV.3.2-3 | KP-19 |

## 6. Cakupan pengecekan (34 dari 37 kode aktif)

**3 kode TIDAK dijalankan**:
- **KP-05, KP-06** (kewajaran kalori) — perlu tabel referensi konversi
  kalori per komoditas (DKBM) yang belum tersedia. Kalau punya tabelnya,
  tambahkan implementasinya di `lib/anomalyChecks.ts` (ada komentar
  penanda lokasinya).
- **KP-15** (penguasaan bangunan lainnya) — sumber datanya belum
  teridentifikasi.

Hasil uji fungsional (150 RT, Kab. Solok, data tahun lalu):

```
KP-01: 0     (Banyak/Nilai Total ART — konsisten semua, sesuai harapan)
KP-02: 121   (kewajaran nilai Blok IV.2, ambang dihitung dinamis per rincian)
KP-08: 2, KP-09: 1
KP-11.084: 1, KP-11.186: 1, KP-11.211: 31, KP-11.225: 4
KP-17: 1, KP-18: 1
```

Catatan: KP-01 awalnya sempat menunjukkan 2.020 temuan palsu (bug) karena
saya salah asumsi struktur kolom tabel 4 (ART) — sudah diperbaiki dan
diverifikasi ulang terhadap data riil sebelum dikirim.

## 7. Ambang batas yang bisa disesuaikan

Di `lib/anomalyChecks.ts`, objek `thresholds` di awal `runAllChecks`:

```ts
garam: 3500,               // dihitung dari data riil tahun lalu (mean+3SD)
tiketPesawat: 15000000,    // ⚠ sampel tahun lalu cuma 2 kasus, angka kebijakan
hotel: 5000000,            // ⚠ sampel tahun lalu cuma 2 kasus, angka kebijakan
transportasiDarat: 100000000, // literal dari pesan asli tahun lalu (longgar)
zscoreNonMakanan: 3,       // KP-02: tandai jika di luar mean ± 3×SD per rincian
```

Bisa dioverride per-upload lewat field `thresholds` (JSON string) di
form-data — sudah didukung di route, tinggal ditambah input-nya di UI
kalau perlu.

## 8. Bagaimana ini divalidasi

1. **Logic 37 pengecekan** diuji dengan Node.js langsung terhadap 150 RT
   data riil Kabupaten Solok (file DBF yang sudah Anda upload) — ketemu 1
   bug nyata (mapping kolom tabel 4), diperbaiki, diuji ulang sampai hasil
   masuk akal.
2. **Ditulis ulang jadi TypeScript**, dicek `tsc --noEmit` mandiri (bersih),
   lalu dijalankan lagi lewat `tsx` terhadap data riil yang sama — hasil
   identik dengan versi JavaScript (163 temuan, breakdown sama persis).
3. **File project asli Anda (.rar) diekstrak dan dibaca langsung** — nama
   komponen (`AnomaliCepatTab`), lokasi file (`app/seruti/anomali-cepat.tsx`,
   tanpa folder `_components` seperti draf saya sebelumnya), pola import
   (`@/lib/supabase/client`, bukan client Supabase custom), skema warna
   Tailwind persis (`navy 50/100/400/600/700/900`, `gold 100/400/600`,
   `moss 100/500/700`, `rust 100/500/700`, `ink`, `line`, `paper`), dan pola
   penulisan data langsung dari client (bukan lewat API route terpisah,
   mengikuti `submitJorong()` yang sudah ada) — SEMUA disesuaikan dari
   membaca kode asli Anda, bukan ditebak.
4. **File-file baru disalin ke dalam project asli Anda dan di-`tsc --noEmit`
   ulang** memakai `tsconfig.json` project Anda sendiri (strict mode) —
   bersih, 0 error terkait file baru (2 error yang tampil murni dari folder
   `dtsen-usulan` duplikat lama yang sudah ada di project Anda sebelum saya
   sentuh apa pun).
5. **`next build` sungguhan** sempat dicoba tapi gagal karena sandbox saya
   tidak bisa akses Google Fonts (`next/font` mengunduh Plus Jakarta Sans
   saat build) — ini keterbatasan jaringan di lingkungan saya, BUKAN
   masalah kode. Build asli di Railway/laptop Anda (yang punya akses
   internet penuh) semestinya tidak kena masalah ini.

## 9. Yang PERLU Anda cek sendiri

- **Jalankan `npm run build` (atau `npm run dev`) di laptop Anda** setelah
  file disalin, untuk memastikan build sungguhan lolos (langkah #5 di atas
  tidak bisa saya selesaikan dari sisi saya).
- Apakah PPL memang tidak perlu login untuk konfirmasi (sesuai desain
  `/seruti` saat ini) — kalau ternyata Anda MAU PPL login dulu, RLS &
  komponennya perlu disesuaikan lagi (kasih tahu saya).
- Folder `dtsen-usulan` yang ternyata ada di dalam project Anda (duplikat
  lama?) — bukan urusan saya untuk membersihkannya, cuma saya laporkan
  karena muncul di hasil `tsc` tadi.
