// lib/gantiSampel.ts  (logika murni; aman diimpor klien dan server)
//
// (7 Nov 2026) Tahap B rancangan "sampel lintas survei": PENGGANTIAN sampel utama dengan cadangan atas persetujuan PML.
// Aturan sebenarnya ditegakkan basis data (migrasi 20261107g); berkas ini berisi tipe layar, label, dan fungsi bantu yang mencerminkan aturan itu
// agar tombol hanya muncul bila pengajuan masuk akal (server tetap memeriksa ulang dan penolakannya ditampilkan apa adanya).

import type { StatusJendela, TagKk } from "@/lib/tagSampel";

export type AlasanGanti = "tidak_ditemukan" | "menolak" | "pindah" | "kosong" | "lainnya";
export const ALASAN_GANTI: ReadonlyArray<{ kode: AlasanGanti; label: string }> = [
  { kode: "tidak_ditemukan", label: "Tidak ditemukan / alamat tidak ada" },
  { kode: "menolak", label: "Menolak diwawancarai" },
  { kode: "pindah", label: "Sudah pindah" },
  { kode: "kosong", label: "Rumah kosong / tidak berpenghuni" },
  { kode: "lainnya", label: "Lainnya (wajib catatan)" },
];
export const LABEL_ALASAN: Record<AlasanGanti, string> = Object.fromEntries(ALASAN_GANTI.map((a) => [a.kode, a.label])) as Record<AlasanGanti, string>;
/** Alasan yang, bila setelan sinkron = usulan, ditandai sebagai usulan pembaruan master KK. */
export const ALASAN_USUL_MASTER: ReadonlySet<AlasanGanti> = new Set<AlasanGanti>(["tidak_ditemukan", "pindah", "kosong"]);

export type StatusGanti = "menunggu" | "disetujui" | "ditolak" | "dibatalkan";
export const LABEL_STATUS_GANTI: Record<StatusGanti, string> = { menunggu: "Menunggu PML", disetujui: "Disetujui", ditolak: "Ditolak", dibatalkan: "Dibatalkan" };

export type SinkronMaster = "tidak" | "usulan";
export const LABEL_SINKRON: Record<SinkronMaster, string> = { tidak: "Tidak menyentuh master KK", usulan: "Tandai sebagai usulan pembaruan master (Ketua meninjau)" };

export const MIN_CATATAN_LAINNYA = 5;
export const MIN_CATATAN_TOLAK = 3;
export const MAKS_CATATAN = 500;

export type GantiRow = {
  id: number;
  idsubsls: string;
  utama_kk_id: number;
  cadangan_kk_id: number;
  utama_nama: string;
  cadangan_nama: string;
  alasan: AlasanGanti;
  catatan: string | null;
  status: StatusGanti;
  usul_master: boolean;
  diajukan_oleh: number | null;
  diajukan_nama: string | null;
  diajukan_at: string;
  diputus_nama: string | null;
  diputus_at: string | null;
  putus_sebagai: "pml" | "admin" | null;
  catatan_putus: string | null;
};

/** Pengajuan yang masih menunggu keputusan. */
export const menunggu = (daftar: readonly GantiRow[]): GantiRow[] => daftar.filter((g) => g.status === "menunggu");

/** Sudah ada pengajuan menunggu yang memakai KK ini (sebagai utama maupun cadangan)? */
export const kkSedangDiajukan = (daftar: readonly GantiRow[], kkId: number): boolean => menunggu(daftar).some((g) => g.utama_kk_id === kkId || g.cadangan_kk_id === kkId);

/** Cadangan yang dapat dipilih sebagai pengganti: cadangan aktif tanpa hasil dan belum dipakai pengajuan lain. */
export function cadanganTersedia(tag: readonly TagKk[], daftar: readonly GantiRow[]): TagKk[] {
  return tag.filter((t) => t.peran === "cadangan" && !t.hasil && !kkSedangDiajukan(daftar, t.kk_id));
}

/** Cerminan aturan DB untuk menampilkan tombol "Ganti dengan cadangan" pada satu KK utama (server tetap memutuskan). */
export function bisaMengajukanGanti(p: { tag: TagKk | undefined; jendela: StatusJendela; bolehGanti: boolean; daftar: readonly GantiRow[]; tag_sub: readonly TagKk[] }): { bisa: boolean; alasan: string | null } {
  const { tag, jendela, bolehGanti, daftar, tag_sub } = p;
  if (!tag || tag.peran !== "utama") return { bisa: false, alasan: null };
  if (!bolehGanti) return { bisa: false, alasan: "Kegiatan ini tidak mengizinkan penggantian sampel." };
  if (jendela === "belum") return { bisa: false, alasan: null };
  if (jendela === "terbuka") return { bisa: false, alasan: "Selama penandaan dibuka, lepas atau tandai ulang langsung." };
  if (tag.hasil === "didata") return { bisa: false, alasan: null };
  if (kkSedangDiajukan(daftar, tag.kk_id)) return { bisa: false, alasan: "Menunggu keputusan PML." };
  if (cadanganTersedia(tag_sub, daftar).length === 0) return { bisa: false, alasan: "Tidak ada cadangan yang tersedia." };
  return { bisa: true, alasan: null };
}

/** Pemeriksaan isian pengajuan di klien (server memeriksa ulang). Mengembalikan pesan galat atau null. */
export function periksaIsianGanti(alasan: AlasanGanti | "", catatan: string, cadanganKk: number | null): string | null {
  if (!cadanganKk) return "Pilih sampel cadangan pengganti.";
  if (!alasan) return "Pilih alasan penggantian.";
  const c = catatan.trim();
  if (c.length > MAKS_CATATAN) return `Catatan maksimal ${MAKS_CATATAN} huruf.`;
  if (alasan === "lainnya" && c.length < MIN_CATATAN_LAINNYA) return `Alasan "lainnya" wajib diberi catatan (minimal ${MIN_CATATAN_LAINNYA} huruf).`;
  return null;
}

export type RekapGanti = { menunggu: number; disetujui: number; ditolak: number; dibatalkan: number; usul_master: number };
export function rekapGanti(daftar: readonly Pick<GantiRow, "status" | "usul_master">[]): RekapGanti {
  const r: RekapGanti = { menunggu: 0, disetujui: 0, ditolak: 0, dibatalkan: 0, usul_master: 0 };
  for (const g of daftar) {
    r[g.status]++;
    if (g.usul_master && g.status !== "dibatalkan" && g.status !== "ditolak") r.usul_master++;
  }
  return r;
}

export type BarisGantiPpl = { ppl_nama: string; pml_nama: string | null; target: number; disetujui: number; menunggu: number; ditolak: number };
export type DataGantiAdmin = { siap: boolean; sinkron_ke_master: SinkronMaster; boleh_ganti: boolean; rekap: RekapGanti; tingkat: number; per_ppl: BarisGantiPpl[]; daftar: GantiRow[] };
export const GANTI_KOSONG: DataGantiAdmin = { siap: false, sinkron_ke_master: "tidak", boleh_ganti: true, rekap: { menunggu: 0, disetujui: 0, ditolak: 0, dibatalkan: 0, usul_master: 0 }, tingkat: 0, per_ppl: [], daftar: [] };

/**
 * Ringkasan per PPL dari daftar pengajuan dan alokasi. `tingkat` = penggantian disetujui / total target sampel utama (0..1).
 * Peringatan di layar bila tingkat tinggi dipakai untuk pemantauan, bukan penolakan.
 */
export function ringkasGantiAdmin(
  daftar: readonly GantiRow[],
  wilayah: ReadonlyArray<{ idsubsls: string; target: number; ppl_nama: string | null; pml_nama: string | null }>,
): { per_ppl: BarisGantiPpl[]; tingkat: number } {
  const sub = new Map(wilayah.map((w) => [w.idsubsls, w]));
  const per = new Map<string, BarisGantiPpl>();
  for (const w of wilayah) {
    const nama = w.ppl_nama ?? "(belum ada PPL)";
    const b = per.get(nama) ?? { ppl_nama: nama, pml_nama: w.pml_nama, target: 0, disetujui: 0, menunggu: 0, ditolak: 0 };
    b.target += w.target;
    per.set(nama, b);
  }
  for (const g of daftar) {
    const w = sub.get(g.idsubsls);
    if (!w) continue;
    const b = per.get(w.ppl_nama ?? "(belum ada PPL)");
    if (!b) continue;
    if (g.status === "disetujui") b.disetujui++;
    else if (g.status === "menunggu") b.menunggu++;
    else if (g.status === "ditolak") b.ditolak++;
  }
  const baris = Array.from(per.values()).filter((b) => b.disetujui + b.menunggu + b.ditolak > 0).sort((a, b) => b.disetujui + b.menunggu - (a.disetujui + a.menunggu) || a.ppl_nama.localeCompare(b.ppl_nama));
  const target = wilayah.reduce((s, w) => s + w.target, 0);
  const disetujui = daftar.filter((g) => g.status === "disetujui").length;
  return { per_ppl: baris, tingkat: target > 0 ? disetujui / target : 0 };
}

export const persen = (x: number): string => `${Math.round(x * 100)}%`;
