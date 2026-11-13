// lib/butirMitra.ts
//
// (14 Nov 2026, Fase 2c) Butir kerja MITRA di tab Hari Ini (keputusan Iqbal 13 Nov: mitra tidak masuk Delego; Delego khusus pegawai organik dan PPPK).
// Resep sama dengan draf delegasi kursi (skema-sql/20261114c): PPL -> mendata sampel alokasi wilayahnya; PML -> memeriksa dokumen sampel PPL di bawahnya.
// Realisasi = jumlah laporan harian (sigap_realisasi) penugasan itu. Fungsi murni, tanpa jaringan.

export type PeranButir = "ppl" | "pml";
export type ButirMitra = {
  peran: PeranButir;
  judul: string;
  satuan: string;
  target: number;
  realisasi: number;
  sisa: number;
  persen: number;
  wilayah: number;
  sisaHari: number;
  perHari: number | null;
  status: "selesai" | "sesuai" | "tertinggal" | "belum_mulai" | "tanpa_target";
};

const hariAntara = (a: string, b: string): number => {
  const ms = (t: string) => Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10)));
  return Math.round((ms(b) - ms(a)) / 86_400_000);
};

export function susunButirMitra(m: {
  peran: string;
  satuan: string;
  alokasi: { target_sampel: number | null; idsubsls?: string | null }[];
  realisasi: number;
  mulai: string | null;
  selesai: string | null;
  hariIni: string;
}): ButirMitra | null {
  const peran = m.peran === "ppl" || m.peran === "pml" ? m.peran : null;
  if (!peran) return null;
  const target = m.alokasi.reduce((s, a) => s + (Number(a.target_sampel) || 0), 0);
  const wilayah = new Set(m.alokasi.map((a) => a.idsubsls ?? "").filter(Boolean)).size || m.alokasi.length;
  const satuan = (m.satuan || "dokumen").trim();
  const realisasi = Math.max(0, Number(m.realisasi) || 0);
  const sisa = Math.max(0, target - realisasi);
  const persen = target > 0 ? Math.min(100, Math.round((realisasi / target) * 100)) : 0;
  const akhir = m.selesai ?? m.mulai;
  const awal = m.mulai ?? m.hariIni;
  const sisaHari = akhir ? Math.max(0, hariAntara(m.hariIni < awal ? awal : m.hariIni, akhir) + 1) : 0;
  const perHari = sisa > 0 && sisaHari > 0 ? Math.ceil(sisa / sisaHari) : null;
  // laju sesuai bila realisasi >= target x (hari berjalan / lama kegiatan)
  let status: ButirMitra["status"] = "sesuai";
  if (target <= 0) status = "tanpa_target";
  else if (sisa === 0) status = "selesai";
  else if (m.mulai && m.hariIni < m.mulai) status = "belum_mulai";
  else if (m.mulai && akhir) {
    const lama = hariAntara(m.mulai, akhir) + 1;
    const jalan = Math.min(lama, hariAntara(m.mulai, m.hariIni) + 1);
    status = lama > 0 && realisasi + 1e-9 < (target * jalan) / lama ? "tertinggal" : "sesuai";
  }
  return {
    peran,
    judul: peran === "ppl" ? "Mendata sampel" : "Memeriksa dokumen",
    satuan, target, realisasi, sisa, persen, wilayah, sisaHari, perHari, status,
  };
}

export const LABEL_STATUS_BUTIR: Record<ButirMitra["status"], string> = {
  selesai: "Selesai", sesuai: "Sesuai jadwal", tertinggal: "Tertinggal", belum_mulai: "Belum mulai", tanpa_target: "Target belum diatur",
};
