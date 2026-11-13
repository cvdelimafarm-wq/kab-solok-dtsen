// lib/keu/komponen.ts
//
// (14 Nov 2026, Fase 2d) Lembar komponen teknis tahap 5 (pelatihan, P01-P13) dan tahap 6 (pendataan, D01-D13) — katalog dari
// claude/rancangan-skema-teknis-kegiatan-13nov.md bagian 4a/4b. "Satu pengaturan, dua pintu": status dibaca dari pengaturan dan data yang sama
// dengan Kelola (keu_v_ident_komponen_data + aturan Belajar dan mutu keu_v_ident_belajar); lembar tidak menyimpan salinan. Mengubah = tautan ke Kelola.
// Katalog di kode (bukan tabel) pada tahap ini; nama dan urutan dapat dipindah ke tabel bila Iqbal ingin mengubahnya tanpa kode.

export type FungsiKomponen = "pelatihan" | "pendataan";
export type StatusKomponen = "dipakai" | "tidak" | "dibatalkan" | "belum" | "info";
export const LABEL_STATUS_KOMPONEN: Record<StatusKomponen, string> = { dipakai: "Dipakai", tidak: "Tidak dipakai", dibatalkan: "Dibatalkan", belum: "Belum diatur", info: "Di luar SIGAP" };

export type DataKomponen = {
  ident_id: number; fungsi: string; kegiatan_id: number; kegiatan_nama: string; strategi: string | null; fitur: Record<string, boolean> | null;
  n_pretest: number; n_posttest: number; n_materi: number; n_berkas: number; n_kuis_pra: number; n_kuis_live: number; n_kelas: number; n_titik_presensi: number;
  n_presensi: number; n_nilai_skema: number; n_foto_pelatihan: number; n_surat_undangan: number; n_laporan_pelatihan: number; n_alokasi: number;
  n_penugasan: number; n_st: number; n_qc_atur: number; n_qc_soal: number; n_anomali: number; n_realisasi: number; n_360: number;
};
export type AturanBelajarRingkas = { kegiatan_id: number; waktu: string; butir: string; aktif: boolean; wajib: boolean; batal_alasan: string | null };

type Def = {
  kode: string; fungsi: FungsiKomponen; nama: string; peran: string;
  /** butir Belajar dan mutu yang menjadi sumber tunggal komponen ini (bila ada aturannya) */
  belajar?: { waktu: string; butir: string };
  status: (d: DataKomponen) => { status: StatusKomponen; ket: string };
  atur: { tab: string; sub?: string };
};

const n = (x: unknown) => Number(x) || 0;
const ada = (jumlah: number, ket: string, kosong = "Belum ada pengaturan"): { status: StatusKomponen; ket: string } => (jumlah > 0 ? { status: "dipakai", ket } : { status: "belum", ket: kosong });
const fitur = (d: DataKomponen, k: string): boolean | undefined => (d.fitur && k in d.fitur ? !!d.fitur[k] : undefined);

export const KATALOG_KOMPONEN: Def[] = [
  { kode: "P01", fungsi: "pelatihan", nama: "Undangan dan ketentuan", peran: "Peserta, panitia", status: (d) => ada(n(d.n_surat_undangan), `${n(d.n_surat_undangan)} surat undangan`), atur: { tab: "komunikasi", sub: "tampilan" } },
  { kode: "P02", fungsi: "pelatihan", nama: "Bahan belajar, video, instrumen", peran: "Peserta", status: (d) => ada(n(d.n_materi) + n(d.n_berkas), `${n(d.n_berkas)} berkas, ${n(d.n_materi)} materi`), atur: { tab: "materi", sub: "instrumen" } },
  { kode: "P03", fungsi: "pelatihan", nama: "Kuis pra (dari riwayat anomali)", peran: "Peserta", status: (d) => ada(n(d.n_kuis_pra), "Pengaturan kuis pra ada"), atur: { tab: "materi", sub: "kuispra" } },
  { kode: "P04", fungsi: "pelatihan", nama: "Vanguard latihan mandiri", peran: "Peserta", belajar: { waktu: "pra_pelatihan", butir: "vanguard_latihan" },
    status: (d) => (fitur(d, "vanguard") === true ? { status: "dipakai", ket: "Saklar Vanguard menyala" } : { status: "belum", ket: "Saklar Vanguard mati" }), atur: { tab: "materi", sub: "belajar" } },
  { kode: "P05", fungsi: "pelatihan", nama: "Pretest", peran: "Peserta, instruktur", belajar: { waktu: "saat_pelatihan", butir: "pretest" }, status: (d) => ada(n(d.n_pretest), "Tes pretest ada"), atur: { tab: "materi", sub: "tes" } },
  { kode: "P06", fungsi: "pelatihan", nama: "Sesi kelas dan presensi", peran: "Instruktur, panitia",
    status: (d) => (n(d.n_kelas) > 0 && n(d.n_titik_presensi) > 0 ? { status: "dipakai", ket: `${n(d.n_kelas)} kelas, ${n(d.n_presensi)} presensi` } : { status: "belum", ket: n(d.n_kelas) > 0 ? "Titik presensi belum diatur" : "Kelas belum diatur" }), atur: { tab: "peserta", sub: "pengaturan" } },
  { kode: "P07", fungsi: "pelatihan", nama: "Vanguard roleplay (sesi bersama kelas)", peran: "Instruktur, peserta", belajar: { waktu: "saat_pelatihan", butir: "vanguard_roleplay" },
    status: (d) => (fitur(d, "vanguard_roleplay") === true ? { status: "dipakai", ket: "Saklar roleplay menyala" } : fitur(d, "vanguard_roleplay") === false ? { status: "tidak", ket: "Saklar roleplay mati" } : { status: "belum", ket: "Belum diatur" }), atur: { tab: "materi", sub: "belajar" } },
  { kode: "P08", fungsi: "pelatihan", nama: "Adu Sigap (kuis live)", peran: "Instruktur, peserta", status: (d) => ada(n(d.n_kuis_live), `${n(d.n_kuis_live)} kuis`), atur: { tab: "harih", sub: "adusigap" } },
  { kode: "P09", fungsi: "pelatihan", nama: "Posttest", peran: "Peserta", belajar: { waktu: "saat_pelatihan", butir: "posttest" }, status: (d) => ada(n(d.n_posttest), "Tes posttest ada"), atur: { tab: "materi", sub: "tes" } },
  { kode: "P10", fungsi: "pelatihan", nama: "Foto pelaksanaan (4/hari/kelas)", peran: "Instruktur, panitia", status: (d) => ada(n(d.n_foto_pelatihan), `${n(d.n_foto_pelatihan)} foto`, "Belum ada foto"), atur: { tab: "komunikasi", sub: "tampilan" } },
  { kode: "P11", fungsi: "pelatihan", nama: "Nilai akhir dan ambang lulus", peran: "Pengelola", status: (d) => ada(n(d.n_nilai_skema), "Skema nilai ada"), atur: { tab: "materi", sub: "penilaian" } },
  { kode: "P12", fungsi: "pelatihan", nama: "Evaluasi peserta (umpan balik pelatihan)", peran: "Peserta", status: () => ({ status: "info", ket: "Komponen baru; belum ada di SIGAP" }), atur: { tab: "hasil" } },
  { kode: "P13", fungsi: "pelatihan", nama: "Administrasi dan laporan", peran: "Panitia", status: (d) => ada(n(d.n_laporan_pelatihan), "Laporan pelatihan ada", "Belum ada laporan"), atur: { tab: "hasil" } },

  { kode: "D01", fungsi: "pendataan", nama: "Sampel dan alokasi wilayah", peran: "PJ, pengelola", status: (d) => ada(n(d.n_alokasi), `${n(d.n_alokasi)} wilayah teralokasi`), atur: { tab: "tim" } },
  { kode: "D02", fungsi: "pendataan", nama: "Penugasan PML/PPL dan surat tugas", peran: "PJ", status: (d) => ada(n(d.n_penugasan), `${n(d.n_penugasan)} penugasan, ${n(d.n_st)} ber-ST`), atur: { tab: "tim" } },
  { kode: "D03", fungsi: "pendataan", nama: "Hari kerja dan Kamera", peran: "PPL, PML", status: (d) => ada(n(d.n_penugasan), "Lewat Translok petugas"), atur: { tab: "pemeriksaan" } },
  { kode: "D04", fungsi: "pendataan", nama: "Transport lokal dan SPJ", peran: "PPL, PML", status: (d) => ada(n(d.n_realisasi), `${n(d.n_realisasi)} laporan harian`, "Belum ada laporan harian"), atur: { tab: "administrasi" } },
  { kode: "D05", fungsi: "pendataan", nama: "Monitoring progres", peran: "PML, korwil, pengelola", status: (d) => ada(n(d.n_realisasi), "Dari laporan harian", "Belum ada laporan harian"), atur: { tab: "monitoring" } },
  { kode: "D06", fungsi: "pendataan", nama: "QC Pemahaman / kuis harian", peran: "PPL, PML", belajar: { waktu: "saat_pendataan", butir: "kuis" },
    status: (d) => ada(n(d.n_qc_atur) + n(d.n_qc_soal), `${n(d.n_qc_soal)} soal`), atur: { tab: "qc" } },
  { kode: "D07", fungsi: "pendataan", nama: "Lingkar anomali", peran: "PML, pengelola", status: (d) => ada(n(d.n_anomali), `${n(d.n_anomali)} impor`, "Belum ada impor anomali"), atur: { tab: "qc" } },
  { kode: "D08", fungsi: "pendataan", nama: "Pemeriksaan PML (QC/murajaah)", peran: "PML", belajar: { waktu: "saat_pendataan", butir: "qc_murajaah" },
    status: (d) => (fitur(d, "qc_dokumen") === true ? { status: "dipakai", ket: "Unggah dokumen pemeriksaan menyala" } : { status: "belum", ket: "Belum diatur" }), atur: { tab: "pemeriksaan" } },
  { kode: "D09", fungsi: "pendataan", nama: "Vanguard saat pendataan", peran: "PPL, PML", belajar: { waktu: "saat_pendataan", butir: "vanguard_latihan" },
    status: (d) => (fitur(d, "vanguard") === true ? { status: "dipakai", ket: "Saklar Vanguard menyala" } : { status: "belum", ket: "Saklar Vanguard mati" }), atur: { tab: "persiapan" } },
  { kode: "D10", fungsi: "pendataan", nama: "Rapat evaluasi berkala", peran: "Semua", status: () => ({ status: "info", ket: "Dijadwalkan dari identifikasi; belum tercatat di SIGAP" }), atur: { tab: "ringkasan" } },
  { kode: "D11", fungsi: "pendataan", nama: "Penilaian tim 360", peran: "Tim", status: (d) => ada(n(d.n_360), `${n(d.n_360)} penilaian`, "Belum ada penilaian"), atur: { tab: "monitoring" } },
  { kode: "D12", fungsi: "pendataan", nama: "Pengolahan dan entri", peran: "Petugas entri", status: () => ({ status: "info", ket: "Dari identifikasi; belum masuk SIGAP" }), atur: { tab: "ringkasan" } },
];

export type BarisKomponen = { kode: string; nama: string; peran: string; status: StatusKomponen; ket: string; sumber: "belajar" | "kelola"; href: string | null; wajib: boolean };

export function hrefAtur(fungsi: FungsiKomponen, kegiatanId: number, atur: { tab: string; sub?: string }): string {
  return fungsi === "pelatihan"
    ? `/sigap/kelola/pelatihan?tab=${atur.tab}${atur.sub ? `&sub=${atur.sub}` : ""}&kegiatan=${kegiatanId}`
    : `/sigap/kelola/pendataan?k=${kegiatanId}&tab=${atur.tab}`;
}

/** Lembar satu fungsi untuk satu kegiatan tertaut. Aturan Belajar dan mutu (bila ada barisnya) mengalahkan pembacaan data. */
export function susunLembar(fungsi: FungsiKomponen, data: DataKomponen | null, belajar: readonly AturanBelajarRingkas[]): BarisKomponen[] {
  return KATALOG_KOMPONEN.filter((k) => k.fungsi === fungsi).map((k) => {
    const href = data ? hrefAtur(fungsi, data.kegiatan_id, k.atur) : null;
    const b = k.belajar && data ? belajar.find((x) => x.kegiatan_id === data.kegiatan_id && x.waktu === k.belajar!.waktu && x.butir === k.belajar!.butir) : undefined;
    if (b) {
      if (b.batal_alasan) return { kode: k.kode, nama: k.nama, peran: k.peran, status: "dibatalkan", ket: b.batal_alasan, sumber: "belajar", href: data ? hrefAtur(fungsi, data.kegiatan_id, fungsi === "pelatihan" ? { tab: "materi", sub: "belajar" } : { tab: "persiapan" }) : null, wajib: b.wajib };
      return { kode: k.kode, nama: k.nama, peran: k.peran, status: b.aktif ? "dipakai" : "tidak", ket: b.aktif ? (b.wajib ? "Wajib (aturan Belajar dan mutu)" : "Dipakai (aturan Belajar dan mutu)") : "Tidak dipakai (aturan Belajar dan mutu)", sumber: "belajar", href: data ? hrefAtur(fungsi, data.kegiatan_id, fungsi === "pelatihan" ? { tab: "materi", sub: "belajar" } : { tab: "persiapan" }) : null, wajib: b.wajib };
    }
    if (!data) return { kode: k.kode, nama: k.nama, peran: k.peran, status: "belum", ket: "Kegiatan belum tertaut", sumber: "kelola", href: null, wajib: false };
    const s = k.status(data);
    return { kode: k.kode, nama: k.nama, peran: k.peran, status: s.status, ket: s.ket, sumber: "kelola", href, wajib: false };
  });
}

export function ringkasLembar(baris: readonly BarisKomponen[]): Record<StatusKomponen, number> {
  const r: Record<StatusKomponen, number> = { dipakai: 0, tidak: 0, dibatalkan: 0, belum: 0, info: 0 };
  for (const b of baris) r[b.status]++;
  return r;
}
