// lib/spjPejabat.ts
//
// Judul kegiatan & tempat kedudukan yang SELALU SAMA di semua dokumen SPJ
// Translok (Kwitansi, Visum, dst) -- di-hardcode di sini (bukan diinput
// ulang tiap kali/disimpan per baris di tabel spj_*) sesuai keputusan
// user. Diambil persis dari contoh Kwitansi & Visum yang diberikan user
// (Template_Kwitansi.pdf, Visum_Kosong.pdf).

export const KEGIATAN_NAMA = "Sensus Ekonomi 2026 (SE2026)";

// Nomor SPD di Kwitansi contoh: "003/019979-92800/TRANSLOK-2906/09/2026"
// -- "2906" adalah kode Kegiatan (dipakai jg utk survei lain di BPS Kab
// Solok, bukan spesifik SE2026), disimpan di sini supaya bisa dipakai
// konsisten kalau nomor SPD/ST dirangkai otomatis.
export const KODE_KEGIATAN = "2906";

// (14 Nov 2026) Nama, NIP, dan jabatan pejabat (Kepala, PPK, Bendahara, Pejabat Pengadaan) TIDAK lagi ditulis di sini:
// satu sumber di tabel keu_pejabat (SQL 20261114s), diatur di SIGAP Kelola > Master > Pejabat penandatangan, dibaca per tanggal dokumen
// lewat lib/pejabatServer.ts.

export const TEMPAT_KEDUDUKAN_DEFAULT = "Solok";
