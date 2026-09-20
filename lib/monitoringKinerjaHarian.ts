// lib/monitoringKinerjaHarian.ts
//
// Konstanta "Target Pendataan Harian (KK)" utk seksi "Monitoring Kinerja
// PPL Hari Ini" (app/penyisiran/monitoring-terpadu.tsx) -- angka TETAP SAMA
// utk SEMUA petugas (atas permintaan user, bukan per-petugas spt target
// total di tab Manajemen Target), makanya cukup 1 konstanta, BUKAN kolom
// database. SENGAJA ditaruh di lib/ (bukan diekspor langsung dari
// app/api/penyisiran/monitoring-kinerja-hari-ini/route.ts) krn Next.js App
// Router MELARANG route.ts mengekspor apa pun selain handler HTTP
// (GET/POST/dst) & beberapa const konfigurasi resmi (runtime/dynamic/dst) --
// export tambahan spt itu bikin build GAGAL dgn error "... is not a valid
// Route export field" (persis pola yg sudah didokumentasikan di
// lib/penyisiranHari.ts, kejadian yg SAMA kejadian lagi krn export ini
// sempat ditaruh langsung di route.ts).
//
// Dikonsumsi oleh app/api/penyisiran/monitoring-kinerja-hari-ini/route.ts
// (dikirim ke FE lewat field JSON `target_harian_kk`) -- FE (monitoring-
// terpadu.tsx) TIDAK mengimpor konstanta ini langsung, cuma baca angkanya
// dari response API, jadi kalau nilainya mau diubah CUKUP di SATU tempat
// ini saja.
export const TARGET_HARIAN_KK = 7;
