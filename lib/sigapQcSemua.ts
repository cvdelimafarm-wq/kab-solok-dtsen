// lib/sigapQcSemua.ts  (murni; dipakai server DAN klien)
//
// (30 Okt 2026) "Semua periode" QC Pemahaman: merekap nilai SELURUH hari ber-soal (tanpa batas 62 hari) per petugas. Beda dengan matriks rentang
// (petugas x hari), di sini tiap petugas diringkas menjadi: rata-rata nilai untuk tiap urutan percobaan (P1..Pn) di seluruh hari yang ia isi,
// rata-rata nilai awal dan nilai terbaik, serta selisihnya (naik/turun). Ada pula rata-rata keseluruhan per P dan pergerakan per hari.
// Pengambilan data ada di lib/portal/qc.ts (semuaAdmin); berkas ini hanya menyusun dan menyaring.

import type { PesertaMentah } from "@/lib/sigapQcMonitor";
import type { PercobaanRentang } from "@/lib/sigapQcRentang";

/** Batas jumlah kolom P (sama dengan tabel per tanggal). */
export const MAKS_KOLOM_P = 10;

const bulat1 = (x: number) => Math.round(x * 10) / 10;
const rata = (a: number[]): number | null => (a.length ? bulat1(a.reduce((s, x) => s + x, 0) / a.length) : null);

export type BarisSemua = {
  akun_id: number;
  nama: string;
  peran: "PML" | "PPL";
  /** Nama PML timnya; untuk baris PML = null. */
  pml: string | null;
  hari_terisi: number;
  hari_lulus: number;
  hari_kosong: number;
  total_percobaan: number;
  /** Rata-rata nilai percobaan ke-(i+1) pada hari-hari yang punya percobaan ke-(i+1); null = tidak pernah sampai percobaan itu. */
  rata_p: (number | null)[];
  /** Berapa hari yang punya percobaan ke-(i+1). */
  hari_p: number[];
  /** Rata-rata nilai awal (percobaan pertama tiap hari) dan nilai terbaik tiap hari; null bila tidak pernah mengisi. */
  rata_awal: number | null;
  rata_terbaik: number | null;
  /** rata_terbaik - rata_awal (positif = membaik lewat ulangan); null bila tidak pernah mengisi. */
  naik: number | null;
  pernah_terlambat: boolean;
};

export type HariSemua = {
  tanggal: string;
  peserta: number;
  sudah: number;
  lulus: number;
  rata_awal: number | null;
  rata_terbaik: number | null;
};

export type DataSemua = {
  dari: string | null;
  sampai: string | null;
  hari: string[];
  nilai_lulus: number;
  peserta: number;
  /** Jumlah kolom P (percobaan terbanyak yang pernah ada, 1..MAKS_KOLOM_P). */
  kolom: number;
  baris: BarisSemua[];
  /** Rata-rata semua percobaan ke-(i+1) dari semua petugas dan semua hari, dan banyaknya percobaan itu. */
  rata_p_semua: (number | null)[];
  jumlah_p_semua: number[];
  per_hari: HariSemua[];
  kepatuhan_persen: number | null;
  tidak_pernah: number;
};

/** Menyusun rekap. Percobaan di luar `hari` atau milik akun yang bukan peserta diabaikan. */
export function susunSemua(input: { hari: string[]; peserta: PesertaMentah[]; percobaan: PercobaanRentang[]; nilaiLulus: number }): DataSemua {
  const { peserta, percobaan, nilaiLulus } = input;
  const hari = [...new Set(input.hari)].sort();
  const adaHari = new Set(hari);
  const pesertaSah = peserta.filter((p) => p.peran === "pml" || p.peran === "ppl");
  const dikenal = new Set(pesertaSah.map((p) => p.akun_id));

  const tumpuk = new Map<string, PercobaanRentang[]>(); // "akun|tanggal"
  let kolom = 1;
  for (const c of percobaan) {
    if (!adaHari.has(c.tanggal) || !dikenal.has(c.akun_id) || !Number.isInteger(c.ke) || c.ke < 1) continue;
    kolom = Math.max(kolom, Math.min(c.ke, MAKS_KOLOM_P));
    const k = `${c.akun_id}|${c.tanggal}`;
    const a = tumpuk.get(k);
    if (a) a.push(c);
    else tumpuk.set(k, [c]);
  }

  const semuaP: number[][] = Array.from({ length: kolom }, () => []);
  const awalHari = new Map<string, number[]>();
  const terbaikHari = new Map<string, number[]>();
  const lulusHari = new Map<string, number>();

  const baris: BarisSemua[] = pesertaSah
    .map((p) => {
      const perP: number[][] = Array.from({ length: kolom }, () => []);
      const awal: number[] = [];
      const terbaikList: number[] = [];
      let hariLulus = 0;
      let total = 0;
      let terlambat = false;
      for (const t of hari) {
        const daftar = tumpuk.get(`${p.akun_id}|${t}`);
        if (!daftar || daftar.length === 0) continue;
        const urut = [...daftar].sort((a, b) => a.ke - b.ke);
        total += urut.length;
        for (const x of urut) {
          if (x.ke <= kolom) {
            perP[x.ke - 1].push(x.skor);
            semuaP[x.ke - 1].push(x.skor);
          }
          if (x.terlambat) terlambat = true;
        }
        const terbaik = Math.max(...urut.map((x) => x.skor));
        awal.push(urut[0].skor);
        terbaikList.push(terbaik);
        if (!awalHari.has(t)) awalHari.set(t, []);
        awalHari.get(t)!.push(urut[0].skor);
        if (!terbaikHari.has(t)) terbaikHari.set(t, []);
        terbaikHari.get(t)!.push(terbaik);
        if (terbaik >= nilaiLulus) {
          hariLulus++;
          lulusHari.set(t, (lulusHari.get(t) ?? 0) + 1);
        }
      }
      const rAwal = rata(awal);
      const rTerbaik = rata(terbaikList);
      return {
        akun_id: p.akun_id,
        nama: p.nama,
        peran: p.peran === "pml" ? ("PML" as const) : ("PPL" as const),
        pml: p.peran === "pml" ? null : p.pml_nama,
        hari_terisi: awal.length,
        hari_lulus: hariLulus,
        hari_kosong: hari.length - awal.length,
        total_percobaan: total,
        rata_p: perP.map(rata),
        hari_p: perP.map((x) => x.length),
        rata_awal: rAwal,
        rata_terbaik: rTerbaik,
        naik: rAwal != null && rTerbaik != null ? bulat1(rTerbaik - rAwal) : null,
        pernah_terlambat: terlambat,
      };
    })
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));

  const per_hari: HariSemua[] = hari.map((t) => ({
    tanggal: t,
    peserta: baris.length,
    sudah: awalHari.get(t)?.length ?? 0,
    lulus: lulusHari.get(t) ?? 0,
    rata_awal: rata(awalHari.get(t) ?? []),
    rata_terbaik: rata(terbaikHari.get(t) ?? []),
  }));
  const selTotal = baris.length * hari.length;
  const selIsi = baris.reduce((a, b) => a + b.hari_terisi, 0);

  return {
    dari: hari[0] ?? null,
    sampai: hari[hari.length - 1] ?? null,
    hari,
    nilai_lulus: nilaiLulus,
    peserta: baris.length,
    kolom,
    baris,
    rata_p_semua: semuaP.map(rata),
    jumlah_p_semua: semuaP.map((x) => x.length),
    per_hari,
    kepatuhan_persen: selTotal > 0 ? Math.round((selIsi / selTotal) * 100) : null,
    tidak_pernah: hari.length > 0 ? baris.filter((b) => b.hari_terisi === 0).length : 0,
  };
}

// ------------------------------------------------------------------ saringan dan urutan di klien
export type UrutSemua = "nama" | "nilai_rendah" | "nilai_tinggi" | "paling_sedikit" | "naik_terbesar";
export const LABEL_URUT_SEMUA: Record<UrutSemua, string> = {
  nama: "Nama (A-Z)",
  nilai_rendah: "Nilai terbaik terendah",
  nilai_tinggi: "Nilai terbaik tertinggi",
  paling_sedikit: "Paling jarang mengisi",
  naik_terbesar: "Kenaikan terbesar",
};
export type SaringanSemua = { peran: "semua" | "PML" | "PPL"; pml: string; cari: string };
export const SARINGAN_SEMUA_AWAL: SaringanSemua = { peran: "semua", pml: "", cari: "" };

export function saringBarisSemua(baris: BarisSemua[], s: SaringanSemua): BarisSemua[] {
  const q = s.cari.trim().toLowerCase();
  return baris.filter((b) => {
    if (s.peran !== "semua" && b.peran !== s.peran) return false;
    if (s.pml && (b.peran === "PML" ? b.nama : b.pml) !== s.pml) return false;
    if (q && !b.nama.toLowerCase().includes(q) && !(b.pml ?? "").toLowerCase().includes(q)) return false;
    return true;
  });
}

export function urutkanSemua(baris: BarisSemua[], urut: UrutSemua): BarisSemua[] {
  const a = [...baris];
  const nama = (x: BarisSemua, y: BarisSemua) => x.nama.localeCompare(y.nama, "id");
  switch (urut) {
    case "nilai_rendah":
      return a.sort((x, y) => (x.rata_terbaik ?? -1) - (y.rata_terbaik ?? -1) || nama(x, y)); // yang belum pernah mengisi paling atas
    case "nilai_tinggi":
      return a.sort((x, y) => (y.rata_terbaik ?? -1) - (x.rata_terbaik ?? -1) || nama(x, y));
    case "paling_sedikit":
      return a.sort((x, y) => x.hari_terisi - y.hari_terisi || nama(x, y));
    case "naik_terbesar":
      return a.sort((x, y) => (y.naik ?? -Infinity) - (x.naik ?? -Infinity) || nama(x, y));
    default:
      return a.sort(nama);
  }
}

export function daftarTimSemua(baris: BarisSemua[]): string[] {
  const s = new Set<string>();
  for (const b of baris) {
    const t = b.peran === "PML" ? b.nama : b.pml;
    if (t) s.add(t);
  }
  return [...s].sort((a, b) => a.localeCompare(b, "id"));
}
