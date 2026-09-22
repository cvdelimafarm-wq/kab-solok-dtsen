// lib/manajemenTargetAkses.ts
//
// Daftar nama yg diizinkan mengakses tab "Manajemen Target" (submenu di
// halaman /penyisiran) MAUPUN tab "Master Petugas" (SAMA daftarnya --
// permintaan user, kedua tab ini "hanya bisa dimasuki akun khusus
// pengelola"). SENGAJA hardcode nama (bukan role/PIN baru) -- ketujuhnya
// SUDAH punya akun personal di petugas_penyisiran_akun (dipakai jg utk
// login tab "Penyisiran Usaha"/"Identifikasi Jorong", role token
// "penyisiran_petugas", lihat lib/penyisiranAuth.ts), jadi tab ini TIDAK
// perlu sistem login baru -- cukup pakai login personal yang sama, lalu
// nama hasil login-nya dicocokkan ke daftar di bawah.
//
// File ini TIDAK menyentuh apa pun yang server-only (tidak import
// "crypto" dkk) supaya boleh diimpor dari DUA sisi:
//  - Server (app/api/penyisiran/target/route.ts, .../target/ringkasan) --
//    pengecekan yang SEBENARNYA menentukan boleh/tidak, krn client bisa
//    saja dimodifikasi/di-bypass.
//  - Client (app/penyisiran/manajemen-target.tsx) -- cuma utk UX (langsung
//    tampilkan pesan "tidak punya akses" tanpa nunggu API menolak), BUKAN
//    satu-satunya lapis keamanan.
//
// Dicocokkan case-insensitive & tanpa spasi berlebih di awal/akhir, SAMA
// gaya normalisasi dgn NAMA_PAKAI_KANTOR di app/seruti/penyisiran-usaha.tsx.
const NAMA_MANAJEMEN_TARGET = new Set(
  [
    "Bambang Suryanggono",
    "Deswaty",
    "M. Iqbal Hadi",
    "Wisnu Dwi Jayanto",
    "Nurafiza Thamrin",
    "Faisal Siddiq",
    "Arini Alva Syaadah",
  ].map((n) => n.trim().toLowerCase())
);

export function bolehAksesManajemenTarget(nama: string | null | undefined): boolean {
  if (!nama) return false;
  return NAMA_MANAJEMEN_TARGET.has(nama.trim().toLowerCase());
}

// Khusus SATU akun (permintaan user: "tampilkan warning khusus akun saya
// M. Iqbal Hadi") -- dipakai FasihMismatchWarningBar di
// app/penyisiran/page.tsx supaya warning selisih "Monitoring Assignment
// FASIH" HANYA muncul utk akun ini, BEDA dari akses fitur/panelnya sendiri
// (tab Perencanaan Lapangan) yang tetap terbuka utk SEMUA 7 pengelola di
// atas lewat bolehAksesManajemenTarget. Normalisasi SAMA persis (case-
// insensitive & trim).
export function apakahIqbalHadi(nama: string | null | undefined): boolean {
  if (!nama) return false;
  return nama.trim().toLowerCase() === "m. iqbal hadi";
}
