// lib/spjPejabat.ts
//
// Data pejabat & judul kegiatan yang SELALU SAMA di semua dokumen SPJ
// Translok (Kwitansi, Visum, dst) -- di-hardcode di sini (bukan diinput
// ulang tiap kali/disimpan per baris di tabel spj_*) sesuai keputusan
// user, supaya kalau suatu saat pejabatnya berganti cukup diubah di SATU
// tempat ini lalu redeploy. Diambil persis dari contoh Kwitansi & Visum
// yang diberikan user (Template_Kwitansi.pdf, Visum_Kosong.pdf).

export const KEGIATAN_NAMA = "Sensus Ekonomi 2026 (SE2026)";

// Nomor SPD di Kwitansi contoh: "003/019979-92800/TRANSLOK-2906/09/2026"
// -- "2906" adalah kode Kegiatan (dipakai jg utk survei lain di BPS Kab
// Solok, bukan spesifik SE2026), disimpan di sini supaya bisa dipakai
// konsisten kalau nomor SPD/ST dirangkai otomatis.
export const KODE_KEGIATAN = "2906";

export const PEJABAT = {
  kepalaBps: {
    nama: "Bambang Suryanggono,SST., M.Ec.Dev",
    nip: "198209282004121001",
    jabatan: "Kepala BPS Kabupaten Solok",
  },
  ppk: {
    nama: "Novriady,S.Ak",
    nip: "198011132006041003",
    jabatan: "Pejabat Pembuat Komitmen",
  },
  bendaharaPengeluaran: {
    nama: "Alex Kandria",
    nip: "198406062007011004",
    jabatan: "Bendahara Pengeluaran",
  },
} as const;

export const TEMPAT_KEDUDUKAN_DEFAULT = "Solok";
