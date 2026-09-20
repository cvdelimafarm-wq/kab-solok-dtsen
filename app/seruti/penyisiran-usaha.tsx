"use client";

// app/seruti/penyisiran-usaha.tsx
//
// Tab "Penyisiran Usaha" -- lembar pengecekan/identifikasi lapangan utk
// daftar keluarga hasil pencocokan SE2026 vs DUTP/DTSEN/PNM Mekar (dari
// script penyisiran_undercoverage_usaha.py, dijalankan OFFLINE di komputer
// BPS Kab Solok karena sumbernya memuat NIK). Data yang sampai ke sini
// (lewat file data_checklist_penyisiran.json yang diupload manual di tab
// ini) SUDAH TIDAK memuat NIK/Nomor KK sama sekali -- lihat komentar di
// bagian atas script Python & migrasi supabase/migrations/20260917_penyisiran_usaha.sql.
//
// Login PERSONAL (nama + tanggal lahir, role "penyisiran_petugas" --
// lihat lib/penyisiranAuth.ts & app/api/penyisiran/penyisiran-login) --
// MENGGANTIKAN PIN bersama yang dulu dipakai tab ini. Dicocokkan ke tabel
// petugas_penyisiran_akun (TABEL SAMA dgn "Identifikasi Jorong", cuma role
// token-nya beda), sama persis pola/gaya dgn tab Identifikasi Jorong/
// Tetangga -- token disimpan di localStorage (bukan sessionStorage) spy
// tidak perlu login ulang tiap hari. PIN admin ("penyisiran", env
// PENYISIRAN_PIN) TETAP ADA tapi sekarang cuma dipakai tab Monitoring.
//
// Karena loginnya personal, sistem otomatis tahu SIAPA yang sedang
// membuka tab ini -- dipakai utk (1) menandai siapa yang menyimpan
// checklist tiap keluarga (penyisiran_oleh/penyisiran_oleh_id, dasar
// hitungan tab Monitoring Petugas Penyisiran) dan (2) skor prioritas
// berbasis jarak dari lokasi rumah petugas yang login (tombol "📍 Tetapkan
// Lokasi Rumah Saya", lihat hitungSkorPrioritas()).
//
// Badge Info PPL/Jorong/Tetangga + tombol "✎ Edit" per-kartu SUDAH
// DIHAPUS dari kartu (atas permintaan) -- field & skor prioritas yg
// memakainya TETAP ADA di backend (nilai terakhir yg tersimpan tetap
// dipakai hitungSkorPrioritas), cuma sudah tdk ada lagi cara mengubahnya
// lewat tab ini. Tombol melayang "🔒 Edit Semua Info Lapangan" (global,
// editAllMode) TETAP ADA krn msh dipakai utk unlock "🎯 Tandai Pasti".
// Kolom "Identifikasi PPL" ditampilkan read-only di sini (badge) -- diisi
// dari salah satu dari TIGA tab Identifikasi (masing-masing pakai
// login/PIN sendiri).
//
// Role PML (dikonfirmasi user): akun "penyisiran_petugas" yg mengawasi
// >=1 PPL lain lewat pengawas_id (kolom yg SUDAH ADA di
// petugas_penyisiran_akun, dipakai jg oleh tab "Master Petugas") login
// PERSIS lewat form yg sama di sini -- BUKAN akun/role terpisah. Bedanya:
// (1) wilayah yg tampil = GABUNGAN wilayah SELURUH PPL yang diawasinya
// (PML sendiri TIDAK pernah memilih wilayah manual, lihat
// lib/wilayahAlokasiPetugas.ts daftarIdUntukSesi()), sehingga PML melihat
// kartu yg SAMA dgn PPL-nya; (2) dropdown Status & input Catatan DIKUNCI
// (read-only) di RowCard, cuma "🎯 Tandai Pasti" yg tetap bisa diubah --
// pembatasan SEBENARNYA di server (/api/penyisiran/update), penguncian di
// FE murni UX. Flag `is_pml` dikirim balik oleh /api/penyisiran/penyisiran-
// login & disimpan di localStorage (IS_PML_KEY) spt field login lain.

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { MarkerRow, UserLocation } from "./penyisiran-map";

const PenyisiranMap = dynamic(() => import("./penyisiran-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-xs text-ink/40">Memuat peta...</div>
  ),
});

// Diekspor (bukan cuma module-scoped) supaya app/penyisiran/page.tsx bisa
// baca localStorage yang SAMA PERSIS -- dipakai floating warning bar
// "belum merencanakan 8 kunjungan besok" yang harus tampil di SEMUA tab
// halaman /penyisiran (bukan cuma tab ini), lihat RencanaBesokWarningBar
// di page.tsx.
export const TOKEN_KEY = "penyisiran-petugas-login-token";
export const NAMA_KEY = "penyisiran-petugas-login-nama";
export const PETUGAS_ID_STORE_KEY = "penyisiran-petugas-login-id";
// is_pml: true kalau akun ini PML (mengawasi >=1 PPL lewat pengawas_id,
// lihat lib/wilayahAlokasiPetugas.ts) -- dipakai RowCard utk mengunci
// dropdown Status & input Catatan (PML cuma boleh lihat + "🎯 Tandai
// Pasti", dikonfirmasi user). Disimpan di localStorage spt field login
// lain supaya tidak perlu login ulang tiap buka tab.
export const IS_PML_KEY = "penyisiran-petugas-login-ispml";
const LAT_KEY = "penyisiran-petugas-login-lat";
const LNG_KEY = "penyisiran-petugas-login-lng";

// Nama2 pegawai KANTOR BPS Kab Solok (bukan petugas lapangan yg tinggal di
// desa/nagari) -- DIKECUALIKAN dari kewajiban menekan tombol "📍 Tetapkan
// Lokasi Rumah Saya": lokasi rumahnya otomatis diisi koordinat KANTOR BPS
// Kab Solok begitu login (lihat efek auto-isi di PenyisiranPanel), HANYA
// kalau akunnya belum punya koordinat sama sekali -- sekali terisi (baik
// otomatis di sini maupun manual lewat tombol), tidak diisi ulang lagi.
// Dicocokkan case-insensitive & tanpa spasi berlebih di awal/akhir.
const NAMA_PAKAI_KANTOR = new Set(
  ["Bambang Suryanggono", "Wisnu Dwi Jayanto", "Novriady", "Deswaty", "M. Iqbal Hadi", "Riva Hestaria"].map((n) =>
    n.trim().toLowerCase()
  )
);
const KANTOR_LAT = -0.9604660386602418;
const KANTOR_LNG = 100.61102093270257;

// "sudah_didata_se2026" -- opsi TAMBAHAN atas permintaan user: dipakai
// kalau SETELAH dikunjungi/diwawancara ternyata usaha/keluarga ini
// TERNYATA sudah tercatat di SE2026 (jadi BUKAN kasus undercoverage,
// walau lokasinya sendiri ketemu & usahanya ada) -- beda dari "ditemukan"
// (usaha ada & memang perlu didata sbg undercoverage baru). Warna kartu
// MERAH, disamakan dgn badge "Identifikasi PPL: Tidak ada usaha" (lihat
// IDENTIFIKASI_META di bawah & KARTU_BG).
// "jadwalkan_besok" -- status BARU (atas permintaan): petugas berencana
// KEMBALI BESOK ke keluarga ini (dasar kuota "8 kunjungan/hari" & kartu
// StatTile "📅 Dijadwalkan Besok" -- lihat STATUS_PILIHAN di bawah &
// tanggal_rencana_kunjungan/ditemukan_at di migrasi
// 20260920_penyisiran_jadwalkan_besok.sql). Backend
// (/api/penyisiran/update) yg mengisi tanggal_rencana_kunjungan otomatis
// jadi BESOK (WIB) tiap kali status ini disimpan -- FE di sini tidak perlu
// kirim tanggal apa pun sendiri.
type StatusKunjungan =
  | "belum"
  | "ditemukan"
  | "tidak_ditemukan"
  | "tidak_bisa"
  | "sudah_didata_se2026"
  | "jadwalkan_besok";
// "tidak_ditemukan" di sini -- opsi tambahan dari identifikasi-jorong.tsx/
// identifikasi-tetangga.tsx (petugas ke lokasi tp alamat tdk ketemu),
// diperlakukan server sbg setara "ada" (sudah didata di SE2026) -- lihat
// komentar lengkap di app/api/penyisiran/identifikasi/route.ts. Cuma
// dipakai utk RENDER badge di sini, bukan pilihan yg bisa diubah dari tab
// Penyisiran Usaha (kolom ini read-only di tab ini).
type NilaiIdentifikasi = "belum" | "ada" | "tidak_ada" | "ragu" | "tidak_ditemukan";

const STATUS_META: Record<StatusKunjungan, { label: string; badge: string; dot: string }> = {
  belum: { label: "Belum Dikunjungi", badge: "bg-line text-ink/70", dot: "#6b7280" },
  ditemukan: { label: "Usaha Ditemukan", badge: "bg-moss-100 text-moss-700", dot: "#0ca30c" },
  tidak_ditemukan: { label: "Usaha Tidak Ditemukan", badge: "bg-[#FCEFD1] text-[#8A6A12]", dot: "#fab219" },
  tidak_bisa: { label: "Tidak Bisa Ditemui / Pindah", badge: "bg-rust-100 text-rust-700", dot: "#d03b3b" },
  sudah_didata_se2026: { label: "Sudah Didata di SE2026", badge: "bg-rust-100 text-rust-700", dot: "#d03b3b" },
  jadwalkan_besok: { label: "Dijadwalkan Besok", badge: "bg-[#DCE6FA] text-[#2545A0]", dot: "#2563eb" },
};

// Dropdown EDIT (status per-kartu, RowCard) & FILTER (toolbar) -- atas
// permintaan user, disederhanakan jadi 4 pilihan ini SAJA (dulu 5,
// "Usaha Tidak Ditemukan" & "Tidak Bisa Ditemui/Pindah" DIHAPUS dari
// pilihan yg bisa dipilih ke depannya). STATUS_META di atas TETAP memuat
// KESELURUHAN 6 status (termasuk 2 yg dihapus dari sini + "jadwalkan_
// besok") krn masih dipakai render badge/warna kartu/legenda peta utk
// data LAMA yg sudah kadung berstatus itu -- constraint di DB pun sengaja
// TETAP mengizinkannya (lihat migrasi 20260920_penyisiran_jadwalkan_besok.sql)
// supaya baris lama itu tidak gagal tersimpan lagi saat diedit ulang
// (mis. cuma ganti catatan/Tandai Pasti tanpa mengubah statusnya).
const STATUS_PILIHAN: StatusKunjungan[] = ["belum", "ditemukan", "sudah_didata_se2026", "jadwalkan_besok"];

// Warna LATAR BELAKANG KARTU (bukan cuma badge/dot kecil spt STATUS_META
// di atas) -- atas permintaan user, supaya status kunjungan langsung
// kelihatan sekilas dari warna kartu tanpa perlu baca teks:
//  - putih  : belum dikunjungi (default, tidak berubah)
//  - hijau  : usaha ditemukan (= sudah didata di penyisiran ini)
//  - kuning : usaha tidak ditemukan (petugas ke lokasi tp blm ketemu --
//             belum tentu gagal, jadi TIDAK disamakan merah)
//  - merah  : tidak bisa ditemui/pindah, ATAU sudah didata di SE2026
//             (dua2nya = "kasus ini selesai, bukan hasil positif baru")
const KARTU_BG: Record<StatusKunjungan, string> = {
  belum: "bg-white",
  ditemukan: "bg-moss-100",
  tidak_ditemukan: "bg-[#FCEFD1]",
  tidak_bisa: "bg-rust-100",
  sudah_didata_se2026: "bg-rust-100",
  // biru muda -- beda jelas dari hijau/kuning/merah/putih yg sudah ada,
  // supaya kartu yg dijadwalkan besok langsung kelihatan sekilas.
  jadwalkan_besok: "bg-[#E4ECFB]",
};

const IDENTIFIKASI_META: Record<NilaiIdentifikasi, { label: string; className: string }> = {
  belum: { label: "Identifikasi PPL: Belum diisi", className: "border border-line text-ink/40" },
  ada: { label: "Identifikasi PPL: Ada usaha", className: "bg-moss-100 text-moss-700" },
  tidak_ada: { label: "Identifikasi PPL: Tidak ada usaha", className: "bg-rust-100 text-rust-700" },
  ragu: { label: "Identifikasi PPL: Ragu-ragu", className: "bg-[#FCEFD1] text-[#8A6A12]" },
  tidak_ditemukan: { label: "Identifikasi: Tidak ditemukan (=sudah didata SE2026)", className: "bg-navy-50 text-navy-700" },
};

// ---------- Riwayat Perubahan (audit log, tabel penyisiran_riwayat) ----------
// Timeline "siapa mengubah apa/kapan/dari sumber mana" di panel "🕘 Riwayat
// Perubahan" tiap kartu -- BEDA dari "☎ Kontak PPL Wilayah Ini" (nama+No HP
// PPL yg dialokasikan ke Sub SLS, dari ppl_alokasi_idsls, sudah ada
// sebelumnya) supaya tidak tertukar dua fitur yang sekilas mirip namanya.
interface RiwayatEntry {
  jenis: "status_kunjungan" | "info_ppl" | "info_jorong" | "info_tetangga" | "identifikasi_ppl";
  nilai_lama: string | null;
  nilai_baru: string | null;
  oleh_nama: string | null;
  oleh_role: string | null;
  created_at: string;
}

// Label "Sumber" pada timeline -- dipetakan dari kode role token APA
// ADANYA yg tersimpan di penyisiran_riwayat.oleh_role (lihat migrasi
// 20260918_penyisiran_riwayat_audit_log.sql). "Otomatis dari akun yang
// login", bukan kolom teks bebas -- sesuai keputusan sebelumnya.
const SUMBER_LABEL: Record<string, string> = {
  penyisiran_petugas: "Petugas Penyisiran",
  penyisiran: "Petugas Penyisiran (PIN admin)",
  identifikasi_ppl: "PPL",
  identifikasi_jorong: "Identifikasi Jorong",
  identifikasi_tetangga: "Tetangga/Lainnya",
};

const JENIS_RIWAYAT_LABEL: Record<RiwayatEntry["jenis"], string> = {
  status_kunjungan: "Status Kunjungan",
  info_ppl: "Info PPL",
  info_jorong: "Info Jorong",
  info_tetangga: "Info Tetangga",
  identifikasi_ppl: "Identifikasi PPL",
};

// Ubah nilai MENTAH yg tersimpan di penyisiran_riwayat (mis. "true"/
// "ditemukan") jadi teks yg enak dibaca -- pakai label yg SAMA dgn badge
// yg sudah ada di kartu (STATUS_META dkk) supaya konsisten.
function formatNilaiRiwayat(jenis: RiwayatEntry["jenis"], nilai: string | null): string {
  if (nilai == null) return "-";
  if (jenis === "status_kunjungan") return STATUS_META[nilai as StatusKunjungan]?.label ?? nilai;
  if (jenis === "identifikasi_ppl") {
    const map: Record<string, string> = {
      belum: "Belum diisi",
      ada: "Ada usaha",
      tidak_ada: "Tidak ada usaha",
      ragu: "Ragu-ragu",
      tidak_ditemukan: "Tidak ditemukan (=sudah didata SE2026)",
    };
    return map[nilai] ?? nilai;
  }
  // info_ppl/info_jorong/info_tetangga -- disimpan sbg string "true"/"false".
  return nilai === "true" ? "Ada" : "Tidak";
}

function formatWaktuRiwayat(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type TierPrioritas = "pasti" | "tinggi" | "sedang" | "rendah";

// Pilihan "Urutkan" daftar keluarga -- "default" = urutan apa adanya dari
// server (spt semula), sisanya diurutkan di BROWSER dari data halaman yg
// sedang dimuat (lihat komentar rowsSorted di PenyisiranPanel).
type SortBy = "default" | "jarak_asc" | "jarak_terjauh" | "prioritas_desc" | "prioritas_asc";

// Warna badge "rendah" SENGAJA dibuat solid (bg-navy-100 + teks navy-700),
// BUKAN pucat/transparan (border border-line text-ink/40) seperti semula --
// versi pucat itu nyaris tidak kelihatan di atas kartu putih (dilaporkan
// user: "ada kartu yang tidak ada skala prioritasnya", padahal badge-nya
// ADA, cuma kontrasnya terlalu rendah). Dipilih warna biru (navy) supaya
// beda jelas dari merah (tinggi) & kuning (sedang), tidak disangka warna
// status lain. "pasti" (override manual lewat tombol "🎯 Pasti") dibuat
// SOLID merah tua supaya jelas beda dari "tinggi" biasa (hasil hitungan
// otomatis) -- ini keputusan MANUSIA, bukan skor.
const PRIORITAS_META: Record<TierPrioritas, { label: string; className: string }> = {
  pasti: { label: "Prioritas Pasti", className: "bg-rust-700 text-white" },
  tinggi: { label: "Prioritas Tinggi", className: "bg-rust-100 text-rust-700" },
  sedang: { label: "Prioritas Sedang", className: "bg-[#FCEFD1] text-[#8A6A12]" },
  rendah: { label: "Prioritas Rendah", className: "bg-navy-100 text-navy-700" },
};

// Skor skala prioritas kunjungan (0-100), gabungan 3 pertimbangan yg
// diminta -- makin tinggi skornya, makin layak didahulukan disisir:
//  1. Jumlah sumber data yg "mencurigakan ada usaha" (DUTP+DTSEN+PNM
//     Mekar, 0-3 tercentang) -- bobot PALING BESAR (50) krn ini bukti
//     paling langsung ada indikasi usaha.
//  2. Jumlah info tambahan yg sudah dikumpulkan petugas (Info PPL/
//     Jorong/Tetangga, 0-3 tercentang) -- bobot menengah (30), makin
//     banyak yg "Ya" makin menguatkan dugaan ada usaha.
//  3. Ukuran pengelompokan di Sub SLS yg sama (dibandingkan Sub SLS
//     LAIN yg sedang termuat di daftar ini) -- bobot terkecil (20),
//     Sub SLS dgn banyak keluarga bermasalah lebih efisien didahulukan
//     krn sekali jalan bisa menyisir banyak kasus sekaligus. Dihitung
//     dari daftar yg SEDANG DIMUAT (rows, terpengaruh filter & halaman
//     aktif), bukan hitungan global se-kabupaten.
//
// Dua lapisan TAMBAHAN di atas skor dasar tsb:
//  - `pasti` (tombol "🎯 Pasti"): override MANUAL -- kalau ditandai, skor
//    dipaksa 100/tier "pasti" apa pun hasil hitungan otomatis di atas.
//    Ditandai petugas yang sudah YAKIN (mis. sudah lihat sendiri ada usaha)
//    tapi skor otomatisnya belum tentu tinggi.
//  - `jarakKm` (opsional): jarak lurus rumah petugas yang SEDANG LOGIN ke
//    lokasi sampel -- kalau lokasi rumah petugas sudah ditetapkan (lihat
//    tombol "Tetapkan Lokasi Rumah Saya") DAN sampel punya koordinat, skor
//    dasar dikurangi 2 poin per km (maks -20) sebelum tier dihitung ulang --
//    makin jauh dari rumah petugas yang login, makin rendah prioritasnya
//    BAGI PETUGAS ITU (skor bisa beda2 antar akun yg login, sesuai
//    permintaan). Tidak berlaku kalau `pasti` true (override menang).
function hitungSkorPrioritas(
  data: Pick<Row, "bukti_dutp" | "bukti_dtsen" | "bukti_pnm" | "info_ppl" | "info_jorong" | "info_tetangga">,
  jumlahDiSubsls: number,
  maxJumlahDiSubsls: number,
  opts?: { pasti?: boolean; jarakKm?: number | null }
) {
  const jumlahBukti = (data.bukti_dutp ? 1 : 0) + (data.bukti_dtsen ? 1 : 0) + (data.bukti_pnm ? 1 : 0);
  const jumlahInfo = (data.info_ppl ? 1 : 0) + (data.info_jorong ? 1 : 0) + (data.info_tetangga ? 1 : 0);

  if (opts?.pasti) {
    return { skor: 100, tier: "pasti" as TierPrioritas, jumlahBukti, jumlahInfo };
  }

  const skorSumber = (jumlahBukti / 3) * 50;
  const skorInfo = (jumlahInfo / 3) * 30;
  const skorKlaster = maxJumlahDiSubsls > 0 ? (jumlahDiSubsls / maxJumlahDiSubsls) * 20 : 0;
  const penaltiJarak =
    opts?.jarakKm != null && Number.isFinite(opts.jarakKm) ? Math.min(20, Math.max(0, opts.jarakKm) * 2) : 0;
  const skor = Math.round(Math.min(100, Math.max(0, skorSumber + skorInfo + skorKlaster - penaltiJarak)));
  const tier: TierPrioritas = skor >= 60 ? "tinggi" : skor >= 30 ? "sedang" : "rendah";
  return { skor, tier, jumlahBukti, jumlahInfo };
}

// Alamat (baris pertama kartu) sering SUDAH memuat nama Jorong/SLS di
// dalamnya sendiri (mis. alamat "JALAN JORONG ULU PISAU HILANG" utk
// keluarga yg SLS-nya memang "JORONG ULU PISAU HILANG" -- lazim di alamat
// pedesaan yg tidak punya nama jalan sendiri) -- kalau baris kedua tetap
// menampilkan "Nagari · Nama SLS" apa adanya, nama Jorong itu jadi
// disebut DUA KALI berturut-turut (dilaporkan user, bikin kartu terasa
// berulang). Di sini nama SLS di baris kedua disembunyikan HANYA kalau
// alamat sudah memuat teks yg sama persis (cek case-insensitive) --
// nagari tetap selalu ditampilkan krn itu jarang ikut disebut di alamat.
function ringkasWilayah(alamat: string | null, nagariNama: string | null, slsNama: string | null): string {
  const sudahDisebut =
    !!alamat && !!slsNama && slsNama.trim().length > 0 && alamat.toUpperCase().includes(slsNama.trim().toUpperCase());
  const bagian = [nagariNama, sudahDisebut ? null : slsNama].filter((b): b is string => !!b && b.trim().length > 0);
  return bagian.join(" · ");
}

interface KecOption {
  kode: string;
  nama: string;
  jumlah: number;
}
interface SubslsOption {
  idsubsls: string;
  label: string; // mis. "JORONG USAK-01"
  jumlah: number;
}
interface Summary {
  total: number;
  belum: number;
  ditemukan: number;
  // Scoped HARI INI (WIB) -- lihat migrasi 20260920_penyisiran_jadwalkan_besok.sql
  // & komentar ditemukan_at di /api/penyisiran/update. `ditemukan` di atas
  // TETAP akumulatif dari awal (tidak diubah, dipakai konsumen lain).
  ditemukan_hari_ini: number;
  tidak_ditemukan: number;
  tidak_bisa: number;
  sudah_didata_se2026: number;
  // Jumlah KK berstatus "jadwalkan_besok" dgn tanggal_rencana_kunjungan =
  // BESOK (WIB) -- dasar kartu StatTile "📅 Dijadwalkan Besok" & kuota
  // warning bar (lihat RencanaBesokWarningBar di app/penyisiran/page.tsx).
  direncanakan_besok: number;
  kecamatan: KecOption[];
}
interface PplInfo {
  nama: string;
  no_hp: string;
  korwil: string;
  pml: string;
}
interface Row {
  kode_identitas: string;
  idsubsls: string | null;
  kec_kode: string | null;
  kec_nama: string | null;
  nagari_kode: string | null;
  nagari_nama: string | null;
  sls_kode: string | null;
  sls_nama: string | null;
  subsls_kode: string | null;
  nama_kk: string | null;
  // Nama gabungan Kepala Keluarga + anggota lain (mis. "ZULKARNAINI /
  // NANGTI MAROZA"), dari kolom baru penyisiran_usaha.nama_anggota_keluarga
  // -- BEDA dari nama_kk yg cuma nama KK sendirian. null utk data lama yg
  // belum diunggah ulang lewat script Python versi terbaru -- fallback ke
  // nama_kk (lihat namaTampilRow() di bawah).
  nama_anggota_keluarga: string | null;
  alamat: string | null;
  lat: number | null;
  lng: number | null;
  bukti_dutp: boolean;
  bukti_dtsen: boolean;
  bukti_pnm: boolean;
  pnm_sektor: string | null;
  pnm_subsektor: string | null;
  dtsen_lapangan_usaha: string | null;
  catatan_sensus: string | null;
  status_kunjungan: StatusKunjungan;
  info_ppl: boolean;
  info_jorong: boolean;
  info_tetangga: boolean;
  identifikasi_ppl: NilaiIdentifikasi;
  identifikasi_ppl_at: string | null;
  catatan_petugas: string | null;
  prioritas_pasti: boolean;
  penyisiran_oleh: string | null;
  updated_at: string;
  // Kapan status_kunjungan TERAKHIR KALI berubah MENJADI "ditemukan" (lihat
  // migrasi 20260920_penyisiran_jadwalkan_besok.sql) -- dipakai jg utk
  // aturan "kartu terkunci sehari setelah didata" di RowCard (lihat
  // terkunciSetelahHariBerganti di bawah), BUKAN cuma dasar hitungan
  // ditemukan_hari_ini di StatTile.
  ditemukan_at: string | null;
}

// Kartu berstatus "Usaha Ditemukan" TERKUNCI (read-only, dropdown Status &
// input lain dinonaktifkan) begitu tanggal ditemukan_at BUKAN LAGI hari ini
// (WIB) -- mencegah data yg sudah final "hari itu" keubah tanpa sengaja
// keesokan harinya. "🔓 Edit Semua" (editAllMode, tombol melayang bawah
// yg dipakai PML) SENGAJA tetap bisa membuka kunci ini kalau memang perlu
// dikoreksi -- BUKAN dikunci permanen, cuma proteksi default. Kartu selain
// status "Ditemukan" (mis. "Sudah Didata SE2026"/"Tidak Bisa") TIDAK ikut
// dikunci (permintaan user: cuma status "Ditemukan" saja).
function terkunciSetelahHariBerganti(row: Row): boolean {
  if (row.status_kunjungan !== "ditemukan" || !row.ditemukan_at) return false;
  const jakartaMs = Date.now() + 7 * 60 * 60 * 1000;
  const hariIniWib = new Date(jakartaMs).toISOString().slice(0, 10);
  const ditemukanMs = new Date(row.ditemukan_at).getTime() + 7 * 60 * 60 * 1000;
  const hariDitemukanWib = new Date(ditemukanMs).toISOString().slice(0, 10);
  return hariDitemukanWib !== hariIniWib;
}

// Nama yg ditampilkan di kartu/daftar -- utamakan nama_anggota_keluarga
// (nama gabungan KK + anggota lain, mis. "ZULKARNAINI / NANGTI MAROZA"),
// fallback ke nama_kk (nama KK sendirian) kalau kolom baru itu kosong
// (data lama yg belum diunggah ulang lewat script Python versi terbaru).
function namaTampilRow(row: { nama_kk: string | null; nama_anggota_keluarga: string | null }): string {
  return row.nama_anggota_keluarga || row.nama_kk || "(tanpa nama)";
}

// Jarak lurus (haversine, km) antara 2 titik koordinat -- dipakai skor
// prioritas berbasis jarak rumah petugas ke lokasi sampel. Cukup akurat utk
// kebutuhan "makin jauh makin rendah prioritas" (tidak perlu jarak jalan
// sesungguhnya).
function jarakKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// "Diperbarui X detik/menit lalu" utk status Lokasi Langsung (live
// tracking) -- teksnya perlu ikut "hidup" tanpa GPS update baru, makanya
// ada tick interval terpisah di PenyisiranPanel yang cuma memaksa
// re-render tiap beberapa detik.
function formatDetikLalu(ts: number): string {
  const detik = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (detik < 5) return "Diperbarui baru saja";
  if (detik < 60) return `Diperbarui ${detik} detik lalu`;
  const menit = Math.round(detik / 60);
  return `Diperbarui ${menit} menit lalu`;
}

// Token personal (role "penyisiran_petugas") punya 4 bagian
// (role.subjectB64.exp.sig, lihat lib/penyisiranAuth.ts) -- beda dari token
// PIN lama yg 3 bagian (role.exp.sig). tokenExpMs() menangani KEDUA bentuk
// itu spy tidak salah baca posisi expiry-nya (pola sama dgn
// app/penyisiran/identifikasi-jorong.tsx).
function tokenExpMs(token: string): number {
  const parts = token.split(".");
  const expStr = parts.length === 4 ? parts[2] : parts[1];
  return Number(expStr);
}

// Diekspor jg -- dipakai RencanaBesokWarningBar di app/penyisiran/page.tsx
// supaya cara baca+validasi token PERSIS SAMA (termasuk auto-hapus token
// kedaluwarsa), tidak duplikat logika expiry di dua tempat.
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const t = localStorage.getItem(TOKEN_KEY);
  if (!t) return null;
  const exp = tokenExpMs(t);
  if (!Number.isFinite(exp) || exp < Date.now()) {
    clearToken();
    return null;
  }
  return t;
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(NAMA_KEY);
  localStorage.removeItem(PETUGAS_ID_STORE_KEY);
  localStorage.removeItem(IS_PML_KEY);
  localStorage.removeItem(LAT_KEY);
  localStorage.removeItem(LNG_KEY);
}

// Diekspor jg -- dipakai RencanaBesokWarningBar di app/penyisiran/page.tsx
// (butuh panggil /api/penyisiran/summary sendiri, di LUAR tab ini, supaya
// warning "belum merencanakan 8 kunjungan besok" bisa tampil di semua tab
// halaman /penyisiran, bukan cuma saat tab Penyisiran Usaha aktif).
export async function apiFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Gagal (${res.status})`);
  return data;
}

export default function PenyisiranUsahaTab() {
  const [token, setToken] = useState<string | null>(null);
  const [nama, setNama] = useState<string | null>(null);
  const [petugasId, setPetugasId] = useState<number | null>(null);
  const [isPml, setIsPml] = useState(false);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [checkedStorage, setCheckedStorage] = useState(false);

  useEffect(() => {
    setToken(getToken());
    if (typeof window !== "undefined") {
      setNama(localStorage.getItem(NAMA_KEY));
      const savedId = Number(localStorage.getItem(PETUGAS_ID_STORE_KEY));
      setPetugasId(Number.isFinite(savedId) && savedId > 0 ? savedId : null);
      setIsPml(localStorage.getItem(IS_PML_KEY) === "1");
      const savedLat = Number(localStorage.getItem(LAT_KEY));
      const savedLng = Number(localStorage.getItem(LNG_KEY));
      setLat(Number.isFinite(savedLat) ? savedLat : null);
      setLng(Number.isFinite(savedLng) ? savedLng : null);
    }
    setCheckedStorage(true);
  }, []);

  function handleLoggedIn(
    t: string,
    n: string,
    id: number,
    loginLat: number | null,
    loginLng: number | null,
    loginIsPml: boolean
  ) {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.setItem(NAMA_KEY, n);
    localStorage.setItem(PETUGAS_ID_STORE_KEY, String(id));
    localStorage.setItem(IS_PML_KEY, loginIsPml ? "1" : "0");
    if (loginLat != null) localStorage.setItem(LAT_KEY, String(loginLat));
    else localStorage.removeItem(LAT_KEY);
    if (loginLng != null) localStorage.setItem(LNG_KEY, String(loginLng));
    else localStorage.removeItem(LNG_KEY);
    setToken(t);
    setNama(n);
    setPetugasId(id);
    setIsPml(loginIsPml);
    setLat(loginLat);
    setLng(loginLng);
  }

  function handleLogout() {
    clearToken();
    setToken(null);
    setNama(null);
    setPetugasId(null);
    setIsPml(false);
    setLat(null);
    setLng(null);
  }

  function handleLokasiUpdated(newLat: number, newLng: number) {
    localStorage.setItem(LAT_KEY, String(newLat));
    localStorage.setItem(LNG_KEY, String(newLng));
    setLat(newLat);
    setLng(newLng);
  }

  if (!checkedStorage) return null;

  if (!token || !petugasId) {
    return <LoginForm onLoggedIn={handleLoggedIn} />;
  }

  return (
    <PenyisiranPanel
      token={token}
      nama={nama || ""}
      petugasId={petugasId}
      isPml={isPml}
      petugasLat={lat}
      petugasLng={lng}
      onLokasiUpdated={handleLokasiUpdated}
      onSessionExpired={handleLogout}
      onLogout={handleLogout}
    />
  );
}

// Form login personal (nama + tanggal lahir) -- pola & endpoint datalist
// SAMA PERSIS dgn app/penyisiran/identifikasi-jorong.tsx (jorong-names
// mengambil dari tabel petugas_penyisiran_akun yg sama, jadi endpoint itu
// dipakai bersama di sini, bukan endpoint baru).
function LoginForm({
  onLoggedIn,
}: {
  onLoggedIn: (
    token: string,
    nama: string,
    petugasId: number,
    lat: number | null,
    lng: number | null,
    isPml: boolean
  ) => void;
}) {
  const [namaOptions, setNamaOptions] = useState<string[]>([]);
  const [namaInput, setNamaInput] = useState("");
  const [tanggalLahir, setTanggalLahir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/penyisiran/jorong-names")
      .then((r) => r.json())
      .then((d) => setNamaOptions(Array.isArray(d?.names) ? d.names : []))
      .catch(() => setNamaOptions([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!namaInput.trim() || !tanggalLahir) {
      setError("Isi nama lengkap dan tanggal lahir.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/penyisiran/penyisiran-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama: namaInput, tanggal_lahir: tanggalLahir }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Login gagal.");
        return;
      }
      onLoggedIn(data.token, data.nama, data.petugas_id, data.lat ?? null, data.lng ?? null, Boolean(data.is_pml));
    } catch {
      setError("Gagal terhubung. Periksa koneksi internet.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm rounded-lg border border-line bg-white p-5 text-center">
      <p className="text-sm font-semibold text-navy-900">Lembar Pengecekan Penyisiran Usaha</p>
      <p className="mt-1 text-xs text-ink/60">
        Berisi nama kepala keluarga, alamat, dan koordinat lokasi warga -- masukkan nama lengkap dan tanggal lahir
        Anda sebagai petugas penyisiran. Setelah berhasil, Anda tidak perlu login ulang besok.
      </p>
      <form onSubmit={handleSubmit} className="mt-3 space-y-2 text-left">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink/60">Nama Lengkap</label>
          <input
            list="nama-petugas-penyisiran-usaha-options"
            type="text"
            value={namaInput}
            onChange={(e) => setNamaInput(e.target.value)}
            placeholder="Ketik nama lengkap Anda"
            autoFocus
            autoComplete="off"
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
          <datalist id="nama-petugas-penyisiran-usaha-options">
            {namaOptions.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-ink/60">Tanggal Lahir</label>
          <input
            type="date"
            value={tanggalLahir}
            onChange={(e) => setTanggalLahir(e.target.value)}
            className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-navy-400 focus:ring-1 focus:ring-navy-400"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-900 disabled:opacity-60"
        >
          {loading ? "Memeriksa..." : "Masuk"}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-rust-700">{error}</p>}
    </div>
  );
}

function PenyisiranPanel({
  token,
  nama,
  petugasId,
  isPml,
  petugasLat,
  petugasLng,
  onLokasiUpdated,
  onSessionExpired,
  onLogout,
}: {
  token: string;
  nama: string;
  petugasId: number;
  isPml: boolean;
  petugasLat: number | null;
  petugasLng: number | null;
  onLokasiUpdated: (lat: number, lng: number) => void;
  onSessionExpired: () => void;
  onLogout: () => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [nagariOptions, setNagariOptions] = useState<KecOption[]>([]);
  const [subslsOptions, setSubslsOptions] = useState<SubslsOption[]>([]);
  const [filterKec, setFilterKec] = useState("");
  const [filterNagari, setFilterNagari] = useState("");
  const [filterSubsls, setFilterSubsls] = useState(""); // idsubsls, mis. "JORONG USAK-01"
  const [filterStatus, setFilterStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [markers, setMarkers] = useState<MarkerRow[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [editAllMode, setEditAllMode] = useState(false);
  const [lokasiStatus, setLokasiStatus] = useState<string | null>(null);
  const [lokasiBusy, setLokasiBusy] = useState(false);
  // Modal daftar "Dijadwalkan Besok" -- dibuka dari klik StatTile terkait
  // (lihat ModalRencanaBesok di bawah).
  const [showRencanaBesok, setShowRencanaBesok] = useState(false);
  // Peta tampil COMPACT (bukan lagi setengah layar) begitu halaman
  // dibuka, tapi bisa digulung ke atas (disembunyikan) supaya daftar
  // keluarga bisa memakai lebar penuh saat peta sedang tidak dibutuhkan.
  const [mapVisible, setMapVisible] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>("default");
  // Mode kartu: RINGKAS (default, cocok utk mencari & berpindah sampel)
  // vs DETAIL (utk mendata/QC) -- disimpan sbg SET kode_identitas yg
  // sedang dalam mode Detail, bukan boolean per-kartu tersendiri, supaya
  // tombol global "Semua Ringkas"/"Semua Detail" gampang diterapkan (isi
  // penuh utk "Semua Detail", kosongkan utk "Semua Ringkas").
  const [detailIds, setDetailIds] = useState<Set<string>>(new Set());
  function toggleDetail(id: string) {
    setDetailIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  // "Sampel Terdekat": kode_identitas yg DISEMBUNYIKAN SEMENTARA dari
  // daftar (mis. petugas sudah menuju ke sana / tidak relevan sekarang)
  // supaya kandidat berikutnya naik peringkat -- murni di memori, tombol
  // "Reset" mengosongkan set ini lagi. `highlightId` dipakai memberi
  // sorotan singkat pada kartu yg baru saja ditunjuk dari daftar ini.
  const [dismissedTerdekatIds, setDismissedTerdekatIds] = useState<Set<string>>(new Set());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  // Klik satu baris di panel "Sampel Terdekat" -> buka kartunya ke mode
  // Detail (spy langsung bisa didata) & scroll halaman ke kartu tsb,
  // dgn sorotan singkat supaya jelas kartu MANA yg dimaksud.
  function handleKlikSampelTerdekat(kode: string) {
    setDetailIds((prev) => {
      const next = new Set(prev);
      next.add(kode);
      return next;
    });
    setHighlightId(kode);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightId((cur) => (cur === kode ? null : cur)), 2500);
    // Double rAF: tunggu React selesai merender kartu dlm mode Detail
    // (tingginya berubah) dulu sebelum scrollIntoView, spy posisi akhirnya
    // pas (bukan posisi sblm kartu melebar).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(`kartu-penyisiran-${kode}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  function handleHapusSampelTerdekat(kode: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDismissedTerdekatIds((prev) => new Set(prev).add(kode));
  }

  function handleResetSampelTerdekat() {
    setDismissedTerdekatIds(new Set());
  }

  const pageSize = 200;

  // ---------- Live Distance Tracking ----------
  // Lokasi PENGGUNA SAAT INI (BEDA dari "lokasi rumah" petugasLat/Lng di
  // atas, yang dipakai skor prioritas & disimpan permanen ke DB) --
  // dipakai utk navigasi lapangan real-time: jarak tiap kartu & urutan
  // "Sampel Terdekat" ikut berubah otomatis begitu petugas berpindah,
  // tanpa reload halaman & tanpa disimpan ke mana pun (murni di memori
  // browser, hilang begitu tab ditutup -- sengaja, krn ini posisi
  // SEMENTARA saat menyisir, bukan lokasi permanen).
  const [liveLoc, setLiveLoc] = useState<UserLocation | null>(null);
  const [liveStatus, setLiveStatus] = useState<"idle" | "searching" | "active" | "error">("idle");
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  // Tick paksa re-render tiap 5 detik HANYA supaya teks "Diperbarui X
  // detik lalu" tetap segar walau tidak ada koordinat GPS baru masuk --
  // tidak menyentuh data apa pun.
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  // Bersihkan watchPosition begitu komponen dilepas (pindah tab/keluar) --
  // mencegah memory leak & baterai HP terus terpakai di background.
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null && typeof navigator !== "undefined" && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  function handleAktifkanLokasiLive() {
    if (!("geolocation" in navigator)) {
      setLiveStatus("error");
      setLiveError("Browser ini tidak mendukung deteksi lokasi.");
      return;
    }
    setLiveStatus("searching");
    setLiveError(null);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setLiveLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null });
        setLiveStatus("active");
        setLiveUpdatedAt(Date.now());
        setLiveError(null);
      },
      (err) => {
        setLiveStatus("error");
        setLiveError(err.message || "Lokasi tidak tersedia.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    watchIdRef.current = id;
  }

  function handleNonaktifkanLokasiLive() {
    if (watchIdRef.current != null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    setLiveStatus("idle");
    setLiveLoc(null);
    setLiveUpdatedAt(null);
    setLiveError(null);
  }

  // Lokasi live sekarang AKTIF OTOMATIS begitu tab ini dibuka (atas
  // permintaan user, menggantikan tombol "📍 Gunakan Lokasi Saya" yang
  // sebelumnya wajib ditekan manual tiap kali) -- HANYA dijalankan SEKALI
  // saat komponen ini mount (dependency [] sengaja kosong, bukan lupa).
  // Browser TETAP akan menampilkan izin lokasi native 1x (kalau belum
  // pernah diizinkan sebelumnya/baru di-reset) -- itu aturan keamanan
  // browser, tidak bisa dilewati siapa pun, bukan batasan aplikasi ini.
  // Kalau izin sudah pernah diberikan sebelumnya, lokasi langsung aktif
  // tanpa konfirmasi apa pun. Tombol "📍 Gunakan Lokasi Saya"/"Nonaktifkan"
  // di bawah TETAP ada sbg kendali manual (mis. kalau petugas sengaja
  // menonaktifkan, atau deteksi otomatis gagal & perlu dicoba ulang).
  useEffect(() => {
    handleAktifkanLokasiLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Jarak dari lokasi LIVE (bukan lokasi rumah) ke satu keluarga -- null
  // kalau lokasi live belum aktif atau keluarganya tidak punya koordinat.
  function jarakLiveRow(row: Row): number | null {
    if (!liveLoc || row.lat == null || row.lng == null) return null;
    return jarakKm(liveLoc.lat, liveLoc.lng, row.lat, row.lng);
  }

  const guard = useCallback(
    (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
          clearToken();
          onSessionExpired();
        } else {
          setErrMsg(msg);
        }
      }
    },
    [onSessionExpired]
  );

  const loadSummary = useCallback(async () => {
    try {
      const data = await apiFetch("/api/penyisiran/summary", token);
      setSummary(data);
    } catch (e) {
      guard(() => {
        throw e;
      });
    }
  }, [token, guard]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Tombol "Tetapkan Lokasi Rumah Saya" -- dipilih SENDIRI oleh petugas yg
  // SEDANG LOGIN lewat Geolocation API browser (tidak dikumpulkan manual),
  // disimpan ke petugas_penyisiran_akun.lat/lng lewat
  // /api/penyisiran/set-lokasi-rumah. petugasId sudah pasti ada di sini
  // krn PenyisiranUsahaTab tidak merender panel ini sebelum login sukses.
  function handleTetapkanLokasi() {
    if (!("geolocation" in navigator)) {
      setLokasiStatus("Browser ini tidak mendukung deteksi lokasi.");
      return;
    }
    setLokasiBusy(true);
    setLokasiStatus(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await apiFetch("/api/penyisiran/set-lokasi-rumah", token, {
            method: "PATCH",
            body: JSON.stringify({ petugas_id: petugasId, lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
          onLokasiUpdated(pos.coords.latitude, pos.coords.longitude);
          setLokasiStatus("✓ Lokasi rumah tersimpan.");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setLokasiStatus(`Gagal: ${msg}`);
        } finally {
          setLokasiBusy(false);
        }
      },
      (err) => {
        setLokasiStatus(`Gagal mengambil lokasi: ${err.message}`);
        setLokasiBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  // `petugasLat`/`petugasLng` != null berarti akun ini SUDAH punya lokasi
  // rumah tersimpan (baik dari login sebelumnya yg sudah pernah menekan
  // tombol, maupun dari auto-isi kantor di bawah) -- dipakai sbg syarat
  // wajib sebelum filter Kecamatan/pencarian & peta/daftar bisa dipakai,
  // krn jarak dari lokasi INI yg menentukan skor prioritas (BEDA dari
  // lokasi live di atas, yg cuma utk navigasi & TIDAK memengaruhi skor).
  const lokasiRumahSiap = petugasLat != null && petugasLng != null;

  // Auto-isi lokasi rumah dgn koordinat KANTOR BPS Kab Solok utk nama2 di
  // NAMA_PAKAI_KANTOR (pegawai kantor, bukan petugas lapangan) -- supaya
  // mereka TIDAK wajib menekan tombol "Tetapkan Lokasi Rumah Saya" spt
  // petugas lapangan lainnya. HANYA jalan kalau akunnya belum punya
  // koordinat sama sekali (lokasiRumahSiap masih false); begitu berhasil
  // (atau kalau sebelumnya sudah pernah diisi dgn cara apa pun), efek ini
  // tidak jalan lagi -- pola persis sama dgn handleTetapkanLokasi (simpan
  // permanen ke petugas_penyisiran_akun.lat/lng), cuma dipicu otomatis via
  // useEffect, bukan klik tombol, & pakai koordinat kantor bukan GPS.
  const autoLokasiTriedRef = useRef(false);
  useEffect(() => {
    if (lokasiRumahSiap) return;
    if (!NAMA_PAKAI_KANTOR.has(nama.trim().toLowerCase())) return;
    if (autoLokasiTriedRef.current) return;
    autoLokasiTriedRef.current = true;
    apiFetch("/api/penyisiran/set-lokasi-rumah", token, {
      method: "PATCH",
      body: JSON.stringify({ petugas_id: petugasId, lat: KANTOR_LAT, lng: KANTOR_LNG }),
    })
      .then(() => onLokasiUpdated(KANTOR_LAT, KANTOR_LNG))
      .catch(() => {
        // Gagal diam2 -- tombol manual tetap tersedia sbg cadangan.
        autoLokasiTriedRef.current = false;
      });
  }, [lokasiRumahSiap, nama, petugasId, token, onLokasiUpdated]);

  // debounce pencarian teks
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setFilterNagari("");
    if (!filterKec) {
      setNagariOptions([]);
      return;
    }
    apiFetch(`/api/penyisiran/nagari?kec=${encodeURIComponent(filterKec)}`, token)
      .then(setNagariOptions)
      .catch((e) => guard(() => { throw e; }));
  }, [filterKec, token, guard]);

  // Dropdown filter tahap 3: Sub SLS (mis. "JORONG USAK-01") -- baru bisa
  // dipilih setelah kecamatan & nagari dipilih. WAJIB kirim kec+nagari
  // sekaligus (lihat komentar di app/api/penyisiran/subsls/route.ts).
  useEffect(() => {
    setFilterSubsls("");
    if (!filterKec || !filterNagari) {
      setSubslsOptions([]);
      return;
    }
    apiFetch(
      `/api/penyisiran/subsls?kec=${encodeURIComponent(filterKec)}&nagari=${encodeURIComponent(filterNagari)}`,
      token
    )
      .then(setSubslsOptions)
      .catch((e) => guard(() => { throw e; }));
  }, [filterKec, filterNagari, token, guard]);

  // Wajib lokasi rumah SUDAH tersimpan (lokasiRumahSiap) SEBELUM filter
  // Kecamatan/pencarian bisa dipakai sama sekali -- lihat komentar
  // lokasiRumahSiap di atas & banner peringatan di JSX (dekat filter bar).
  //
  // "📍 Gunakan Lokasi Saya" (lokasi LIVE, liveStatus) SEKARANG AKTIF
  // OTOMATIS begitu tab ini dibuka (lihat useEffect handleAktifkanLokasiLive
  // di atas) -- BEDA dari lokasi rumah (ditetapkan SEKALI, permanen) di
  // atas, lokasi live ini tetap diaktifkan ULANG tiap kali buka tab (state-
  // nya murni di memori, hilang begitu tab ditutup/reload, lihat komentar
  // liveLoc), cuma sekarang TANPA perlu tekan tombol manual. Dicek lewat
  // liveSiap (bukan langsung liveLoc/liveStatus) supaya gampang dipakai
  // ulang di beberapa tempat (disabled input, pesan banner) tanpa mengetik
  // ulang kondisinya.
  const liveSiap = liveStatus === "active";
  const bisaMuat = lokasiRumahSiap && liveSiap && Boolean(filterKec || search);

  // Dipakai 3x di JSX di bawah (dekat filter bar + 2x diulang di bagian
  // paling bawah halaman) -- diekstrak jadi satu variabel supaya teksnya
  // konsisten & padam otomatis di ketiga tempat sekaligus begitu liveSiap
  // true. SEKARANG cuma tampil kalau deteksi otomatis GAGAL/ditolak
  // (liveStatus "error", mis. izin lokasi diblokir di browser) -- bukan lagi
  // "wajib tekan tombol" krn lokasi live sudah aktif sendiri saat tab
  // dibuka (lihat useEffect di atas). Saat masih "searching" (baru mulai
  // mendeteksi) TIDAK ditampilkan sbg warning, cukup indikator status di
  // kartu "Live Distance Tracking" di bawah.
  const peringatanLokasiLive =
    lokasiRumahSiap && liveStatus === "error" ? (
      <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">
        ⚠ Lokasi langsung gagal terdeteksi otomatis{liveError ? ` (${liveError})` : ""} -- izinkan akses lokasi utk
        situs ini di pengaturan browser, lalu tekan{" "}
        <span className="font-semibold">📍 Gunakan Lokasi Saya</span> pada bagian di bawah utk mencoba lagi.
        Kecamatan / pencarian data tidak bisa dipakai sebelum lokasi ini aktif.
      </p>
    ) : null;

  const loadList = useCallback(async () => {
    if (!bisaMuat) {
      setRows([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setErrMsg(null);
    try {
      const sp = new URLSearchParams();
      if (filterKec) sp.set("kec", filterKec);
      if (filterNagari) sp.set("nagari", filterNagari);
      if (filterSubsls) sp.set("subsls", filterSubsls);
      if (filterStatus) sp.set("status", filterStatus);
      if (search) sp.set("q", search);
      sp.set("page", String(page));
      const data = await apiFetch(`/api/penyisiran/list?${sp.toString()}`, token);
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) {
      guard(() => {
        throw e;
      });
    } finally {
      setLoading(false);
    }
  }, [bisaMuat, filterKec, filterNagari, filterSubsls, filterStatus, search, page, token, guard]);

  useEffect(() => {
    setPage(1);
  }, [filterKec, filterNagari, filterSubsls, filterStatus, search]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const loadMarkers = useCallback(async () => {
    if (!filterKec) {
      setMarkers([]);
      return;
    }
    try {
      const sp = new URLSearchParams({ kec: filterKec });
      if (filterNagari) sp.set("nagari", filterNagari);
      if (filterSubsls) sp.set("subsls", filterSubsls);
      if (filterStatus) sp.set("status", filterStatus);
      const data = await apiFetch(`/api/penyisiran/markers?${sp.toString()}`, token);
      setMarkers(data.markers);
    } catch (e) {
      guard(() => {
        throw e;
      });
    }
  }, [filterKec, filterNagari, filterSubsls, filterStatus, token, guard]);

  useEffect(() => {
    loadMarkers();
  }, [loadMarkers]);

  function refreshAfterEdit(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.kode_identitas === id ? { ...r, ...patch } : r)));
    loadSummary();
    loadMarkers();
  }

  // Peta idsubsls -> jumlah keluarga dgn idsubsls yg sama di daftar yg
  // SEDANG DIMUAT (rows) -- dasar hitungan skor "pengelompokan Sub SLS"
  // di hitungSkorPrioritas(). Cuma sebatas halaman/filter aktif, bukan
  // hitungan global se-kabupaten (lihat komentar di hitungSkorPrioritas).
  const jumlahDiSubslsMap = new Map<string, number>();
  for (const r of rows) {
    if (r.idsubsls) jumlahDiSubslsMap.set(r.idsubsls, (jumlahDiSubslsMap.get(r.idsubsls) ?? 0) + 1);
  }
  const maxJumlahDiSubsls = Math.max(1, ...jumlahDiSubslsMap.values());

  // Skor prioritas SATU keluarga -- dipakai HANYA utk mengurutkan daftar
  // (dropdown "Urutkan"). RowCard tetap menghitung skornya sendiri secara
  // live saat sedang diedit (lihat hitungSkorPrioritas di dalam RowCard);
  // fungsi ini cuma versi "nilai tersimpan saat ini" spy daftar bisa
  // diurutkan tanpa perlu tiap kartu melaporkan skornya ke atas.
  function skorRow(row: Row): number {
    const jarakRumah =
      petugasLat != null && petugasLng != null && row.lat != null && row.lng != null
        ? jarakKm(petugasLat, petugasLng, row.lat, row.lng)
        : null;
    return hitungSkorPrioritas(row, row.idsubsls ? jumlahDiSubslsMap.get(row.idsubsls) ?? 1 : 1, maxJumlahDiSubsls, {
      pasti: row.prioritas_pasti,
      jarakKm: jarakRumah,
    }).skor;
  }

  // Pengurutan CUMA sebatas halaman yg sedang dimuat (rows, maks 200
  // baris/halaman -- sama spt batasan hitungan klaster Sub SLS di
  // hitungSkorPrioritas), bukan pengurutan global se-kabupaten. Baris
  // tanpa koordinat/lokasi live selalu diletakkan di BELAKANG saat
  // diurutkan berdasar jarak (bukan dianggap jarak 0).
  const rowsSorted =
    sortBy === "default"
      ? rows
      : rows
          .map((r) => ({ r, jarak: jarakLiveRow(r), skor: skorRow(r) }))
          .sort((a, b) => {
            if (sortBy === "jarak_asc" || sortBy === "jarak_terjauh") {
              if (a.jarak == null && b.jarak == null) return 0;
              if (a.jarak == null) return 1;
              if (b.jarak == null) return -1;
              return sortBy === "jarak_asc" ? a.jarak - b.jarak : b.jarak - a.jarak;
            }
            return sortBy === "prioritas_desc" ? b.skor - a.skor : a.skor - b.skor;
          })
          .map((x) => x.r);

  // "Sampel Terdekat" -- 3 keluarga terdekat dari lokasi LIVE, dihitung
  // dari daftar yg sedang dimuat (rows), diperbarui otomatis tiap
  // koordinat GPS berubah krn liveLoc ikut jadi dependency render ini.
  // Kandidat yg ada di dismissedTerdekatIds SENGAJA dikecualikan dulu
  // sblm diambil top-3, supaya kandidat berikutnya otomatis naik
  // peringkat -- baris keluarganya TETAP ada di daftar utama, cuma
  // disembunyikan dari panel ringkasan ini saja.
  const sampelTerdekat = liveLoc
    ? rows
        .map((r) => ({ r, jarak: jarakLiveRow(r) }))
        .filter(
          (x): x is { r: Row; jarak: number } =>
            x.jarak != null && !dismissedTerdekatIds.has(x.r.kode_identitas)
        )
        .sort((a, b) => a.jarak - b.jarak)
        .slice(0, 3)
    : [];

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="text-base font-bold text-navy-900 sm:text-lg">
          Lembar Pengecekan Penyisiran Undercoverage Usaha
        </h1>
        <button
          onClick={() => setShowUpload((v) => !v)}
          className="shrink-0 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-navy-700 hover:border-navy-400"
        >
          {showUpload ? "Tutup" : "⬆ Unggah Data"}
        </button>
      </div>

      {/* Identitas petugas yg sedang login (personal, bukan lagi dropdown)
          + tombol tetapkan lokasi rumah utk skor prioritas berbasis jarak. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
        <span className="text-xs text-ink/60">
          Masuk sebagai <span className="font-semibold text-navy-900">{nama}</span>
        </span>
        <button
          type="button"
          onClick={handleTetapkanLokasi}
          disabled={lokasiBusy}
          className="rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-navy-700 hover:border-navy-400 disabled:opacity-50"
        >
          {lokasiBusy ? "Mendeteksi..." : "📍 Tetapkan Lokasi Rumah Saya"}
        </button>
        {lokasiRumahSiap ? (
          <span className="text-[11px] text-moss-700">✓ Lokasi rumah sudah ditetapkan</span>
        ) : (
          <span className="text-[11px] font-medium text-rust-700">⚠ Wajib ditekan dulu sebelum bisa memuat daftar</span>
        )}
        {lokasiStatus && <span className="text-[11px] text-ink/50">{lokasiStatus}</span>}
        <button
          type="button"
          onClick={onLogout}
          className="ml-auto rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink/50 hover:border-navy-400"
        >
          Keluar
        </button>
      </div>

      {!lokasiRumahSiap && (
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">
          ⚠ Tekan dulu tombol <span className="font-semibold">📍 Tetapkan Lokasi Rumah Saya</span> di atas sebelum
          bisa memilih Kecamatan / mencari data. Jarak dari lokasi rumah ke tiap keluarga dipakai untuk menghitung
          skala prioritas -- cukup ditekan SEKALI, tidak perlu diulang tiap kali masuk. Lokasi langsung/live (📍
          <span className="font-semibold"> Gunakan Lokasi Saya</span>, beda kegunaan -- utk navigasi real-time,
          tidak memengaruhi skala prioritas) akan otomatis aktif sendiri begitu tab ini dibuka, cek bagian "Live
          Distance Tracking" di bawah kalau belum menyala.
        </p>
      )}
      {/* Lokasi rumah SUDAH siap tapi lokasi LIVE belum aktif -- banner
          TERPISAH (bukan digabung ke atas) supaya pesannya selalu pas dgn
          syarat yang MASIH kurang, krn dua syarat ini dicek & diaktifkan
          lewat tombol yang berbeda (lihat liveSiap). Diekstrak ke variabel
          `peringatanLokasiLive` (bukan cuma inline di sini) supaya bisa
          DIULANG lagi 2x di bagian PALING BAWAH halaman (permintaan user
          supaya lebih kelihatan/"ngeh") tanpa menyalin JSX-nya 3x -- padam
          otomatis di ketiga tempat begitu liveSiap jadi true. */}
      {peringatanLokasiLive}

      {/* ---------- Live Distance Tracking: status lokasi saat ini ---------- */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-medium ${
            liveStatus === "active"
              ? "text-moss-700"
              : liveStatus === "searching"
              ? "text-[#8A6A12]"
              : liveStatus === "error"
              ? "text-rust-700"
              : "text-ink/50"
          }`}
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{
              backgroundColor:
                liveStatus === "active"
                  ? "#0ca30c"
                  : liveStatus === "searching"
                  ? "#fab219"
                  : liveStatus === "error"
                  ? "#d03b3b"
                  : "#9ca3af",
            }}
          />
          {liveStatus === "active" && "Lokasi Anda terdeteksi"}
          {liveStatus === "searching" && "Mencari lokasi..."}
          {liveStatus === "error" && "Lokasi tidak tersedia"}
          {liveStatus === "idle" && "Lokasi langsung belum aktif"}
        </span>
        {liveStatus === "active" && liveUpdatedAt != null && (
          <span className="text-[11px] text-ink/40">{formatDetikLalu(liveUpdatedAt)}</span>
        )}
        {liveError && liveStatus === "error" && <span className="text-[11px] text-rust-700">{liveError}</span>}
        {liveStatus === "active" || liveStatus === "searching" ? (
          <button
            type="button"
            onClick={handleNonaktifkanLokasiLive}
            className="ml-auto rounded-md border border-rust-100 bg-white px-2.5 py-1.5 text-xs font-medium text-rust-700 hover:border-rust-700"
          >
            Nonaktifkan
          </button>
        ) : (
          <button
            type="button"
            onClick={handleAktifkanLokasiLive}
            className="ml-auto rounded-md bg-navy-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-navy-900"
          >
            📍 Gunakan Lokasi Saya
          </button>
        )}
      </div>

      {/* "Sampel Terdekat" -- ringkasan 3 keluarga terdekat dari lokasi
          LIVE, ikut berubah otomatis begitu petugas berpindah. Klik satu
          baris -> lompat & sorot kartunya (lihat handleKlikSampelTerdekat).
          Tombol "✕" menyembunyikan SEMENTARA kandidat itu dari panel ini
          saja (bukan dari daftar utama) supaya kandidat berikutnya naik;
          "Reset" mengembalikan semuanya. */}
      {(sampelTerdekat.length > 0 || dismissedTerdekatIds.size > 0) && (
        <div className="rounded-lg border border-line bg-white p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-navy-900">📍 Sampel Terdekat</p>
            {dismissedTerdekatIds.size > 0 && (
              <button
                type="button"
                onClick={handleResetSampelTerdekat}
                className="text-[11px] font-medium text-navy-400 underline hover:text-navy-700"
              >
                Reset ({dismissedTerdekatIds.size})
              </button>
            )}
          </div>
          {sampelTerdekat.length === 0 ? (
            <p className="text-[11px] text-ink/40">
              Semua kandidat terdekat sedang disembunyikan sementara -- tekan Reset utk memunculkan kembali.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {sampelTerdekat.map((x, i) => (
                <div
                  key={x.r.kode_identitas}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleKlikSampelTerdekat(x.r.kode_identitas)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleKlikSampelTerdekat(x.r.kode_identitas);
                  }}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-md p-1 text-xs hover:bg-paper"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-100 text-[10px] font-bold text-navy-700">
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-navy-900" title={namaTampilRow(x.r)}>
                        {namaTampilRow(x.r)}
                      </span>
                      <span className="block text-[10px] text-ink/40">{x.r.kode_identitas}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="font-semibold text-navy-700">{x.jarak.toFixed(1)} km</span>
                    <button
                      type="button"
                      onClick={(e) => handleHapusSampelTerdekat(x.r.kode_identitas, e)}
                      title="Sembunyikan sementara dari daftar ini"
                      className="flex h-5 w-5 items-center justify-center rounded-full text-ink/30 hover:bg-rust-100 hover:text-rust-700"
                    >
                      ✕
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {errMsg && (
        <p className="rounded-lg border border-rust-100 bg-rust-100/40 p-3 text-xs text-rust-700">⚠ {errMsg}</p>
      )}

      {showUpload && <UploadPanel token={token} onDone={() => { loadSummary(); loadList(); loadMarkers(); }} onSessionExpired={onSessionExpired} />}

      {/* ---------- Stat tiles ---------- */}
      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          <StatTile label="Total Keluarga" value={summary.total} color="#41547E" />
          <StatTile label={STATUS_META.belum.label} value={summary.belum} color={STATUS_META.belum.dot} />
          {/* "Usaha Ditemukan" diganti scoped HARI INI (atas permintaan) --
              summary.ditemukan (akumulatif) TIDAK dipakai lagi di sini,
              lihat ditemukan_hari_ini/ditemukan_at di migrasi
              20260920_penyisiran_jadwalkan_besok.sql. */}
          <StatTile
            label="Usaha Ditemukan Hari Ini"
            value={summary.ditemukan_hari_ini}
            color={STATUS_META.ditemukan.dot}
          />
          {/* Kartu "Usaha Tidak Ditemukan" DIGANTI (atas permintaan) jadi
              jumlah KK yang sudah dijadwalkan BESOK -- bisa diklik utk
              buka modal daftar (nama + kode SLS 16 digit), lihat
              ModalRencanaBesok & /api/penyisiran/rencana-besok. */}
          <StatTile
            label="📅 Dijadwalkan Besok"
            value={summary.direncanakan_besok}
            color={STATUS_META.jadwalkan_besok.dot}
            onClick={() => setShowRencanaBesok(true)}
          />
          <StatTile
            label={STATUS_META.sudah_didata_se2026.label}
            value={summary.sudah_didata_se2026}
            color={STATUS_META.sudah_didata_se2026.dot}
          />
          {/* Kartu "Tidak Bisa Ditemui / Pindah" SENGAJA disembunyikan di
              tampilan HP (grid 2 kolom, layar sempit) atas permintaan --
              tetap tampil di layar lebar (sm: ke atas, grid 6 kolom) spy
              datanya tidak hilang total dari monitoring. Statusnya sendiri
              sudah tidak bisa dipilih lagi lewat dropdown (lihat
              STATUS_PILIHAN), jadi angka ini beku di data lama. */}
          <StatTile
            label={STATUS_META.tidak_bisa.label}
            value={summary.tidak_bisa}
            color={STATUS_META.tidak_bisa.dot}
            className="hidden sm:block"
          />
        </div>
      )}

      {showRencanaBesok && (
        <ModalRencanaBesok token={token} onClose={() => setShowRencanaBesok(false)} onSessionExpired={onSessionExpired} />
      )}

      {/* ---------- Filter ---------- */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
        <select
          value={filterKec}
          onChange={(e) => setFilterKec(e.target.value)}
          disabled={!lokasiRumahSiap || !liveSiap}
          title={
            !lokasiRumahSiap
              ? "Tetapkan lokasi rumah Anda dulu (lihat peringatan di atas)"
              : !liveSiap
              ? "Tekan dulu 📍 Gunakan Lokasi Saya (lihat peringatan di atas)"
              : undefined
          }
          className="rounded-md border border-line px-2 py-1.5 text-xs disabled:opacity-50"
        >
          <option value="">Pilih Kecamatan...</option>
          {(summary?.kecamatan ?? []).map((k) => (
            <option key={k.kode} value={k.kode}>
              {k.nama} ({k.jumlah})
            </option>
          ))}
        </select>
        <select
          value={filterNagari}
          onChange={(e) => setFilterNagari(e.target.value)}
          disabled={!filterKec}
          className="rounded-md border border-line px-2 py-1.5 text-xs disabled:opacity-50"
        >
          <option value="">Semua Nagari</option>
          {nagariOptions.map((n) => (
            <option key={n.kode} value={n.kode}>
              {n.nama} ({n.jumlah})
            </option>
          ))}
        </select>
        <select
          value={filterSubsls}
          onChange={(e) => setFilterSubsls(e.target.value)}
          disabled={!filterNagari}
          className="rounded-md border border-line px-2 py-1.5 text-xs disabled:opacity-50"
        >
          <option value="">Semua SLS / Sub SLS</option>
          {subslsOptions.map((s) => (
            <option key={s.idsubsls} value={s.idsubsls}>
              {s.label} ({s.jumlah})
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-line px-2 py-1.5 text-xs"
        >
          <option value="">Semua Status</option>
          {/* Disederhanakan jadi STATUS_PILIHAN (4) -- lihat komentarnya.
              Data lama berstatus "Tidak Ditemukan"/"Tidak Bisa" tetap
              MUNCUL di daftar (via "Semua Status"), cuma tidak lagi bisa
              difilter spesifik ke status itu lewat dropdown ini. */}
          {STATUS_PILIHAN.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          disabled={!lokasiRumahSiap || !liveSiap}
          title={
            !lokasiRumahSiap
              ? "Tetapkan lokasi rumah Anda dulu (lihat peringatan di atas)"
              : !liveSiap
              ? "Tekan dulu 📍 Gunakan Lokasi Saya (lihat peringatan di atas)"
              : undefined
          }
          placeholder="Cari nama / ID / alamat..."
          className="min-w-[160px] flex-1 rounded-md border border-line px-2 py-1.5 text-xs disabled:opacity-50"
        />
      </div>

      {/* Kalau lokasi rumah/lokasi live belum siap, banner peringatan di
          atas SUDAH menjelaskan sebabnya -- jadi pesan di sini sengaja
          HANYA muncul kalau KEDUANYA sudah siap tapi Kecamatan/pencarian
          belum diisi, supaya tidak dobel pesan. */}
      {lokasiRumahSiap && liveSiap && !bisaMuat && (
        <p className="rounded-lg border border-line bg-white p-4 text-center text-xs text-ink/50">
          Pilih kecamatan (atau ketik pencarian) dulu untuk menampilkan daftar &amp; peta.
        </p>
      )}

      {bisaMuat && (
        <>
          {/* ---------- Map -- COMPACT/floating (bukan lagi separuh
              layar), PERSIS di bawah baris filter/kolom cari, full-width,
              supaya langsung kelihatan begitu filter dipilih tapi tidak
              mendorong daftar keluarga jauh ke bawah. Tetap bisa
              disembunyikan spy tidak makan tempat kalau tidak dibutuhkan;
              live tracking & jarak pada daftar TETAP berjalan walau peta
              disembunyikan (state liveLoc ada di komponen induk, bukan di
              dalam blok ini). */}
          {mapVisible ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setMapVisible(false)}
                className="self-start rounded-md border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-navy-700 hover:border-navy-400"
              >
                ▲ Sembunyikan Peta
              </button>
              <div className="relative h-[24vh] max-h-[260px] min-h-[160px] overflow-hidden rounded-lg border border-line">
                <PenyisiranMap markers={markers} userLocation={liveLoc} onLihatDetail={handleKlikSampelTerdekat} />
              </div>
              {/* Legenda DIPINDAH ke LUAR peta (dulu melayang di atas
                  peta, menutupi sebagian tampilan) -- dibuat grid 3 kolom
                  spy SELALU cuma 2 baris (maks 5 item: 4 status + "Lokasi
                  Anda") apa pun lebar layarnya, tidak makan tempat. */}
              <div className="grid grid-cols-3 gap-x-2 gap-y-1 rounded-lg border border-line bg-white p-2 text-[10px] text-ink/70">
                {liveLoc && (
                  <div className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#2563eb]" />
                    <span className="truncate">Lokasi Anda</span>
                  </div>
                )}
                {(Object.keys(STATUS_META) as StatusKunjungan[]).map((s) => (
                  <div key={s} className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_META[s].dot }}
                    />
                    <span className="truncate">{STATUS_META[s].label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setMapVisible(true)}
              className="flex h-10 items-center justify-center rounded-lg border border-dashed border-line bg-white text-xs font-medium text-navy-700 hover:border-navy-400"
            >
              ▼ Tampilkan Peta
            </button>
          )}

          {/* ---------- List ---------- */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink/50">
              <span>{loading ? "Memuat..." : `${total} keluarga cocok filter ini`}</span>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex overflow-hidden rounded-md border border-line">
                  <button
                    type="button"
                    onClick={() => setDetailIds(new Set())}
                    className="px-2 py-1 text-xs font-medium text-navy-700 hover:bg-paper"
                  >
                    Semua Ringkas
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailIds(new Set(rowsSorted.map((r) => r.kode_identitas)))}
                    className="border-l border-line px-2 py-1 text-xs font-medium text-navy-700 hover:bg-paper"
                  >
                    Semua Detail
                  </button>
                </div>
                <label className="flex items-center gap-1.5">
                  Urutkan:
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortBy)}
                    className="rounded-md border border-line px-2 py-1 text-xs text-ink"
                  >
                    <option value="default">Default</option>
                    <option value="jarak_asc">Jarak terdekat</option>
                    <option value="jarak_terjauh">Jarak terjauh</option>
                    <option value="prioritas_desc">Prioritas tertinggi</option>
                    <option value="prioritas_asc">Prioritas terendah</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {rowsSorted.map((row) => (
                <RowCard
                  key={row.kode_identitas}
                  row={row}
                  token={token}
                  editAllMode={editAllMode}
                  isPml={isPml}
                  jumlahDiSubsls={row.idsubsls ? jumlahDiSubslsMap.get(row.idsubsls) ?? 1 : 1}
                  maxJumlahDiSubsls={maxJumlahDiSubsls}
                  petugasId={petugasId}
                  petugasNama={nama}
                  petugasLat={petugasLat}
                  petugasLng={petugasLng}
                  liveLat={liveLoc?.lat ?? null}
                  liveLng={liveLoc?.lng ?? null}
                  isDetail={detailIds.has(row.kode_identitas)}
                  onToggleDetail={() => toggleDetail(row.kode_identitas)}
                  highlighted={highlightId === row.kode_identitas}
                  onSaved={refreshAfterEdit}
                  onSessionExpired={onSessionExpired}
                />
              ))}
              {rows.length === 0 && !loading && (
                <p className="rounded-lg border border-line bg-white p-4 text-center text-xs text-ink/40">
                  Tidak ada keluarga untuk filter ini.
                </p>
              )}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 py-2 text-xs">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded border border-line px-2 py-1 disabled:opacity-40"
                >
                  ← Sebelumnya
                </button>
                <span>
                  Halaman {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded border border-line px-2 py-1 disabled:opacity-40"
                >
                  Berikutnya →
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Diulang 2x lagi di sini (paling bawah halaman) supaya kalau deteksi
          lokasi otomatis GAGAL (liveStatus "error"), petugas tetap ngeh
          walau sempat melewatkan banner yg di atas. Sama persis dgn banner
          di dekat filter bar (variabel peringatanLokasiLive) -- lihat
          komentar di sana, sekarang cuma tampil saat error (lokasi live
          normalnya aktif sendiri, tidak perlu banner "wajib tekan" lagi). */}
      {peringatanLokasiLive}
      {peringatanLokasiLive}

      {/* Tombol "Edit Semua" MELAYANG di pojok bawah halaman -- supaya
          selalu terjangkau tanpa perlu gulung ke atas dulu, terutama saat
          daftar keluarga panjang. Digeser ke bottom-16 (dari bottom-5) --
          FloatBarRencanaBesok BARU (app/penyisiran/page.tsx) melebar penuh
          di dasar layar jam 17:00 ke atas, supaya tombol ini tidak
          ketiban/ketutup bar itu. */}
      <button
        onClick={() => setEditAllMode((v) => !v)}
        className={`fixed bottom-16 right-5 z-40 rounded-full border px-4 py-2.5 text-xs font-semibold shadow-lg transition ${
          editAllMode
            ? "border-navy-700 bg-navy-700 text-white"
            : "border-line bg-white text-navy-700 hover:border-navy-400"
        }`}
      >
        {editAllMode ? "🔓 Edit Semua Aktif" : "🔒 Edit Semua Info Lapangan"}
      </button>
    </div>
  );
}

function StatTile({
  label,
  value,
  color,
  className,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  className?: string;
  // Kalau diisi, kartu dirender sbg <button> (bisa diklik, mis. StatTile
  // "📅 Dijadwalkan Besok" -> buka ModalRencanaBesok) -- kalau tidak,
  // tetap <div> biasa spt semula supaya kartu lain tidak ikut kelihatan
  // "clickable" tanpa alasan.
  onClick?: () => void;
}) {
  const isi = (
    <>
      <div className="text-lg font-bold text-navy-900">{value.toLocaleString("id-ID")}</div>
      <div className="mt-0.5 text-[11px] text-ink/60">{label}</div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-lg border border-line bg-white p-3 text-left transition hover:border-navy-400 hover:shadow-sm ${className ?? ""}`}
        style={{ borderLeft: `4px solid ${color}` }}
      >
        {isi}
      </button>
    );
  }
  return (
    <div
      className={`rounded-lg border border-line bg-white p-3 ${className ?? ""}`}
      style={{ borderLeft: `4px solid ${color}` }}
    >
      {isi}
    </div>
  );
}

// Modal daftar keluarga yg dijadwalkan BESOK -- dibuka dari StatTile "📅
// Dijadwalkan Besok". Tabel Nama Keluarga + Kode SLS (16 digit,
// idsubsls) sesuai permintaan, PLUS tombol "Salin sebagai Gambar" (pola
// SAMA PERSIS dgn salinSebagaiGambar() di app/penyisiran/perencanaan-
// lapangan.tsx -- html2canvas + Clipboard API dari elemen tersembunyi
// off-screen lebar tetap, fallback unduh file kalau clipboard image tidak
// didukung browser) supaya gampang ditempel ke grup WA.
// Diekspor (bukan lokal lagi) supaya bisa dipakai ULANG oleh
// FloatBarRencanaBesok (app/penyisiran/page.tsx) -- permintaan user: desain
// gambar "Kirim ke WA PML" di float bar bawah HARUS SAMA PERSIS dgn gambar
// modal ini (dinilai lebih bagus: ada subjudul Nagari/SLS di bawah nama +
// judul lengkap dgn tanggal), dan modal ini SENDIRI jg ikut terbuka (bukan
// cuma menyalin gambar diam2 di belakang layar) saat tombol itu ditekan --
// jadi float bar mengimpor komponen INI LANGSUNG (satu sumber desain),
// bukan menduplikasi markupnya sendiri.
export interface RencanaBesokRow {
  kode_identitas: string;
  idsubsls: string | null;
  nama_kk: string | null;
  nama_anggota_keluarga: string | null;
  nagari_nama: string | null;
  sls_nama: string | null;
  alamat: string | null;
}

export function ModalRencanaBesok({
  token,
  onClose,
  onSessionExpired,
}: {
  token: string;
  onClose: () => void;
  onSessionExpired: () => void;
}) {
  const [rows, setRows] = useState<RencanaBesokRow[] | null>(null);
  const [tanggal, setTanggal] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "done" | "error">("idle");
  const gambarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let batal = false;
    apiFetch("/api/penyisiran/rencana-besok", token)
      .then((data) => {
        if (batal) return;
        setRows(data.rows ?? []);
        setTanggal(data.tanggal ?? null);
      })
      .catch((e) => {
        if (batal) return;
        const msg = e instanceof Error ? e.message : String(e);
        if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
          clearToken();
          onSessionExpired();
          return;
        }
        setErrMsg(msg);
      });
    return () => {
      batal = true;
    };
  }, [token, onSessionExpired]);

  function tanggalLabel(): string {
    if (!tanggal) return "besok";
    // tanggal berformat "YYYY-MM-DD" (dari server, sudah dihitung WIB) --
    // parse manual (bukan `new Date(tanggal)`) supaya tidak kena geser
    // zona waktu browser pengguna.
    const [y, m, d] = tanggal.split("-").map(Number);
    if (!y || !m || !d) return tanggal;
    return new Date(y, m - 1, d).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  }

  async function salinSebagaiGambar() {
    if (!gambarRef.current) return;
    setCopyStatus("copying");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(gambarRef.current, { backgroundColor: "#ffffff", scale: 2 });
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setCopyStatus("error");
          return;
        }
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          setCopyStatus("done");
          setTimeout(() => setCopyStatus("idle"), 2500);
        } catch {
          // Fallback: unduh langsung kalau clipboard image tidak didukung browser.
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "rencana-kunjungan-besok.png";
          a.click();
          URL.revokeObjectURL(url);
          setCopyStatus("done");
          setTimeout(() => setCopyStatus("idle"), 2500);
        }
      }, "image/png");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-navy-900">📅 Dijadwalkan Besok</p>
            <p className="text-[11px] text-ink/50">Rencana kunjungan {tanggalLabel()}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-ink/40 hover:text-navy-700">
            ✕
          </button>
        </div>

        {errMsg && <p className="mb-2 rounded-lg border border-rust-100 bg-rust-100/40 p-2 text-xs text-rust-700">⚠ {errMsg}</p>}

        {rows === null && !errMsg && <p className="py-6 text-center text-xs text-ink/40">Memuat...</p>}

        {rows && rows.length === 0 && (
          <p className="py-6 text-center text-xs text-ink/40">Belum ada keluarga yang dijadwalkan besok.</p>
        )}

        {rows && rows.length > 0 && (
          <>
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={salinSebagaiGambar}
                disabled={copyStatus === "copying"}
                className="rounded-md border border-line bg-white px-2.5 py-1.5 text-[11px] font-medium text-navy-700 hover:border-navy-400 disabled:opacity-50"
              >
                {copyStatus === "copying"
                  ? "Menyalin..."
                  : copyStatus === "done"
                  ? "✓ Tersalin -- tempel ke WA"
                  : copyStatus === "error"
                  ? "Gagal, coba lagi"
                  : "📋 Salin sebagai Gambar (utk WA)"}
              </button>
            </div>
            {/* Render tabel DUA KALI: satu utk ditampilkan on-screen di
                dalam modal (bisa digulir), satu lagi TERSEMBUNYI off-screen
                dgn lebar tetap (dirujuk gambarRef) -- html2canvas butuh
                elemen dgn lebar KONSISTEN supaya hasil gambar tidak
                terpotong/berantakan mengikuti lebar modal yg responsif.
                Pola sama persis dgn GridAlokasiDanKuota di
                perencanaan-lapangan.tsx. */}
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="min-w-full text-xs">
                <TabelRencanaBesokHead />
                <tbody>
                  {rows.map((r) => (
                    <TabelRencanaBesokRow key={r.kode_identitas} row={r} />
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ position: "fixed", top: -99999, left: -99999, width: 640 }}>
              <div ref={gambarRef} className="bg-white p-4">
                <p className="mb-2 text-sm font-bold text-navy-900">
                  Rencana Kunjungan {tanggalLabel()} -- Penyisiran Undercoverage Usaha SE2026
                </p>
                <table className="w-full text-xs">
                  <TabelRencanaBesokHead />
                  <tbody>
                    {rows.map((r) => (
                      <TabelRencanaBesokRow key={r.kode_identitas} row={r} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function TabelRencanaBesokHead() {
  return (
    <thead>
      <tr className="border-b border-line bg-paper/60 text-left text-[10px] font-semibold uppercase tracking-wide text-ink/50">
        <th className="px-2 py-1.5">Nama Keluarga</th>
        <th className="px-2 py-1.5">Kode SLS (16 Digit)</th>
      </tr>
    </thead>
  );
}

export function TabelRencanaBesokRow({ row }: { row: RencanaBesokRow }) {
  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-2 py-1.5 font-medium text-navy-900">
        {namaTampilRow(row)}
        {(row.nagari_nama || row.sls_nama) && (
          <span className="block text-[10px] font-normal text-ink/40">
            {[row.nagari_nama, row.sls_nama].filter(Boolean).join(" · ")}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5 text-ink/70">{row.idsubsls || "-"}</td>
    </tr>
  );
}

function RowCard({
  row,
  token,
  editAllMode,
  isPml,
  jumlahDiSubsls,
  maxJumlahDiSubsls,
  petugasId,
  petugasNama,
  petugasLat,
  petugasLng,
  liveLat,
  liveLng,
  isDetail,
  onToggleDetail,
  highlighted,
  onSaved,
  onSessionExpired,
}: {
  row: Row;
  token: string;
  editAllMode: boolean;
  // true kalau akun yg login adalah PML (lihat IS_PML_KEY di atas) --
  // dropdown Status & input Catatan DIKUNCI (read-only), cuma "🎯 Tandai
  // Pasti" yg tetap bisa diubah (dikonfirmasi user: "PML ... hanya bisa
  // lihat dan bisa tandai pasti"). Pembatasan SEBENARNYA ada di server
  // (/api/penyisiran/update, lihat komentar di sana) -- penguncian di sini
  // murni UX supaya PML tidak mengira perubahannya tersimpan.
  isPml: boolean;
  jumlahDiSubsls: number;
  maxJumlahDiSubsls: number;
  petugasId: number | null;
  petugasNama: string | null;
  petugasLat: number | null;
  petugasLng: number | null;
  liveLat: number | null;
  liveLng: number | null;
  isDetail: boolean;
  onToggleDetail: () => void;
  // true sesaat (2.5 detik, lihat handleKlikSampelTerdekat di
  // PenyisiranPanel) setelah kartu ini dituju dari panel "Sampel
  // Terdekat" -- dipakai cuma utk sorotan ring visual sesaat, BUKAN
  // state yg disimpan/dipersist.
  highlighted: boolean;
  onSaved: (id: string, patch: Partial<Row>) => void;
  onSessionExpired: () => void;
}) {
  const [status, setStatus] = useState<StatusKunjungan>(row.status_kunjungan);
  const [catatan, setCatatan] = useState(row.catatan_petugas ?? "");
  const [infoPpl, setInfoPpl] = useState(row.info_ppl);
  const [infoJorong, setInfoJorong] = useState(row.info_jorong);
  const [infoTetangga, setInfoTetangga] = useState(row.info_tetangga);
  const [pastiFlag, setPastiFlag] = useState(row.prioritas_pasti);
  const [unlocked, setUnlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<"idle" | "ok" | "err">("idle");
  // "☎ Kontak PPL Wilayah Ini": nama + No HP PPL yg dulu dialokasikan ke
  // ID Sub SLS keluarga ini (tabel ppl_alokasi_idsls/ppl_akun) -- dimuat
  // ON DEMAND (baru fetch pas tombolnya ditekan pertama kali, lalu
  // di-cache di state ini) supaya tidak membebani daftar yg bisa ratusan
  // kartu. Namanya SENGAJA dibedakan dari "🕘 Riwayat Perubahan" di bawah
  // (timeline audit log) supaya dua fitur yg sekilas mirip ini tidak
  // tertukar.
  const [riwayatOpen, setRiwayatOpen] = useState(false);
  const [riwayatData, setRiwayatData] = useState<PplInfo[] | null>(null);
  const [riwayatLoading, setRiwayatLoading] = useState(false);
  const [riwayatErr, setRiwayatErr] = useState<string | null>(null);
  // "🕘 Riwayat Perubahan": timeline audit log (tabel penyisiran_riwayat)
  // -- siapa mengubah Status/Info Jorong/Info Tetangga/Identifikasi PPL,
  // kapan, dan dari sumber/akun mana. Sama pola dimuat ON DEMAND spt di
  // atas.
  const [perubahanOpen, setPerubahanOpen] = useState(false);
  const [perubahanData, setPerubahanData] = useState<RiwayatEntry[] | null>(null);
  const [perubahanLoading, setPerubahanLoading] = useState(false);
  const [perubahanErr, setPerubahanErr] = useState<string | null>(null);
  const canEditInfo = editAllMode || unlocked;
  // Kunci "sehari setelah didata" (permintaan user) -- lihat
  // terkunciSetelahHariBerganti() di atas utk aturan lengkapnya. Tombol
  // melayang "🔒 Edit Semua Info Lapangan" (editAllMode) SENGAJA tetap bisa
  // membuka kunci ini (dikirim ke server sbg edit_all, lihat handleSave)
  // -- bukan terkunci permanen tanpa jalan keluar.
  const terkunci = terkunciSetelahHariBerganti(row) && !editAllMode;
  const dirty =
    status !== row.status_kunjungan ||
    catatan !== (row.catatan_petugas ?? "") ||
    infoPpl !== row.info_ppl ||
    infoJorong !== row.info_jorong ||
    infoTetangga !== row.info_tetangga ||
    pastiFlag !== row.prioritas_pasti;
  const meta = STATUS_META[status];
  const identMeta = IDENTIFIKASI_META[row.identifikasi_ppl] ?? IDENTIFIKASI_META.belum;
  // Jarak rumah petugas yg SEDANG LOGIN (dropdown "Nama Anda") ke lokasi
  // sampel -- null kalau salah satu koordinatnya belum ada, sehingga skor
  // otomatis tidak kena potongan jarak (lihat hitungSkorPrioritas).
  const jarak =
    petugasLat != null && petugasLng != null && row.lat != null && row.lng != null
      ? jarakKm(petugasLat, petugasLng, row.lat, row.lng)
      : null;
  // Jarak LIVE (posisi GPS petugas SAAT INI, lihat "📍 Gunakan Lokasi
  // Saya" di PenyisiranPanel) -- BEDA dari `jarak` di atas (lokasi rumah
  // permanen, dipakai skor prioritas). Ini murni informasi navigasi utk
  // petugas di lapangan, tidak ikut memengaruhi skor prioritas.
  const jarakLive =
    liveLat != null && liveLng != null && row.lat != null && row.lng != null
      ? jarakKm(liveLat, liveLng, row.lat, row.lng)
      : null;
  // Pakai nilai Info PPL/Jorong/Tetangga & "Pasti" yg SEDANG diedit (bukan
  // cuma yg sudah tersimpan) -- supaya skornya langsung ikut naik/turun
  // begitu petugas mencentang, sebagai umpan balik instan sebelum ditekan
  // Simpan.
  const prioritas = hitungSkorPrioritas(
    { bukti_dutp: row.bukti_dutp, bukti_dtsen: row.bukti_dtsen, bukti_pnm: row.bukti_pnm, info_ppl: infoPpl, info_jorong: infoJorong, info_tetangga: infoTetangga },
    jumlahDiSubsls,
    maxJumlahDiSubsls,
    { pasti: pastiFlag, jarakKm: jarak }
  );
  const prioritasMeta = PRIORITAS_META[prioritas.tier];

  async function handleSave() {
    setSaving(true);
    try {
      await apiFetch("/api/penyisiran/update", token, {
        method: "PATCH",
        body: JSON.stringify({
          id: row.kode_identitas,
          status_kunjungan: status,
          catatan_petugas: catatan || null,
          info_ppl: infoPpl,
          info_jorong: infoJorong,
          info_tetangga: infoTetangga,
          prioritas_pasti: pastiFlag,
          petugas_id: petugasId,
          petugas_nama: petugasNama,
          edit_all: editAllMode,
        }),
      });
      setSaved("ok");
      onSaved(row.kode_identitas, {
        status_kunjungan: status,
        catatan_petugas: catatan,
        info_ppl: infoPpl,
        info_jorong: infoJorong,
        info_tetangga: infoTetangga,
        prioritas_pasti: pastiFlag,
        penyisiran_oleh: petugasNama ?? row.penyisiran_oleh,
      });
      // Beri tahu FloatBarRencanaBesok (app/penyisiran/page.tsx) supaya
      // langsung memuat ulang angka "Rencana Besok x/8" SAAT ITU JUGA
      // begitu ada kartu yang berubah status, bukan menunggu polling 30
      // detik -- ini memenuhi permintaan "status perubahan angka riil
      // time setiap ada kartu yang berubah menjadi direncanakan besok".
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("penyisiran:rencana-besok-changed"));
      }
      // Cukup 1x tindakan: begitu tersimpan, kunci lagi Info PPL/Jorong/
      // Tetangga & tampilkan lagi tombol "✎ Edit" -- supaya tidak
      // kepencet lagi tanpa sengaja setelah selesai mengisi.
      setUnlocked(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
        clearToken();
        onSessionExpired();
        return;
      }
      setSaved("err");
    } finally {
      setSaving(false);
      setTimeout(() => setSaved("idle"), 2000);
    }
  }

  async function toggleRiwayat() {
    if (riwayatOpen) {
      setRiwayatOpen(false);
      return;
    }
    setRiwayatOpen(true);
    if (riwayatData !== null || !row.idsubsls) return; // sudah pernah dimuat / tidak ada idsubsls
    setRiwayatLoading(true);
    setRiwayatErr(null);
    try {
      const data = await apiFetch(`/api/penyisiran/ppl-info?idsubsls=${encodeURIComponent(row.idsubsls)}`, token);
      setRiwayatData(data.ppl ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
        clearToken();
        onSessionExpired();
        return;
      }
      setRiwayatErr(msg);
    } finally {
      setRiwayatLoading(false);
    }
  }

  async function togglePerubahan() {
    if (perubahanOpen) {
      setPerubahanOpen(false);
      return;
    }
    setPerubahanOpen(true);
    if (perubahanData !== null) return; // sudah pernah dimuat
    setPerubahanLoading(true);
    setPerubahanErr(null);
    try {
      const data = await apiFetch(`/api/penyisiran/riwayat?id=${encodeURIComponent(row.kode_identitas)}`, token);
      setPerubahanData(data.riwayat ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
        clearToken();
        onSessionExpired();
        return;
      }
      setPerubahanErr(msg);
    } finally {
      setPerubahanLoading(false);
    }
  }

  const mapsUrl =
    row.lat != null && row.lng != null ? `https://www.google.com/maps?q=${row.lat},${row.lng}` : null;

  return (
    <div
      id={`kartu-penyisiran-${row.kode_identitas}`}
      className={`rounded-lg border p-3 transition-shadow ${KARTU_BG[status]} ${
        highlighted ? "border-navy-400 ring-2 ring-navy-400" : "border-line"
      }`}
      style={{ borderLeft: `4px solid ${meta.dot}` }}
    >
      {/* ---------- RINGKAS: SELALU tampil (nama, jarak live, prioritas,
          alamat) -- 4 info utama sesuai desain mode Ringkas/Detail, supaya
          banyak kartu muat dalam satu layar saat petugas sedang mencari/
          berpindah sampel. Sisa isi kartu (status, info tambahan, riwayat,
          form Simpan) hanya muncul di mode Detail di bawah. */}
      <div className="flex items-start justify-between gap-2">
        {/* Mode Ringkas (isDetail=false): dipotong 1 baris + "..." otomatis
            sesuai lebar kartu (class `truncate`) supaya kartu tidak melebar
            berantakan -- title= utk tooltip nama penuh saat hover/tap-hold.
            Mode Detail: nama LENGKAP ditampilkan, boleh turun ke baris
            berikutnya (tanpa truncate). */}
        <span
          className={`min-w-0 text-sm font-bold text-navy-900 ${isDetail ? "whitespace-normal" : "truncate"}`}
          title={isDetail ? undefined : namaTampilRow(row)}
        >
          {namaTampilRow(row)}
        </span>
        {jarakLive != null ? (
          <span className="shrink-0 text-xs font-bold text-[#2563eb]">{jarakLive.toFixed(1)} km</span>
        ) : (
          <span className="shrink-0 text-[10px] text-ink/40">{row.kode_identitas}</span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span
          title={`Sumber data (DUTP/DTSEN/PNM): ${prioritas.jumlahBukti}/3 · Info tambahan (PPL/Jorong/Tetangga): ${prioritas.jumlahInfo}/3 · Keluarga lain di Sub SLS yg sama (daftar ini): ${jumlahDiSubsls}${jarak != null ? ` · Jarak dari rumah Anda: ${jarak.toFixed(1)} km` : ""}`}
          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${prioritasMeta.className}`}
        >
          {prioritasMeta.label} &middot; {prioritas.skor}
        </span>
        {jarakLive != null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#2563eb]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2563eb]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#2563eb]" /> Live
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-xs text-ink/70">📍 {row.alamat || "-"}</p>

      {/* Badge Identifikasi PPL/Jorong + DUTP/DTSEN/PNM Mekar -- DIPINDAH
          ke sini (SELALU tampil, bukan cuma mode Detail lagi) atas
          permintaan: sebelumnya cuma kelihatan sesudah kartu dibuka ke
          mode Detail, padahal ini info kunci utk menilai sekilas layak-
          tidaknya kartu didatangi tanpa perlu buka tiap kartu satu per
          satu. */}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${identMeta.className}`}>
          {identMeta.label}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.bukti_dutp ? "bg-moss-100 text-moss-700" : "border border-line text-ink/40"}`}>
          DUTP {row.bukti_dutp ? "✓" : "-"}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.bukti_dtsen ? "bg-moss-100 text-moss-700" : "border border-line text-ink/40"}`}>
          DTSEN {row.bukti_dtsen ? "✓" : "-"}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.bukti_pnm ? "bg-moss-100 text-moss-700" : "border border-line text-ink/40"}`}>
          PNM Mekar {row.bukti_pnm ? "✓" : "-"}
        </span>
      </div>

      {!isDetail && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onToggleDetail}
            className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-navy-700 hover:border-navy-400"
          >
            ⌄ Detail
          </button>
        </div>
      )}

      {/* ---------- DETAIL: seluruh info teknis + form pendataan, hanya
          muncul saat kartu ini dibuka lewat tombol "⌄ Detail" (atau
          "Semua Detail"). Kartu LAIN tidak ikut terbuka -- state isDetail
          per-kartu dikelola PenyisiranPanel (Set kode_identitas). */}
      {isDetail && (
        <>
          <p className="mb-1.5 mt-1.5 text-[11px] text-ink/40">
            {ringkasWilayah(row.alamat, row.nagari_nama, row.sls_nama)}
            {mapsUrl && (
              <>
                {" "}
                &middot;{" "}
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-navy-400 underline">
                  Lihat di peta
                </a>
                {" "}
                &middot;{" "}
                <a
                  href={
                    liveLat != null && liveLng != null
                      ? `https://www.google.com/maps/dir/?api=1&origin=${liveLat},${liveLng}&destination=${row.lat},${row.lng}`
                      : mapsUrl
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="text-navy-400 underline"
                >
                  🧭 Navigasi
                </a>
              </>
            )}
            {!mapsUrl && " · tanpa koordinat"}
          </p>
          {/* Badge Identifikasi PPL/Jorong + DUTP/DTSEN/PNM Mekar DIPINDAH
              ke bagian Ringkas (SELALU tampil) di atas -- lihat komentar
              di sana. */}
          {/* Badge "Info PPL/Jorong/Tetangga" + tombol "✎ Edit" per-kartu
              SUDAH DIHAPUS dari sini (atas permintaan) -- field-nya
              (info_ppl/info_jorong/info_tetangga) & skor prioritas yg
              memakainya TETAP ADA di backend, cuma sudah tdk bisa
              diubah lewat kartu ini lagi. "🎯 Tandai Pasti" di bawah msh
              butuh unlock (canEditInfo) spt biasa, tapi skrg SATU-
              SATUNYA cara unlock adalah tombol melayang "🔒 Edit Semua
              Info Lapangan" (global, lihat editAllMode), krn unlock
              per-kartu ikut hilang bareng tombol Edit di atas. */}
          <div className="mb-1.5">
            <button
              type="button"
              disabled={!canEditInfo}
              onClick={() => canEditInfo && setPastiFlag((v) => !v)}
              title="Tandai kalau sudah YAKIN ada usaha -- skor dipaksa maksimal apa pun hasil hitungan otomatis."
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
                pastiFlag ? "bg-rust-700 text-white" : "border border-line text-ink/40 hover:border-navy-400"
              } ${!canEditInfo ? "cursor-not-allowed opacity-50 hover:border-line" : ""}`}
            >
              🎯 {pastiFlag ? "Pasti" : "Tandai Pasti"}
            </button>
          </div>

          {/* ☎ Kontak PPL Wilayah Ini: nama + No HP PPL/mantan pendata yg
              dulu mendata Sub SLS keluarga ini -- supaya petugas
              penyisiran bisa langsung menghubungi kalau perlu konfirmasi
              lapangan. BEDA dari "🕘 Riwayat Perubahan" di bawah. */}
          <div className="mb-1.5">
            <button
              type="button"
              onClick={toggleRiwayat}
              className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-navy-400 hover:border-navy-400"
            >
              ☎ Kontak PPL Wilayah Ini {riwayatOpen ? "▲" : "▼"}
            </button>
            {riwayatOpen && (
              <div className="mt-1.5 rounded-md border border-line bg-paper/60 p-2 text-[11px]">
                {riwayatLoading && <span className="text-ink/40">Memuat...</span>}
                {!riwayatLoading && riwayatErr && <span className="text-rust-700">Gagal memuat: {riwayatErr}</span>}
                {!riwayatLoading && !riwayatErr && riwayatData && riwayatData.length === 0 && (
                  <span className="text-ink/40">Tidak ada PPL yang dialokasikan ke Sub SLS ini.</span>
                )}
                {!riwayatLoading && !riwayatErr && riwayatData && riwayatData.length > 0 && (
                  <div className="space-y-1">
                    {riwayatData.map((p, i) => {
                      const hpBersih = p.no_hp.replace(/\D/g, "");
                      const hpWa = hpBersih.startsWith("0") ? `62${hpBersih.slice(1)}` : hpBersih;
                      return (
                        <div key={i}>
                          <span className="font-semibold text-navy-900">{p.nama || "(tanpa nama)"}</span>
                          {p.no_hp ? (
                            <>
                              {" "}
                              &middot;{" "}
                              <a
                                href={`https://wa.me/${hpWa}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-navy-400 underline"
                              >
                                {p.no_hp}
                              </a>
                            </>
                          ) : (
                            <span className="text-ink/40"> &middot; tanpa No HP</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 🕘 Riwayat Perubahan: timeline audit log (penyisiran_riwayat)
              -- siapa mengubah Status/Info Jorong/Info Tetangga/
              Identifikasi PPL, kapan, dari sumber/akun mana. */}
          <div className="mb-1.5">
            <button
              type="button"
              onClick={togglePerubahan}
              className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-navy-400 hover:border-navy-400"
            >
              🕘 Riwayat Perubahan {perubahanOpen ? "▲" : "▼"}
            </button>
            {perubahanOpen && (
              <div className="mt-1.5 rounded-md border border-line bg-paper/60 p-2 text-[11px]">
                {perubahanLoading && <span className="text-ink/40">Memuat...</span>}
                {!perubahanLoading && perubahanErr && (
                  <span className="text-rust-700">Gagal memuat: {perubahanErr}</span>
                )}
                {!perubahanLoading && !perubahanErr && perubahanData && perubahanData.length === 0 && (
                  <span className="text-ink/40">Belum ada riwayat perubahan tercatat utk keluarga ini.</span>
                )}
                {!perubahanLoading && !perubahanErr && perubahanData && perubahanData.length > 0 && (
                  <div className="space-y-2">
                    {perubahanData.map((r, i) => (
                      <div key={i} className={i > 0 ? "border-t border-line pt-1.5" : ""}>
                        <div className="text-ink/40">{formatWaktuRiwayat(r.created_at)}</div>
                        <div className="font-semibold text-navy-900">
                          {JENIS_RIWAYAT_LABEL[r.jenis]}: {formatNilaiRiwayat(r.jenis, r.nilai_baru)}
                        </div>
                        {r.oleh_nama && <div className="text-ink/60">Dilakukan oleh: {r.oleh_nama}</div>}
                        {r.oleh_role && (
                          <div className="text-ink/60">Sumber: {SUMBER_LABEL[r.oleh_role] ?? r.oleh_role}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {isPml && (
            <p className="mb-1.5 text-[10px] font-medium text-ink/40">
              👁 Mode PML -- hanya bisa melihat &amp; menandai &quot;Pasti&quot;, Status/Catatan dikunci.
            </p>
          )}
          {!isPml && terkunci && (
            <p className="mb-1.5 text-[10px] font-medium text-rust-700">
              🔒 Terkunci -- sudah ditandai &quot;Usaha Ditemukan&quot; pada hari sebelumnya. Aktifkan &quot;🔒 Edit
              Semua Info Lapangan&quot; (pojok kanan bawah) kalau memang perlu dikoreksi.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusKunjungan)}
              disabled={isPml || terkunci}
              title={
                isPml
                  ? "PML tidak bisa mengubah status kunjungan."
                  : terkunci
                  ? "Terkunci -- aktifkan Edit Semua utk membuka."
                  : undefined
              }
              className="rounded-md border border-line px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {/* STATUS_PILIHAN (4 opsi, disederhanakan atas permintaan) --
                  PLUS status kartu ini SENDIRI kalau kebetulan berupa
                  status LAMA yg sudah dihapus dari pilihan ("Tidak
                  Ditemukan"/"Tidak Bisa Ditemui/Pindah"), supaya dropdown
                  tidak diam-diam melompat ke pilihan lain saat kartu itu
                  dibuka -- tetap kelihatan apa adanya, cuma tidak bisa
                  dipilih ULANG ke status itu kalau sudah diganti. */}
              {(STATUS_PILIHAN.includes(status) ? STATUS_PILIHAN : [status, ...STATUS_PILIHAN]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
            <input
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="Catatan petugas..."
              disabled={isPml || terkunci}
              title={
                isPml
                  ? "PML tidak bisa mengubah catatan petugas."
                  : terkunci
                  ? "Terkunci -- aktifkan Edit Semua utk membuka."
                  : undefined
              }
              className="min-w-[140px] flex-1 rounded-md border border-line px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              onClick={handleSave}
              disabled={!dirty || saving || terkunci}
              className={`shrink-0 rounded-md px-3 py-1 text-xs font-semibold text-white disabled:opacity-30 ${
                saved === "ok" ? "bg-moss-500" : saved === "err" ? "bg-rust-500" : "bg-navy-700 hover:bg-navy-900"
              }`}
            >
              {saving ? "..." : saved === "ok" ? "✓ Tersimpan" : saved === "err" ? "Gagal" : "Simpan"}
            </button>
          </div>

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={onToggleDetail}
              className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-ink/50 hover:border-navy-400"
            >
              ⌃ Tutup
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// InfoToggle (badge Ada/Tidak per Info PPL/Jorong/Tetangga) SUDAH DIHAPUS
// dari kartu -- lihat catatan di FormPendataan tempat div pembungkusnya
// dulu berada.

function UploadPanel({
  token,
  onDone,
  onSessionExpired,
}: {
  token: string;
  onDone: () => void;
  onSessionExpired: () => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const BATCH_SIZE = 2000;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus("Membaca file...");
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error("Format file tidak sesuai (harus berupa daftar/array).");

      let totalBaru = 0;
      let totalDiperbarui = 0;
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        setStatus(`Mengunggah ${Math.min(i + BATCH_SIZE, data.length)} / ${data.length} baris...`);
        const res = await apiFetch("/api/penyisiran/upload", token, {
          method: "POST",
          body: JSON.stringify({ rows: batch }),
        });
        totalBaru += res.baru ?? 0;
        totalDiperbarui += res.diperbarui ?? 0;
      }
      setStatus(`Selesai: ${totalBaru} keluarga baru, ${totalDiperbarui} diperbarui (checklist yang sudah diisi tetap dipertahankan).`);
      onDone();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/sesi tidak valid|kedaluwarsa/i.test(msg)) {
        clearToken();
        onSessionExpired();
        return;
      }
      setStatus(`Gagal: ${msg}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-3 text-xs">
      <p className="mb-2 text-ink/70">
        Unggah file <code>data_checklist_penyisiran.json</code> (hasil script Python di komputer BPS). Boleh
        diulang kapan saja -- checklist yang sudah diisi petugas TIDAK akan hilang/tertimpa.
      </p>
      <input ref={fileRef} type="file" accept=".json" onChange={handleFile} disabled={busy} className="text-xs" />
      {status && <p className="mt-2 text-ink/60">{status}</p>}
    </div>
  );
}
