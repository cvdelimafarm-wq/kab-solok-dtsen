# Peta jalan untuk tab Peta (Lembar Pendataan)

Satu berkas `.pmtiles` per tim PML (kunci = `bencana_petugas.id` PML). Sumber: OpenStreetMap lewat build harian Protomaps.
Dipotong di laptop, diunggah ke bucket Storage `peta-dasar`; aplikasi mengunduhnya ke HP atas ketukan petugas untuk dipakai tanpa sinyal.

## Sekali saja
1. Jalankan `supabase/migrations/20261020b_peta_dasar_bucket.sql` di SQL Editor Supabase.
2. Pasang `pmtiles` (program, bukan paket npm): unduh `go-pmtiles_..._Windows_x86_64.zip` dari https://github.com/protomaps/go-pmtiles/releases,
   ambil `pmtiles.exe`, taruh di folder proyek (jangan di-commit) atau di PATH. Cek: `.\pmtiles.exe version`.
3. `npm i maplibre-gl pmtiles @protomaps/basemaps`, lalu commit `package.json` DAN `package-lock.json` sebelum push (kalau lock tertinggal, build Railway gagal seperti kasus `qrcode`).

## Langkah
```
node scripts/peta/potong-peta.mjs --daftar          # tim, jumlah sel, kotak batas (tanpa internet)
node scripts/peta/potong-peta.mjs --perkiraan       # ukuran perkiraan tiap tim, TANPA mengunduh
node scripts/peta/potong-peta.mjs --tim=96          # coba satu tim dulu -> peta-keluar/tim-96.pmtiles
node scripts/peta/potong-peta.mjs --unggah          # semua tim: potong + unggah (+ manifest.json)
```
Pakai `--pmtiles=.\pmtiles.exe` bila programnya tidak ada di PATH. `peta-keluar/` jangan di-commit (tambahkan ke `.gitignore`).

## Ukuran
Kunci ukuran ada di `--maxzoom` (bawaan 15; jalan terlihat jelas sampai zoom ini, lebih besar hanya diperbesar) dan `--pad` (bawaan 1 sel ±1,1 km di sekeliling titik KK).
Bila `--perkiraan` menunjukkan satu tim > 50 MB, turunkan `--maxzoom=14` atau `--pad=0`. Batas unggah paket gratis Supabase 50 MB per berkas.

## Memperbarui
- Peta OSM berubah pelan: potong ulang cukup tiap beberapa bulan atau bila ada jalan baru penting. Tiap berkas punya `versi` di manifest; HP yang sudah mengunduh akan melihat tombol "Perbarui peta".
- Pembagian tim berubah (PML pindah wilayah): buat ulang `wilayah-tim.json` dengan kueri di bawah, lalu potong ulang tim terkait.

```sql
with c as (
  select distinct a.pml_id, floor(k.lng/0.01)::int x, floor(k.lat/0.01)::int y
  from bencana_alokasi_subsls a join bencana_pendataan_kk k on k.idsubsls=a.idsubsls and k.aktif and k.lat is not null
  where a.pml_id is not null
), g as (select pml_id,y,x, x - row_number() over (partition by pml_id,y order by x) as grp from c),
r as (select pml_id,y,min(x) x0,max(x) x1 from g group by pml_id,y,grp)
select pml_id, json_agg(json_build_array(y,x0,x1) order by y,x0) as lari from r group by pml_id order by pml_id;
```

## Tim tanpa berkas
Tim yang tidak ada di manifest tidak melihat kontrol peta jalan sama sekali; tab Peta tetap titik di kanvas seperti sebelumnya.

## Lisensi
Data © kontributor OpenStreetMap (ODbL). Atribusi "© OpenStreetMap · Protomaps" tampil di pojok peta.
