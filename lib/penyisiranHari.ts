// lib/penyisiranHari.ts
//
// Daftar kode hari (Senin s.d. Minggu) dipakai bersama oleh
// app/api/penyisiran/alokasi/hari-tugas/route.ts &
// app/api/penyisiran/alokasi/oh-monitoring/batalkan/route.ts -- SENGAJA
// ditaruh di lib/ (bukan diekspor langsung dari salah satu file route.ts)
// krn Next.js App Router MELARANG route.ts mengekspor apa pun selain
// handler HTTP (GET/POST/PATCH/dst) & beberapa const konfigurasi resmi
// (runtime/dynamic/dst) -- export tambahan spt ini bikin build GAGAL
// dgn error "... is not a valid Route export field" (pernah kejadian,
// lihat riwayat commit -- makanya dipindah ke sini).
export const HARI_VALID = ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"] as const;
