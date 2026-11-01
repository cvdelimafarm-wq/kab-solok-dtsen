// lib/delego/tinjau.ts
//
// (1 Nov 2026) Tinjau laporan, sanggah, dan monitoring Kepala. Berkas MURNI: aturan isian, status tampilan, dan angka ringkas. Yang memutuskan tetap basis data (20261101zb).

import { angka, bulat, selisihHari } from "./hitung";
type Nada = "hijau" | "abu" | "biru" | "amber" | "merah";
import type { CapaianPegawai, Delegasi, Laporan, Monitor, PutusanSanggah, StatusTinjau } from "./tipe";

/** Panjang minimal alasan/jawaban/catatan (sama dengan fungsi basis data). */
export const MIN_HURUF = { tolak: 5, sanggah: 20, jawaban: 10, putusan: 10, usulanTolak: 5, skorUbah: 5 } as const;
/** Laporan atau usulan yang tidak ditanggapi lebih dari ini (hari kerja) tampil di monitoring Kepala. */
export const BATAS_HK_TINJAU = 3;
export const HAK_JAWAB_HK = 2;

export type KeputusanTinjau = "setuju" | "tolak" | "sanggah";

export function galatKeputusan(putusan: KeputusanTinjau, alasan: string): string | null {
  const a = alasan.trim();
  if (putusan === "tolak" && a.length < MIN_HURUF.tolak) return `Alasan penolakan minimal ${MIN_HURUF.tolak} huruf.`;
  if (putusan === "sanggah" && a.length < MIN_HURUF.sanggah) return `Alasan sanggahan minimal ${MIN_HURUF.sanggah} huruf.`;
  return null;
}

export const galatJawaban = (jawaban: string): string | null => (jawaban.trim().length < MIN_HURUF.jawaban ? `Jawaban minimal ${MIN_HURUF.jawaban} huruf.` : null);

/** Putusan Kepala: sebagian wajib menyebut poin diakui (0 sampai kurang dari poin laporan); catatan minimal 10 huruf. */
export function galatPutusan(putusan: PutusanSanggah, poinLaporan: number, poinDiakui: string, catatan: string): string | null {
  if (catatan.trim().length < MIN_HURUF.putusan) return `Catatan putusan minimal ${MIN_HURUF.putusan} huruf.`;
  if (putusan === "sebagian") {
    const p = Number(poinDiakui.replace(",", "."));
    if (poinDiakui.trim() === "" || !Number.isFinite(p) || p < 0 || p >= poinLaporan) return `Poin yang diakui harus 0 sampai kurang dari ${bulat(poinLaporan, 2)} poin laporan.`;
  }
  return null;
}

export const NADA_TINJAU: Record<StatusTinjau, Nada> = { menunggu: "biru", disetujui: "hijau", ditolak: "amber", disanggah: "merah", tidak_diakui: "abu" };

/** Poin laporan yang dihitung: disetujui = poin diakui (atau seluruh poin), tidak diakui = 0, lainnya apa adanya (belum diputus). */
export function poinEfektif(l: Pick<Laporan, "poin" | "tinjau_status" | "poin_diakui">): number {
  if (l.tinjau_status === "tidak_diakui") return 0;
  if (l.tinjau_status === "disetujui" && l.poin_diakui !== null && l.poin_diakui !== undefined) return angka(l.poin_diakui);
  return angka(l.poin);
}

export type KodeStatusButir = "usulan" | "baru" | "berjalan" | "terhalang" | "menunggu_tinjau" | "perlu_revisi" | "disanggah" | "selesai" | "ditunda" | "batal";
export const TEKS_STATUS_BUTIR: Record<KodeStatusButir, { teks: string; nada: Nada }> = {
  usulan: { teks: "Usulan", nada: "biru" },
  baru: { teks: "Baru", nada: "abu" },
  berjalan: { teks: "Berjalan", nada: "biru" },
  terhalang: { teks: "Terhalang", nada: "amber" },
  menunggu_tinjau: { teks: "Menunggu tinjau", nada: "biru" },
  perlu_revisi: { teks: "Perlu revisi", nada: "amber" },
  disanggah: { teks: "Disanggah", nada: "merah" },
  selesai: { teks: "Selesai", nada: "hijau" },
  ditunda: { teks: "Ditunda", nada: "amber" },
  batal: { teks: "Batal", nada: "merah" },
};

/**
 * Status tampilan sebuah butir (rancangan: Baru, Berjalan, Terhalang, Menunggu tinjau, Perlu revisi, Disanggah, Selesai, Batal).
 * Urutan: usulan, selesai/batal, disanggah, perlu revisi, menunggu tinjau (laporan terbaru), terhalang, lalu status dasar.
 */
export function statusButir(d: Pick<Delegasi, "id" | "status" | "terhalang_oleh">, laporan: Pick<Laporan, "delegasi_id" | "tanggal" | "tinjau_status">[]): KodeStatusButir {
  if (d.status === "usulan") return "usulan";
  if (d.status === "selesai" || d.status === "batal" || d.status === "ditunda") return d.status;
  const lap = laporan.filter((l) => l.delegasi_id === d.id).sort((a, b) => (a.tanggal < b.tanggal ? 1 : -1));
  if (lap.some((l) => l.tinjau_status === "disanggah")) return "disanggah";
  if (lap.some((l) => l.tinjau_status === "ditolak")) return "perlu_revisi";
  if (lap[0]?.tinjau_status === "menunggu") return "menunggu_tinjau";
  if (d.terhalang_oleh) return "terhalang";
  return d.status;
}

/** Sisa hari (kalender) untuk menjawab sanggahan; negatif = lewat. */
export const sisaHariJawab = (batasJawab: string, hari: string): number => selisihHari(hari, batasJawab);

export const lewatBatasTinjau = (hkLewat: number): boolean => hkLewat > BATAS_HK_TINJAU;

// ---------------------------------------------------------------------------------------------------------------------
// Monitoring Kepala
// ---------------------------------------------------------------------------------------------------------------------
export type AngkaCapaian = { akun: number; nama: string; mandiri: number; terverifikasi: number; disanggah: number; belum: number; tidakDiakui: number; dikoreksi: number; nLaporan: number; selisih: number };

export function angkaCapaian(c: CapaianPegawai): AngkaCapaian {
  const mandiri = angka(c.mandiri);
  const terverifikasi = angka(c.terverifikasi);
  return {
    akun: c.akun, nama: c.nama, mandiri, terverifikasi, disanggah: angka(c.disanggah), belum: angka(c.belum), tidakDiakui: angka(c.tidak_diakui), dikoreksi: angka(c.dikoreksi),
    nLaporan: c.n_laporan, selisih: bulat(mandiri - terverifikasi, 2),
  };
}

export type KeteranganCapaian = "sesuai" | "menunggu_tinjau" | "disanggah" | "dikoreksi" | "tidak_diakui";
export const TEKS_KETERANGAN: Record<KeteranganCapaian, { teks: string; nada: Nada }> = {
  sesuai: { teks: "Sesuai", nada: "hijau" },
  menunggu_tinjau: { teks: "Menunggu tinjau", nada: "biru" },
  disanggah: { teks: "Disanggah", nada: "merah" },
  dikoreksi: { teks: "Dikoreksi Kepala", nada: "amber" },
  tidak_diakui: { teks: "Ada yang tidak diakui", nada: "merah" },
};
/** Keterangan terpenting per pegawai: sanggahan lebih dulu, lalu tidak diakui, dikoreksi, menunggu tinjau. */
export function keteranganCapaian(a: AngkaCapaian): KeteranganCapaian {
  if (a.disanggah > 0) return "disanggah";
  if (a.tidakDiakui > 0) return "tidak_diakui";
  if (a.dikoreksi > 0) return "dikoreksi";
  if (a.belum > 0) return "menunggu_tinjau";
  return "sesuai";
}

export type RingkasMonitor = {
  /** Persen butir selesai sebelum tenggat; null bila belum ada yang selesai pada periode. */
  tepatPersen: number | null;
  lewat3: number;
  menungguTinjau: number;
  sanggahTerbuka: number;
  sanggahMenungguPutusan: number;
  usulanMenunggu: number;
  usulanLewat3: number;
  terhalang: number;
};

export function ringkasMonitor(m: Monitor): RingkasMonitor {
  const selesai = m.tepat_waktu.selesai;
  return {
    tepatPersen: selesai > 0 ? Math.round((m.tepat_waktu.tepat / selesai) * 100) : null,
    lewat3: m.peninjau.reduce((s, p) => s + p.lewat3, 0),
    menungguTinjau: m.peninjau.reduce((s, p) => s + p.menunggu, 0),
    sanggahTerbuka: m.sanggah.filter((s) => s.status !== "diputus").length,
    sanggahMenungguPutusan: m.sanggah.filter((s) => s.status === "menunggu_putusan").length,
    usulanMenunggu: m.usulan.menunggu,
    usulanLewat3: m.usulan.lewat3,
    terhalang: m.terhalang.reduce((s, t) => s + t.jumlah, 0),
  };
}

/** Sanggahan yang ditolak Kepala dibanding seluruh sanggahan yang diajukan (indikator per Ketua Tim); null bila belum pernah menyanggah. */
export const rasioSanggahDitolak = (diajukan: number, ditolak: number): number | null => (diajukan > 0 ? Math.round((ditolak / diajukan) * 100) : null);
