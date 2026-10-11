// lib/rekapIdentifikasi.ts
//
// (11 Okt 2026) Rekap hasil identifikasi untuk semua PML/PPL (tombol di tahap Pendataan) -- permintaan user.
// Hanya wilayah + status (terdampak / tidak terdampak / belum diidentifikasi); tidak ada angka KK atau rincian dampak. Murni (tanpa React/DB) supaya mudah diuji.

export type StatusRekap = "terdampak" | "tidak_terdampak" | "belum";
export type BarisRekap = { idsubsls: string; kecamatan: string; nagari: string; sls: string; sub_sls: string; status: StatusRekap };
export type TingkatRekap = "nagari" | "kecamatan";

export const LABEL_STATUS_REKAP: Record<StatusRekap, string> = { terdampak: "Terdampak", tidak_terdampak: "Tidak terdampak", belum: "Belum diidentifikasi" };

export type KelompokRekap = {
  kunci: string;
  judul: string; // nama nagari atau kecamatan
  induk: string | null; // kecamatan (khusus tingkat nagari)
  baris: BarisRekap[];
  terdampak: number;
  tidak: number;
  belum: number;
  nagari: number; // jumlah nagari di kelompok
};

/** "JORONG SAWAH TALUAK" -> "Jorong Sawah Taluak" */
export function rapikanNama(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s(/-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

const koleksi = new Intl.Collator("id", { numeric: true, sensitivity: "base" });
export const urutBaris = (a: BarisRekap, b: BarisRekap): number =>
  koleksi.compare(a.kecamatan, b.kecamatan) || koleksi.compare(a.nagari, b.nagari) || koleksi.compare(a.sls, b.sls) || koleksi.compare(a.sub_sls, b.sub_sls) || a.idsubsls.localeCompare(b.idsubsls);

/** Rapikan respons API: buang baris tak sah. Status "tidak_terdampak" / "belum" apa adanya; selain itu dianggap terdampak. */
export function periksaBarisRekap(x: unknown): BarisRekap[] {
  if (!Array.isArray(x)) return [];
  const out: BarisRekap[] = [];
  for (const r of x) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.idsubsls !== "string" || !/^\d{16}$/.test(o.idsubsls)) continue;
    out.push({
      idsubsls: o.idsubsls,
      kecamatan: String(o.kecamatan ?? ""),
      nagari: String(o.nagari ?? ""),
      sls: String(o.sls ?? ""),
      sub_sls: String(o.sub_sls ?? ""),
      status: o.status === "tidak_terdampak" ? "tidak_terdampak" : o.status === "belum" ? "belum" : "terdampak",
    });
  }
  return out.sort(urutBaris);
}

export function kelompokkan(baris: BarisRekap[], tingkat: TingkatRekap): KelompokRekap[] {
  const peta = new Map<string, KelompokRekap>();
  const nagariPer = new Map<string, Set<string>>();
  for (const b of [...baris].sort(urutBaris)) {
    const kunci = tingkat === "nagari" ? `${b.kecamatan}|${b.nagari}` : b.kecamatan;
    let k = peta.get(kunci);
    if (!k) {
      k = { kunci, judul: tingkat === "nagari" ? b.nagari : b.kecamatan, induk: tingkat === "nagari" ? b.kecamatan : null, baris: [], terdampak: 0, tidak: 0, belum: 0, nagari: 0 };
      peta.set(kunci, k);
      nagariPer.set(kunci, new Set());
    }
    k.baris.push(b);
    if (b.status === "tidak_terdampak") k.tidak += 1;
    else if (b.status === "belum") k.belum += 1;
    else k.terdampak += 1;
    nagariPer.get(kunci)!.add(b.nagari);
  }
  for (const [kunci, k] of peta) k.nagari = nagariPer.get(kunci)!.size;
  return [...peta.values()];
}

export type RingkasRekap = { total: number; terdampak: number; tidak: number; belum: number; nagari: number; kecamatan: number };
export function ringkasRekap(baris: BarisRekap[]): RingkasRekap {
  const nag = new Set<string>();
  const kec = new Set<string>();
  let tidak = 0;
  let belum = 0;
  for (const b of baris) {
    nag.add(`${b.kecamatan}|${b.nagari}`);
    kec.add(b.kecamatan);
    if (b.status === "tidak_terdampak") tidak += 1;
    else if (b.status === "belum") belum += 1;
  }
  return { total: baris.length, terdampak: baris.length - tidak - belum, tidak, belum, nagari: nag.size, kecamatan: kec.size };
}

/** Baris tampilan gambar: judul bagian (nagari, untuk tingkat kecamatan) atau isi (satu Sub SLS). */
export type BarisGambar = { jenis: "bagian"; teks: string; terdampak: number; tidak: number; belum: number } | { jenis: "isi"; teks: string; status: StatusRekap };

export function susunBarisGambar(k: KelompokRekap, tingkat: TingkatRekap): BarisGambar[] {
  const out: BarisGambar[] = [];
  let nagariSaatIni: string | null = null;
  for (const b of k.baris) {
    if (tingkat === "kecamatan" && b.nagari !== nagariSaatIni) {
      nagariSaatIni = b.nagari;
      const per = k.baris.filter((x) => x.nagari === b.nagari);
      const tidak = per.filter((x) => x.status === "tidak_terdampak").length;
      const belum = per.filter((x) => x.status === "belum").length;
      out.push({ jenis: "bagian", teks: `Nagari ${rapikanNama(b.nagari)}`, terdampak: per.length - tidak - belum, tidak, belum });
    }
    out.push({ jenis: "isi", teks: `${rapikanNama(b.sls)} · ${b.sub_sls}`, status: b.status });
  }
  return out;
}

/**
 * Bagi baris ke kolom (aliran ke bawah lalu ke kanan) dengan paling banyak `maks` baris per kolom.
 * Judul bagian tidak boleh jadi baris terakhir kolom (dipindah bersama isi pertamanya).
 */
export function bagiKolom(baris: BarisGambar[], maks: number): BarisGambar[][] {
  const batas = Math.max(2, Math.floor(maks));
  const kolom: BarisGambar[][] = [];
  let cur: BarisGambar[] = [];
  for (let i = 0; i < baris.length; i++) {
    const b = baris[i];
    const butuh = b.jenis === "bagian" ? 2 : 1; // judul bagian minta tempat untuk isi pertamanya
    if (cur.length > 0 && cur.length + butuh > batas) {
      kolom.push(cur);
      cur = [];
    }
    cur.push(b);
  }
  if (cur.length) kolom.push(cur);
  return kolom;
}

/** Nama berkas aman: rekap-identifikasi-<tingkat>-<nama>-<tanggal>. */
export function namaBerkasRekap(k: KelompokRekap, tingkat: TingkatRekap, tanggal: string): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return `rekap-identifikasi-${tingkat}-${slug(k.judul)}-${tanggal}`;
}

/** Baris Excel: hanya wilayah + status (termasuk yang belum diidentifikasi). */
export function barisExcel(baris: BarisRekap[]): Record<string, string>[] {
  return [...baris].sort(urutBaris).map((b) => ({
    Kecamatan: rapikanNama(b.kecamatan),
    Nagari: rapikanNama(b.nagari),
    SLS: rapikanNama(b.sls),
    "Sub SLS": b.sub_sls,
    "ID Sub SLS": b.idsubsls,
    Status: LABEL_STATUS_REKAP[b.status],
  }));
}

export function barisExcelPerNagari(baris: BarisRekap[]): Record<string, string | number>[] {
  return kelompokkan(baris, "nagari").map((k) => ({
    Kecamatan: rapikanNama(k.induk ?? ""),
    Nagari: rapikanNama(k.judul),
    "Total Sub SLS": k.baris.length,
    Terdampak: k.terdampak,
    "Tidak terdampak": k.tidak,
    "Belum diidentifikasi": k.belum,
  }));
}

// ----------------------------------------------------------------------------------------------
// (11 Okt 2026) Target dan realisasi identifikasi per PML -- permintaan user ("monitoring target realisasi").
// Target = Sub SLS pada SLS yang dialokasikan ke PML itu sebagai PELAKSANA (tiap SLS punya satu pelaksana, jadi jumlahnya tidak ganda);
// realisasi = dari target itu, yang sudah diidentifikasi. Peran pendamping dihitung terpisah (target & realisasi pendamping) agar tidak dobel.

export type BarisPml = {
  id: number;
  nama: string;
  target: number;
  realisasi: number;
  terdampak: number;
  tidak: number;
  target_pendamping: number;
  realisasi_pendamping: number;
};

/** Persen dibulatkan ke bawah supaya 99,6% tidak tampil "100%" sebelum benar-benar selesai. */
export const persenRealisasi = (realisasi: number, target: number): number => (target > 0 ? Math.min(100, Math.floor((realisasi / target) * 100)) : 0);

/** Gabungkan baris API (satu baris per PML per peran) menjadi satu baris per PML. */
export function periksaBarisPml(x: unknown): BarisPml[] {
  if (!Array.isArray(x)) return [];
  const peta = new Map<number, BarisPml>();
  for (const r of x) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = Number(o.pml_id);
    if (!Number.isInteger(id) || id <= 0) continue;
    const target = Math.max(0, Math.trunc(Number(o.target) || 0));
    const realisasi = Math.min(target, Math.max(0, Math.trunc(Number(o.realisasi) || 0)));
    const b = peta.get(id) ?? { id, nama: String(o.nama ?? ""), target: 0, realisasi: 0, terdampak: 0, tidak: 0, target_pendamping: 0, realisasi_pendamping: 0 };
    if (o.peran === "pendamping") {
      b.target_pendamping += target;
      b.realisasi_pendamping += realisasi;
    } else {
      b.target += target;
      b.realisasi += realisasi;
      b.terdampak += Math.max(0, Math.trunc(Number(o.terdampak) || 0));
      b.tidak += Math.max(0, Math.trunc(Number(o.tidak_terdampak) || 0));
    }
    peta.set(id, b);
  }
  return [...peta.values()].sort((a, b) => koleksi.compare(a.nama, b.nama));
}

export type UrutPml = "nama" | "terendah";
/** "terendah" = persen realisasi terkecil dulu (yang perlu dikejar), seri menurut sisa terbanyak lalu nama. */
export function urutkanPml(baris: BarisPml[], urut: UrutPml): BarisPml[] {
  const salin = [...baris];
  if (urut === "nama") return salin.sort((a, b) => koleksi.compare(a.nama, b.nama));
  return salin.sort((a, b) => {
    const pa = a.target > 0 ? a.realisasi / a.target : 2; // PML tanpa target di akhir
    const pb = b.target > 0 ? b.realisasi / b.target : 2;
    return pa - pb || b.target - b.realisasi - (a.target - a.realisasi) || koleksi.compare(a.nama, b.nama);
  });
}

export type RingkasPml = { pml: number; target: number; realisasi: number; belum: number; persen: number; selesai: number };
export function ringkasPml(baris: BarisPml[]): RingkasPml {
  let target = 0;
  let realisasi = 0;
  let selesai = 0;
  let pml = 0;
  for (const b of baris) {
    if (b.target > 0) pml += 1;
    target += b.target;
    realisasi += b.realisasi;
    if (b.target > 0 && b.realisasi >= b.target) selesai += 1;
  }
  return { pml, target, realisasi, belum: target - realisasi, persen: persenRealisasi(realisasi, target), selesai };
}

export function barisExcelPml(baris: BarisPml[]): Record<string, string | number>[] {
  return urutkanPml(baris, "nama").map((b) => ({
    PML: rapikanNama(b.nama),
    "Target Sub SLS (pelaksana)": b.target,
    "Realisasi (sudah diidentifikasi)": b.realisasi,
    Belum: b.target - b.realisasi,
    "Persen realisasi": persenRealisasi(b.realisasi, b.target),
    Terdampak: b.terdampak,
    "Tidak terdampak": b.tidak,
    "Target sebagai pendamping": b.target_pendamping,
    "Realisasi sebagai pendamping": b.realisasi_pendamping,
  }));
}

/**
 * Validasi baris PML yang SUDAH digabung server (respons API: satu baris per PML). Dipakai di klien --
 * periksaBarisPml hanya untuk baris mentah database (pml_id + peran), jadi tidak boleh dipakai ulang di sini.
 */
export function periksaBarisPmlJadi(x: unknown): BarisPml[] {
  if (!Array.isArray(x)) return [];
  const angka = (v: unknown) => Math.max(0, Math.trunc(Number(v) || 0));
  const out: BarisPml[] = [];
  for (const r of x) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = Number(o.id);
    if (!Number.isInteger(id) || id <= 0) continue;
    const target = angka(o.target);
    const targetPend = angka(o.target_pendamping);
    out.push({
      id,
      nama: String(o.nama ?? ""),
      target,
      realisasi: Math.min(target, angka(o.realisasi)),
      terdampak: angka(o.terdampak),
      tidak: angka(o.tidak),
      target_pendamping: targetPend,
      realisasi_pendamping: Math.min(targetPend, angka(o.realisasi_pendamping)),
    });
  }
  return out.sort((a, b) => koleksi.compare(a.nama, b.nama));
}
