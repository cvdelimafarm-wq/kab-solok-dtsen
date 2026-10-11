// lib/rekapIdentifikasi.ts
//
// (11 Okt 2026) Rekap hasil identifikasi untuk semua PML/PPL (tombol di tahap Pendataan) -- permintaan user.
// Hanya wilayah + status (terdampak / tidak terdampak); tidak ada angka KK atau rincian dampak. Murni (tanpa React/DB) supaya mudah diuji.

export type StatusRekap = "terdampak" | "tidak_terdampak";
export type BarisRekap = { idsubsls: string; kecamatan: string; nagari: string; sls: string; sub_sls: string; status: StatusRekap };
export type TingkatRekap = "nagari" | "kecamatan";

export const LABEL_STATUS_REKAP: Record<StatusRekap, string> = { terdampak: "Terdampak", tidak_terdampak: "Tidak terdampak" };

export type KelompokRekap = {
  kunci: string;
  judul: string; // nama nagari atau kecamatan
  induk: string | null; // kecamatan (khusus tingkat nagari)
  baris: BarisRekap[];
  terdampak: number;
  tidak: number;
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

/** Rapikan respons API: buang baris tak sah, status apa adanya (selain "tidak_terdampak" dianggap terdampak). */
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
      status: o.status === "tidak_terdampak" ? "tidak_terdampak" : "terdampak",
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
      k = { kunci, judul: tingkat === "nagari" ? b.nagari : b.kecamatan, induk: tingkat === "nagari" ? b.kecamatan : null, baris: [], terdampak: 0, tidak: 0, nagari: 0 };
      peta.set(kunci, k);
      nagariPer.set(kunci, new Set());
    }
    k.baris.push(b);
    if (b.status === "tidak_terdampak") k.tidak += 1;
    else k.terdampak += 1;
    nagariPer.get(kunci)!.add(b.nagari);
  }
  for (const [kunci, k] of peta) k.nagari = nagariPer.get(kunci)!.size;
  return [...peta.values()];
}

export type RingkasRekap = { total: number; terdampak: number; tidak: number; nagari: number; kecamatan: number };
export function ringkasRekap(baris: BarisRekap[]): RingkasRekap {
  const nag = new Set<string>();
  const kec = new Set<string>();
  let tidak = 0;
  for (const b of baris) {
    nag.add(`${b.kecamatan}|${b.nagari}`);
    kec.add(b.kecamatan);
    if (b.status === "tidak_terdampak") tidak += 1;
  }
  return { total: baris.length, terdampak: baris.length - tidak, tidak, nagari: nag.size, kecamatan: kec.size };
}

/** Baris tampilan gambar: judul bagian (nagari, untuk tingkat kecamatan) atau isi (satu Sub SLS). */
export type BarisGambar = { jenis: "bagian"; teks: string; terdampak: number; tidak: number } | { jenis: "isi"; teks: string; status: StatusRekap };

export function susunBarisGambar(k: KelompokRekap, tingkat: TingkatRekap): BarisGambar[] {
  const out: BarisGambar[] = [];
  let nagariSaatIni: string | null = null;
  for (const b of k.baris) {
    if (tingkat === "kecamatan" && b.nagari !== nagariSaatIni) {
      nagariSaatIni = b.nagari;
      const per = k.baris.filter((x) => x.nagari === b.nagari);
      const tidak = per.filter((x) => x.status === "tidak_terdampak").length;
      out.push({ jenis: "bagian", teks: `Nagari ${rapikanNama(b.nagari)}`, terdampak: per.length - tidak, tidak });
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

/** Baris Excel: hanya wilayah + status. */
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
    "Sub SLS teridentifikasi": k.baris.length,
    Terdampak: k.terdampak,
    "Tidak terdampak": k.tidak,
  }));
}
