# Fitur "Anomali Cepat" — Panduan Integrasi

Mengisi tab ke-4 `app/seruti/anomali-cepat.tsx` (project `kab-solok-dtsen`,
Next.js 15 + Supabase + Railway). Jalan sepenuhnya di server Node.js lewat
Route Handler, TANPA lewat PANTAU.

## Model data: "catatan hidup", bukan snapshot per-upload

Aplikasi desktop entri **menimpa/menghapus data lama** tiap ada perbaikan —
jadi tiap file yang diupload adalah **snapshot lengkap** kondisi terkini,
bukan cuma data tambahan. Karena itu skema di sini dirancang begini:

- Temuan yang **sama & nilainya sama** antar-upload → status konfirmasi PPL
  yang sudah ada **tetap dipertahankan** (tidak perlu dikonfirmasi ulang).
- Temuan yang **nilainya berubah** (dikoreksi) → otomatis balik ke
  `pending` (perlu dicek ulang).
- Temuan lama yang **sudah tidak muncul lagi** (diperbaiki sampai
  anomalinya hilang, atau RT-nya dihapus) → otomatis ditandai `resolved`
  (selesai), bukan dihapus — supaya ada jejak riwayat.

Ini semua terjadi otomatis lewat 1 fungsi Postgres (`kp_anomali_upsert_batch`)
yang dipanggil sekali per upload.

## 1. File yang perlu disalin

```
lib/dbfParser.ts                        → baru
lib/anomalyChecks.ts                    → baru
app/api/anomali-kp/upload/route.ts      → baru
app/seruti/anomali-cepat.tsx            → GANTI (timpa placeholder yang sekarang)
supabase/migrations/20260916_kp_anomali.sql → jalankan lewat SQL Editor
```

`app/seruti/page.tsx` TIDAK perlu disentuh — sudah meng-import
`AnomaliCepatTab` dari `./anomali-cepat` dan merender di tab `"anomali"`.

## 2. Jalankan migrasi database

Supabase Dashboard → project `dtsen-usulan-solok` → **SQL Editor** → paste
seluruh isi `supabase/migrations/20260916_kp_anomali.sql` → **Run**.

File ini **aman dijalankan berkali-kali** (idempotent) — semua statement
pakai `IF NOT EXISTS` / `DROP...IF EXISTS`, jadi kalau sebelumnya Anda
sempat menjalankan versi lama migrasi ini, tinggal jalankan file yang baru
ini lagi, tidak akan error.

**Kalau muncul error soal `natural_key` unique constraint** (kemungkinan
kalau ada sisa data duplikat dari percobaan sebelumnya) — data lama itu
cuma hasil percobaan awal, aman dihapus dulu:
```sql
truncate table kp_anomali_temuan restart identity;
truncate table kp_anomali_upload restart identity cascade;
```
lalu jalankan ulang file migrasinya.

## 3. Dependency & environment variable

```powershell
npm install dbffile
```

Tambahkan **satu** environment variable baru (Railway → Settings →
Variables, dan `.env.local` untuk development):
```
SUPABASE_SERVICE_ROLE_KEY=<service_role key dari Supabase Dashboard → Project Settings → API>
```
**JANGAN** beri prefix `NEXT_PUBLIC_` — key ini hanya dipakai server-side
di `route.ts` untuk memanggil fungsi upsert (butuh hak akses melewati RLS).

## 4. Format file yang diupload

4 file DBF hasil export aplikasi desktop entri Susenas (ekstensi boleh
`.dbf` maupun `.xls` — isinya sama, format dBase), nama file diawali
angka sesuai konvensi:

| Awalan nama file | Isi | Dipakai untuk cek |
|---|---|---|
| `3_...` | Komoditi Makanan RT (bahan makanan mentah) | KP-01, 04, 07, 09, 11.xxx, 13, 20 |
| `4_...` | Komoditi Makanan ART (makanan/minuman jadi & rokok) | KP-01, 11.211, 11.225, 12 |
| `5_...` | Komoditi Non Makanan | KP-02, 03, 07, 08, 10, 14, 16, 17, 18, 21 |
| `9_...` | Rekap RT Blok IV.3.2-3 | KP-19 |

File lain (`1_1`, `1_2`, `2_1`, `2_2`, `2_3`, `6`, `7`, `8`, `10`, `11`,
`12`) **tidak dipakai** oleh 37 pengecekan yang ada sekarang — boleh
diupload sekalian (akan diabaikan) atau tidak usah, sama saja.

## 5. Cakupan pengecekan (34 dari 37 kode aktif)

**3 kode TIDAK dijalankan**:
- **KP-05, KP-06** (kewajaran kalori) — perlu tabel referensi konversi
  kalori per komoditas (DKBM) yang belum tersedia.
- **KP-15** (penguasaan bangunan lainnya) — sumber datanya belum
  teridentifikasi.

## 6. Bagaimana ini divalidasi

1. **Logic 37 pengecekan** diuji dgn Node.js terhadap 150 RT data riil
   Kabupaten Solok — ketemu & diperbaiki 1 bug nyata (mapping kolom tabel 4).
2. Ditulis ulang jadi **TypeScript**, `tsc --noEmit` mandiri bersih, hasil
   fungsional identik dgn versi JS (163 temuan, breakdown sama persis).
3. File project asli Anda (hasil ekstrak `.rar`) **dibaca langsung** — nama
   komponen, lokasi file, pola import Supabase, skema warna Tailwind
   persis, dan pola tulis-data langsung dari client (bukan API route
   terpisah) — semua disesuaikan dari kode asli, bukan ditebak.
4. File-file baru disalin **ke dalam project asli Anda** dan di-`tsc --noEmit`
   ulang memakai `tsconfig.json` Anda sendiri (strict mode) — bersih.
5. **Migrasi SQL dijalankan sungguhan** di Postgres 16 lokal (bukan cuma
   dibaca) — termasuk simulasi 2 kali upload berturut-turut dengan PPL
   konfirmasi di antaranya, hasil:
   - Upload 1 (3 temuan baru) → PPL konfirmasi 1 jadi "Sesuai"
   - Upload 2: 1 temuan nilainya **sama** → status "Sesuai" **tetap
     dipertahankan** ✓; 1 temuan nilainya **berubah** → otomatis reset ke
     "Pending" ✓; 1 temuan **hilang** dari data baru → otomatis jadi
     "Selesai" ✓
6. `next build` sungguhan sempat dicoba tapi gagal karena sandbox saya
   tidak bisa akses Google Fonts (`next/font`) — keterbatasan jaringan di
   lingkungan saya, bukan soal kode. **Jalankan `npm run build` di laptop
   Anda** sebagai langkah terakhir sebelum deploy.

## 7. Yang PERLU Anda cek sendiri

- `npm run build` di laptop Anda (poin 6 di atas).
- Apakah PPL memang tidak perlu login untuk konfirmasi (sesuai desain
  `/seruti` saat ini yang terbuka tanpa auth).
- Folder `dtsen-usulan` yang ada di dalam project Anda (duplikat lama?) —
  tidak saya utak-atik, cuma dilaporkan karena sempat muncul di hasil `tsc`.
