// lib/sigapQcInfo.ts
//
// (29 Okt 2026) Data untuk infografis hasil QC Pemahaman: soal paling sering salah (siapa yang salah dan pilihan jawabannya), perbandingan tim,
// petugas dengan salah terbanyak, sebaran nilai awal dan sebaran jumlah percobaan. Murni (tanpa React / DB) supaya bisa diuji.
// Sumber "salah" = percobaan PERTAMA tiap petugas (yang paling jujur menggambarkan pemahaman); bila rincian per percobaan tidak ada (API lama),
// jatuh ke daftar `salah` pada rekap tim.

import type { QcRekapTim } from "@/lib/sigapQc";
import type { RincianQc } from "@/lib/sigapQcMonitor";
import type { BarisQc } from "@/lib/sigapQcTabel";

export type OrangSalah = { akun_id: number; nama: string; peran: "PML" | "PPL"; dipilih: string | null };
export type PilihanSalah = { huruf: string; teks: string; jumlah: number; benar: boolean };
export type SoalSalahInfo = {
  soal_id: string;
  pertanyaan: string;
  kunci: string | null;
  jumlah: number;
  orang: OrangSalah[];
  pilihan: PilihanSalah[];
  tidakTerjawab: number;
};

function percobaanPertama(rincian: RincianQc | undefined, akunId: number) {
  const daftar = rincian?.percobaan[akunId] ?? [];
  return daftar.find((x) => x.ke === 1) ?? daftar[0] ?? null;
}

export function soalPalingSalah(baris: BarisQc[], rekap: QcRekapTim[], rincian: RincianQc | undefined): SoalSalahInfo[] {
  const peta = new Map<string, SoalSalahInfo>();
  const ambil = (id: string, pertanyaan?: string): SoalSalahInfo => {
    let a = peta.get(id);
    if (!a) {
      const s = rincian?.soal[id];
      a = { soal_id: id, pertanyaan: s?.pertanyaan ?? pertanyaan ?? id, kunci: s?.kunci ?? null, jumlah: 0, orang: [], pilihan: [], tidakTerjawab: 0 };
      peta.set(id, a);
    }
    return a;
  };
  const adaRincian = baris.some((b) => (rincian?.percobaan[b.akun_id]?.length ?? 0) > 0);
  if (adaRincian) {
    for (const b of baris) {
      const p1 = percobaanPertama(rincian, b.akun_id);
      if (!p1) continue;
      for (const s of p1.salah) ambil(s.soal_id).orang.push({ akun_id: b.akun_id, nama: b.nama, peran: b.peran, dipilih: s.dipilih });
    }
  } else {
    const idPerNama = new Map(baris.map((b) => [b.nama.toLowerCase(), b]));
    for (const t of rekap) {
      for (const s of t.salah) {
        const a = ambil(s.soal_id, s.pertanyaan);
        if (!a.kunci) a.kunci = s.kunci || null;
        for (const n of s.nama ?? []) {
          const b = idPerNama.get(n.toLowerCase());
          a.orang.push({ akun_id: b?.akun_id ?? 0, nama: n, peran: b?.peran ?? "PPL", dipilih: null });
        }
        if (!(s.nama ?? []).length) a.jumlah += s.jumlah; // tanpa nama: hanya angka
      }
    }
  }
  const hasil = Array.from(peta.values());
  for (const a of hasil) {
    a.jumlah = Math.max(a.orang.length, a.jumlah);
    const opsi = rincian?.soal[a.soal_id]?.opsi ?? {};
    a.pilihan = Object.keys(opsi)
      .sort()
      .map((h) => ({ huruf: h, teks: opsi[h], jumlah: a.orang.filter((o) => o.dipilih === h).length, benar: h === a.kunci }));
    a.tidakTerjawab = a.orang.filter((o) => !o.dipilih).length;
    a.orang.sort((x, y) => x.nama.localeCompare(y.nama, "id", { sensitivity: "base" }));
  }
  return hasil.sort((a, b) => b.jumlah - a.jumlah || a.pertanyaan.localeCompare(b.pertanyaan, "id"));
}

export type InfoTim = {
  kunci: string;
  pml: string;
  akunIds: number[];
  jumlahPpl: number;
  sudah: number;
  lulus: number;
  rataAwal: number | null;
  rataTerbaik: number | null;
  /** Rata-rata jumlah soal salah per orang pada percobaan pertama (hanya yang sudah mengisi); null bila rincian tak ada. */
  rataSalah: number | null;
};

export function ringkasTim(rekap: QcRekapTim[], rincian: RincianQc | undefined): InfoTim[] {
  return rekap.map((t, i) => {
    const ids = [...(t.pml_akun_id != null ? [t.pml_akun_id] : []), ...t.ppl.map((x) => x.akun_id)];
    let total = 0;
    let n = 0;
    for (const id of ids) {
      const p1 = percobaanPertama(rincian, id);
      if (p1) {
        total += p1.salah.length;
        n++;
      }
    }
    return {
      kunci: t.pml_akun_id != null ? String(t.pml_akun_id) : `tanpa-${i}`,
      pml: t.pml_nama || "PPL tanpa PML",
      akunIds: ids,
      jumlahPpl: t.jumlah_ppl,
      sudah: t.sudah,
      lulus: t.lulus,
      rataAwal: t.rata_awal,
      rataTerbaik: t.rata_terbaik,
      rataSalah: n > 0 ? Math.round((total / n) * 10) / 10 : null,
    };
  });
}

export type PetugasSalah = { akun_id: number; nama: string; peran: "PML" | "PPL"; pml: string | null; salah: number; jumlahSoal: number; skorAwal: number; percobaan: number; lulus: boolean };

export function petugasPalingSalah(baris: BarisQc[], rincian: RincianQc | undefined, batas = 10): PetugasSalah[] {
  const out: PetugasSalah[] = [];
  for (const b of baris) {
    const p1 = percobaanPertama(rincian, b.akun_id);
    if (!p1 || p1.salah.length === 0) continue;
    out.push({ akun_id: b.akun_id, nama: b.nama, peran: b.peran, pml: b.pml, salah: p1.salah.length, jumlahSoal: p1.jumlah, skorAwal: p1.skor, percobaan: b.percobaan, lulus: b.lulus });
  }
  out.sort((a, b) => b.salah - a.salah || a.skorAwal - b.skorAwal || a.nama.localeCompare(b.nama, "id"));
  return out.slice(0, Math.max(0, batas));
}

export type TempatSebaran = { label: string; jumlah: number; akunIds: number[]; nada: "ok" | "wait" | "bad" | "mut" };

/** Sebaran nilai percobaan pertama. "Belum mengisi" dipisah. Urut dari nilai tertinggi ke terendah, lalu belum mengisi. */
export function sebaranNilaiAwal(baris: BarisQc[]): TempatSebaran[] {
  const tempat: { label: string; min: number; nada: TempatSebaran["nada"]; ids: number[] }[] = [
    { label: "100", min: 100, nada: "ok", ids: [] },
    { label: "90–99", min: 90, nada: "ok", ids: [] },
    { label: "80–89", min: 80, nada: "wait", ids: [] },
    { label: "70–79", min: 70, nada: "wait", ids: [] },
    { label: "60–69", min: 60, nada: "wait", ids: [] },
    { label: "< 60", min: -Infinity, nada: "bad", ids: [] },
  ];
  const belum: number[] = [];
  for (const b of baris) {
    if (b.percobaan === 0) {
      belum.push(b.akun_id);
      continue;
    }
    const n = b.nilai[0] ?? null;
    if (n == null) continue;
    const t = tempat.find((x) => n >= x.min);
    t?.ids.push(b.akun_id);
  }
  return [...tempat.map((t) => ({ label: t.label, jumlah: t.ids.length, akunIds: t.ids, nada: t.nada })), { label: "Belum mengisi", jumlah: belum.length, akunIds: belum, nada: "mut" as const }];
}

/** Sebaran jumlah percobaan: 0 (belum mengisi), 1, 2, ... sampai `kolom`. */
export function sebaranPercobaan(baris: BarisQc[], kolom: number): TempatSebaran[] {
  const k = Math.max(1, kolom);
  const ids: number[][] = Array.from({ length: k + 1 }, () => []);
  for (const b of baris) ids[Math.min(b.percobaan, k)].push(b.akun_id);
  return ids.map((a, i) => ({ label: i === 0 ? "Belum mengisi" : `${i} percobaan`, jumlah: a.length, akunIds: a, nada: i === 0 ? ("bad" as const) : ("mut" as const) }));
}

export type RingkasStatus = {
  total: number;
  lulus: number[];
  belumLulus: number[];
  belum: number[];
  terlambat: number[];
  rataAwal: number | null;
  rataTerbaik: number | null;
};

export function ringkasStatus(baris: BarisQc[]): RingkasStatus {
  const rata = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  return {
    total: baris.length,
    lulus: baris.filter((b) => b.lulus).map((b) => b.akun_id),
    belumLulus: baris.filter((b) => b.percobaan > 0 && !b.lulus).map((b) => b.akun_id),
    belum: baris.filter((b) => b.percobaan === 0).map((b) => b.akun_id),
    terlambat: baris.filter((b) => b.terlambat).map((b) => b.akun_id),
    rataAwal: rata(baris.map((b) => b.nilai[0]).filter((n): n is number => n != null)),
    rataTerbaik: rata(baris.map((b) => b.terbaik).filter((n): n is number => n != null)),
  };
}
