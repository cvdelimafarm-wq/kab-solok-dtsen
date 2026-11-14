// lib/delego/rapor.ts
//
// (14 Nov 2026, Fase 5) Rapor terpadu per pegawai per bulan dan rekap SKP. Berkas MURNI: bentuk data keu_dlg_rapor, persen capaian terhadap
// kapasitas (hari kerja x 100), penanda minimal 60, CSV rekap. Rapor hanya merangkum; tidak ada skor gabungan (bobot rapor menunggu putusan).

import { angka, bulat } from "./hitung";

export type BarisRapor = {
  akun: number; nama: string; hari_kerja: number | string; poin: number | string; poin_diakui: number | string; poin_menunggu: number | string;
  laporan: number; hari_60: number; faktor: number | string | null; lewat_tenggat: number; inisiatif: number;
  kualitas: number | string | null; kepatuhan: number | string | null; penilai_360: number | null; nilai_360: number | string | null;
  pembinaan: number; penghargaan: number;
};
export type BahanRapor = {
  bulan: string; sampai: string; semua: boolean; baris: BarisRapor[];
  ringkas: { pegawai: number; tercatat: number; min60: number; bobot_total: number; bobot_tervalidasi: number };
};

export const KAPASITAS_HARI = 100;
export const MINIMAL_HARI = 60;

/** Capaian (persen kapasitas) dari poin diakui; null bila tidak ada hari kerja. */
export const capaian = (b: Pick<BarisRapor, "poin_diakui" | "hari_kerja">): number | null => {
  const h = angka(b.hari_kerja);
  return h > 0 ? Math.round((angka(b.poin_diakui) / (h * KAPASITAS_HARI)) * 100) : null;
};
/** Rata poin dilaporkan per hari kerja. */
export const rataHarian = (b: Pick<BarisRapor, "poin" | "hari_kerja">): number | null => {
  const h = angka(b.hari_kerja);
  return h > 0 ? bulat(angka(b.poin) / h, 1) : null;
};
export const penuhiMinimal = (b: Pick<BarisRapor, "poin" | "hari_kerja">): boolean => (rataHarian(b) ?? 0) >= MINIMAL_HARI;

export const awalBulanDari = (t: string): string => `${t.slice(0, 7)}-01`;
export function geser(bulan: string, n: number): string {
  const [y, m] = bulan.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

const sel = (v: string | number | null): string => {
  const s = v === null ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Rekap SKP (CSV titik koma): satu baris per pegawai. */
export function csvRekap(d: BahanRapor): string {
  const kepala = ["Nama", "Hari kerja", "Poin dilaporkan", "Poin diakui", "Capaian %", "Rata per hari", "Hari >= 60", "Faktor mutu", "Lewat tenggat", "Inisiatif", "Kualitas", "Kepatuhan", "Nilai 360", "Penilai 360", "Pembinaan", "Penghargaan"];
  const isi = d.baris.map((b) => [b.nama, angka(b.hari_kerja), angka(b.poin), angka(b.poin_diakui), capaian(b), rataHarian(b), b.hari_60,
    b.faktor === null ? null : angka(b.faktor), b.lewat_tenggat, b.inisiatif, b.kualitas === null ? null : angka(b.kualitas), b.kepatuhan === null ? null : angka(b.kepatuhan),
    b.nilai_360 === null ? null : angka(b.nilai_360), b.penilai_360 ?? 0, b.pembinaan, b.penghargaan]);
  return [kepala, ...isi].map((r) => r.map((x) => sel(x as string | number | null)).join(";")).join("\n");
}
