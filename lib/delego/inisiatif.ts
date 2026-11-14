// lib/delego/inisiatif.ts
//
// (14 Nov 2026, Fase 4c) Inisiatif pegawai pada usulan pekerjaan (Catat pekerjaan). Berkas MURNI: pilihan jenis, aturan isian
// (sama dengan keu_dlg_usul_inisiatif_isi), dan bentuk rekap keu_dlg_inisiatif_rekap. Usulan wajib dijawab dalam 3 hari kerja
// (keu_dlg_eskalasi_setelan.hk_usulan, dapat diubah); menolak wajib beralasan.

export type JenisInisiatif = "perbaikan_proses" | "ide_baru" | "bantu_rekan" | "di_luar_tugas" | "lainnya";

export const JENIS_INISIATIF: { k: JenisInisiatif; teks: string }[] = [
  { k: "perbaikan_proses", teks: "Perbaikan cara kerja" },
  { k: "ide_baru", teks: "Ide atau alat baru" },
  { k: "bantu_rekan", teks: "Membantu rekan atau tim lain" },
  { k: "di_luar_tugas", teks: "Pekerjaan di luar tugas" },
  { k: "lainnya", teks: "Lainnya" },
];

export const teksJenisInisiatif = (k: string | null | undefined): string => JENIS_INISIATIF.find((x) => x.k === k)?.teks ?? "Inisiatif";

export const MIN_INISIATIF = 10;

export type IsianInisiatif = { jenis: JenisInisiatif | ""; alasan: string; manfaat: string };

/** Galat isian inisiatif; null = boleh dikirim (atau bukan inisiatif bila jenis kosong). */
export function galatInisiatif(f: IsianInisiatif): string | null {
  if (!f.jenis) return "Pilih jenis inisiatif.";
  if (f.alasan.trim().length < MIN_INISIATIF) return `Alasan minimal ${MIN_INISIATIF} huruf.`;
  if (f.manfaat.trim().length < MIN_INISIATIF) return `Manfaat minimal ${MIN_INISIATIF} huruf.`;
  return null;
}

export const dataInisiatif = (f: IsianInisiatif) => ({ jenis: f.jenis, alasan: f.alasan.trim(), manfaat: f.manfaat.trim() });

export type RekapInisiatif = {
  dari: string;
  sampai: string;
  pegawai: { akun: number; nama: string; diajukan: number; disetujui: number; ditolak: number; menunggu: number }[];
  per_jenis: Partial<Record<JenisInisiatif, number>>;
};

export const totalRekap = (r: RekapInisiatif) =>
  r.pegawai.reduce((s, p) => ({ diajukan: s.diajukan + p.diajukan, disetujui: s.disetujui + p.disetujui }), { diajukan: 0, disetujui: 0 });
