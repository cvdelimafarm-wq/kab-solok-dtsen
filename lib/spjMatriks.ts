// lib/spjMatriks.ts
//
// Tipe & fungsi murni (tanpa dependensi DOM/Node) seputar baris hasil RPC
// spj_matriks_kelengkapan() (lihat
// supabase/migrations/20260919_spj_matriks_kelengkapan.sql) -- dipakai
// BERSAMA oleh:
//  - app/penyisiran/spj-monitoring.tsx (Dashboard & Monitoring SPJ,
//    pengelola)
//  - app/penyisiran/spj-cetak.tsx (Print Builder, pilih dokumen)
//  - app/penyisiran/administrasi-spj.tsx (tampilan "Administrasi Saya"
//    utk petugas/tetangga biasa)
//  - app/api/penyisiran/spj/cetak/route.ts (backend Print Builder, urutan
//    STANDAR dokumen SPJ dikunci di sini -- lihat URUTAN_CETAK_STANDAR)
//
// Ditaruh terpisah (bukan diulang di tiap file) supaya definisi "apa
// artinya dokumen X lengkap utk tanggal Y" & urutan standar SPJ SELALU
// konsisten di semua tempat yg memakainya.

export type SpjPetugasJenisMatriks = "penyisiran" | "tetangga";

export interface BarisMatriks {
  petugas_jenis: SpjPetugasJenisMatriks;
  petugas_id: number;
  nama: string;
  surat_tugas_id: number;
  nomor_st: string;
  tanggal: string; // YYYY-MM-DD
  ada_visum: boolean;
  ada_kwitansi: boolean;
  ada_laporan: boolean;
  slot_dokumentasi_terisi: number; // 0-5
  ada_surat_keterangan: boolean;
}

// Urutan ini SENGAJA DIKUNCI (bukan mengikuti urutan dicentang user di
// Print Builder) -- baik utk urutan kolom tabel Monitoring maupun urutan
// halaman PDF gabungan hasil Cetak SPJ, sesuai standar SPJ yg diminta:
// Kwitansi -> Surat Tugas -> Visum -> Laporan -> Dokumentasi -> Surat
// Pernyataan/Keterangan.
export const JENIS_DOKUMEN = ["kwitansi", "surat_tugas", "visum", "laporan", "dokumentasi", "surat_keterangan"] as const;
export type JenisDokumen = (typeof JENIS_DOKUMEN)[number];
export const URUTAN_CETAK_STANDAR: JenisDokumen[] = [...JENIS_DOKUMEN];

export const LABEL_DOKUMEN: Record<JenisDokumen, string> = {
  kwitansi: "Kwitansi",
  surat_tugas: "Surat Tugas",
  visum: "Visum",
  laporan: "Laporan",
  dokumentasi: "Dokumentasi",
  surat_keterangan: "Surat Pernyataan",
};

export type StatusDot = "ok" | "sebagian" | "kosong";

export const WARNA_DOT: Record<StatusDot, string> = { ok: "🟢", sebagian: "🟡", kosong: "🔴" };
export const LABEL_DOT: Record<StatusDot, string> = { ok: "Lengkap", sebagian: "Sebagian", kosong: "Belum" };

// Status 1 jenis dokumen pada 1 baris (petugas+tanggal). Surat Tugas
// SELALU "ok" krn baris ini cuma muncul kalau tautan ST-petugas memang
// ada (lihat komentar di RPC) -- Visum/Kwitansi/Surat Keterangan berlaku
// utk SELURUH rentang tanggal ST (bukan per-hari), Laporan per tanggal
// spesifik, Dokumentasi tri-state dari jumlah slot foto (0-5) yg terisi.
export function statusDokumen(row: BarisMatriks, jenis: JenisDokumen): StatusDot {
  switch (jenis) {
    case "surat_tugas":
      return "ok";
    case "visum":
      return row.ada_visum ? "ok" : "kosong";
    case "kwitansi":
      return row.ada_kwitansi ? "ok" : "kosong";
    case "laporan":
      return row.ada_laporan ? "ok" : "kosong";
    case "surat_keterangan":
      return row.ada_surat_keterangan ? "ok" : "kosong";
    case "dokumentasi":
      if (row.slot_dokumentasi_terisi >= 5) return "ok";
      if (row.slot_dokumentasi_terisi > 0) return "sebagian";
      return "kosong";
  }
}

export interface RingkasanHari {
  jumlahKurang: number; // dari 6 jenis dokumen, berapa yg BUKAN "ok"
  status: "lengkap" | "kurang" | "kosong";
}

// "Kosong" (merah, paling parah) dipakai kalau SEMUA dokumen SELAIN Surat
// Tugas (yg memang selalu ok) belum ada sama sekali -- bukan cuma "1-2
// kurang" tapi benar2 belum ada progres SPJ apa pun utk hari itu.
export function ringkasHari(row: BarisMatriks): RingkasanHari {
  const daftarStatus = JENIS_DOKUMEN.map((j) => statusDokumen(row, j));
  const jumlahOk = daftarStatus.filter((s) => s === "ok").length;
  const jumlahKosong = daftarStatus.filter((s) => s === "kosong").length;
  if (jumlahOk === JENIS_DOKUMEN.length) return { jumlahKurang: 0, status: "lengkap" };
  if (jumlahKosong >= JENIS_DOKUMEN.length - 1) return { jumlahKurang: JENIS_DOKUMEN.length - 1, status: "kosong" };
  return { jumlahKurang: JENIS_DOKUMEN.length - jumlahOk, status: "kurang" };
}

export function labelRingkasan(r: RingkasanHari): string {
  if (r.status === "lengkap") return "Lengkap";
  if (r.status === "kosong") return "Kosong";
  return `${r.jumlahKurang} Kurang`;
}

// Kunci unik 1 penugasan (petugas+ST) -- dipakai utk mengelompokkan baris
// harian jadi 1 "assignment" (Print Builder & ringkasan per petugas perlu
// tahu batas 1 ST, bukan cuma tanggal lepas).
export function kunciPenugasan(row: Pick<BarisMatriks, "petugas_jenis" | "petugas_id" | "surat_tugas_id">): string {
  return `${row.petugas_jenis}:${row.petugas_id}:${row.surat_tugas_id}`;
}

export function kunciPetugas(row: Pick<BarisMatriks, "petugas_jenis" | "petugas_id">): string {
  return `${row.petugas_jenis}:${row.petugas_id}`;
}

// ---------------------------------------------------------------------------
// Kelengkapan per Jenis Dokumen -- utk SATU orang (kartu "Administrasi Saya",
// non-pengelola -- lihat app/penyisiran/spj-monitoring.tsx
// KelengkapanDokumenSaya() & app/penyisiran/administrasi-spj.tsx).
//
// BEDA dgn ringkasHari()/statusDokumen() yg dipakai Dashboard/Monitoring
// pengelola (penyebutnya = baris matriks yg ADA, lintas semua org): di sini
// PENYEBUTnya = jumlah hari kerja yg BENAR2 ditag org ybs di kartu
// 🗓 Identifikasi Hari Tugas (Perencanaan Lapangan; lihat
// app/api/penyisiran/spj/hari-kerja-saya/route.ts) -- sesuai permintaan
// user "kelengkapannya mengacu ke jumlah hari kerja yang dia tag". Hari
// kerja yg ditag tapi TIDAK tertaut Surat Tugas apa pun (baris matriks tdk
// ada utk tanggal itu) dihitung "belum" utk SEMUA jenis dokumen pd tanggal
// itu, dan jg dilaporkan terpisah lewat `hariTanpaSt` sbg peringatan.
//
// Ambang Dokumentasi KHUSUS kartu ini = >=3 foto/hari (BEDA dgn ambang >=5
// yg dipakai statusDokumen() utk Dashboard/Monitoring pengelola) -- sesuai
// permintaan user "Dokumentasi hari tertentu oke jika user sudah upload
// foto minimal 3 per hari". SENGAJA fungsi terpisah (bukan mengubah
// statusDokumen()) krn dua definisi "lengkap" ini utk audiens/tujuan beda.

export const AMBANG_DOKUMENTASI_HARIAN = 3;

export interface KelengkapanHariRingkas {
  tanggal: string;
  adaSt: boolean;
  slotDokumentasi: number;
  ok: Record<JenisDokumen, boolean>;
}

export interface KelengkapanJenisRingkas {
  jenis: JenisDokumen;
  label: string;
  ok: number;
  total: number;
  pct: number;
}

export interface KelengkapanPerJenisHasil {
  perJenis: KelengkapanJenisRingkas[];
  perHari: KelengkapanHariRingkas[];
  totalHariKerja: number;
  hariTanpaSt: string[];
}

export function hitungKelengkapanPerJenis(baris: BarisMatriks[], hariKerja: string[]): KelengkapanPerJenisHasil {
  const tanggalUnik = Array.from(new Set(hariKerja)).sort();

  // Asumsi 1 baris per tanggal (1 ST aktif per org per hari) -- kalau ada
  // 2 ST org yg sama tumpang tindih tanggalnya (kasus langka, blm pernah
  // terjadi di data nyata per investigasi), baris TERAKHIR yg menang.
  const petaBaris = new Map<string, BarisMatriks>();
  for (const b of baris) petaBaris.set(b.tanggal, b);

  const perHari: KelengkapanHariRingkas[] = tanggalUnik.map((tanggal) => {
    const row = petaBaris.get(tanggal);
    if (!row) {
      return {
        tanggal,
        adaSt: false,
        slotDokumentasi: 0,
        ok: {
          kwitansi: false,
          surat_tugas: false,
          visum: false,
          laporan: false,
          dokumentasi: false,
          surat_keterangan: false,
        },
      };
    }
    return {
      tanggal,
      adaSt: true,
      slotDokumentasi: row.slot_dokumentasi_terisi,
      ok: {
        kwitansi: row.ada_kwitansi,
        surat_tugas: true,
        visum: row.ada_visum,
        laporan: row.ada_laporan,
        dokumentasi: row.slot_dokumentasi_terisi >= AMBANG_DOKUMENTASI_HARIAN,
        surat_keterangan: row.ada_surat_keterangan,
      },
    };
  });

  const perJenis: KelengkapanJenisRingkas[] = JENIS_DOKUMEN.map((jenis) => {
    const ok = perHari.filter((h) => h.ok[jenis]).length;
    const total = perHari.length;
    return { jenis, label: LABEL_DOKUMEN[jenis], ok, total, pct: total > 0 ? Math.round((ok / total) * 100) : 0 };
  });

  const hariTanpaSt = perHari.filter((h) => !h.adaSt).map((h) => h.tanggal);

  return { perJenis, perHari, totalHariKerja: tanggalUnik.length, hariTanpaSt };
}
