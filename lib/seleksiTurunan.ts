// lib/seleksiTurunan.ts  (murni, tanpa basis data)
//
// (1 Nov 2026) Usulan untuk rancangan seleksi yang DITURUNKAN dari data yang sudah ada, supaya PJ tidak mengetik ulang:
//   - kebutuhan PPL/PML dari identifikasi lanjutan yang tertaut ke kegiatan (peran.ppl/pml: nOrg + nMit), dan jumlah organik yang sudah di-plot (sigap_penugasan);
//   - wilayah sampel dari sampel yang diimpor PJ (sigap_sampel, per SLS), dinamai dengan master wilayah tertanam (lib/wilayah).
// Hanya usulan: PJ memutuskan lewat tombol "Terapkan". Aturan kelayakan tetap di lib/seleksiSyarat.ts.

import { MAKS_WILAYAH, type WilayahSeleksi } from "@/lib/seleksiSyarat";
import { cariSls } from "@/lib/wilayah/wilayah";

export type PeranLj = { on: boolean; nOrg: number; nMit: number; fix: boolean };

export type UsulanKebutuhan = {
  kebutuhan_ppl: number;
  kebutuhan_pml: number;
  sudah_ppl: number;
  sudah_pml: number;
  org_ppl: number;
  org_pml: number;
  mit_ppl: number;
  mit_pml: number;
  /** Ada peran yang jumlahnya masih Perkiraan (belum Fix) pada lanjutan. */
  perkiraan: boolean;
};

const bulat = (n: unknown): number => {
  const x = Math.floor(Number(n));
  return Number.isFinite(x) && x > 0 ? x : 0;
};

/**
 * Kebutuhan total tiap peran = organik + Mitra yang direncanakan (0 bila peran tidak dipakai).
 * "Sudah di-plot organik" = penugasan aktif organik pada peran itu, dibatasi kebutuhan total. Sisa yang diseleksi = kebutuhan - sudah (lib/seleksiSyarat.sisaKebutuhan).
 */
export function usulanKebutuhan(peran: { ppl?: PeranLj | null; pml?: PeranLj | null }, organikTerplot: { ppl: number; pml: number }): UsulanKebutuhan {
  const satu = (p: PeranLj | null | undefined) => {
    const aktif = !!p && p.on === true;
    const org = aktif ? bulat(p.nOrg) : 0;
    const mit = aktif ? bulat(p.nMit) : 0;
    return { org, mit, total: org + mit, perkiraan: aktif && p.fix !== true };
  };
  const a = satu(peran.ppl);
  const b = satu(peran.pml);
  return {
    kebutuhan_ppl: a.total,
    kebutuhan_pml: b.total,
    sudah_ppl: Math.min(bulat(organikTerplot.ppl), a.total),
    sudah_pml: Math.min(bulat(organikTerplot.pml), b.total),
    org_ppl: a.org,
    org_pml: b.org,
    mit_ppl: a.mit,
    mit_pml: b.mit,
    perkiraan: a.perkiraan || b.perkiraan,
  };
}

export type BarisSampelMin = { kode_wilayah: string; kode_sls: string; status: string; lat: number | null; lng: number | null };
export type HasilWilayahSampel = {
  wilayah: WilayahSeleksi[];
  /** Jumlah SLS berbeda pada sampel (sebelum dipotong). */
  sls: number;
  /** Baris sampel berstatus utama (dihitung sebagai sampel; cadangan tidak). */
  baris_utama: number;
  /** SLS pada sampel yang tidak dikenal master wilayah (nama tidak bisa diturunkan, domisili tidak bisa dicocokkan). */
  tak_dikenal: number;
  /** SLS yang tidak dimasukkan karena melebihi batas wilayah per seleksi. */
  terpotong: number;
};

const titikSah = (lat: number | null | undefined, lng: number | null | undefined): lat is number =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && lat >= -11.5 && lat <= 6.5 && lng >= 94.5 && lng <= 141.5;

const rata = (a: number[]): number => Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 1e6) / 1e6;

/**
 * Sampel -> wilayah seleksi per SLS (14 digit). Titik wilayah = rata-rata titik sampel utama pada SLS itu; bila tidak ada, titik sub SLS dari master koordinat (`koordSls`,
 * sudah dirata-rata per SLS oleh pemanggil). Jumlah sampel = baris berstatus utama. Kebutuhan per wilayah tidak diturunkan (0).
 */
export function wilayahDariSampel(baris: readonly BarisSampelMin[], koordSls: ReadonlyMap<string, { lat: number; lng: number }>, maks: number = MAKS_WILAYAH): HasilWilayahSampel {
  const per = new Map<string, { utama: number; lat: number[]; lng: number[] }>();
  let utama = 0;
  for (const b of baris) {
    const sls = String(b.kode_sls ?? "").slice(0, 14);
    if (sls.length < 10) continue;
    const g = per.get(sls) ?? { utama: 0, lat: [], lng: [] };
    if (b.status === "utama") {
      g.utama++;
      utama++;
      if (titikSah(b.lat, b.lng)) {
        g.lat.push(b.lat as number);
        g.lng.push(b.lng as number);
      }
    }
    per.set(sls, g);
  }
  const semua = [...per.keys()].sort();
  let takDikenal = 0;
  const wilayah: WilayahSeleksi[] = [];
  for (const sls of semua) {
    const g = per.get(sls) as { utama: number; lat: number[]; lng: number[] };
    const info = cariSls(sls);
    if (!info) takDikenal++;
    const dariMaster = koordSls.get(sls);
    const lat = g.lat.length > 0 ? rata(g.lat) : dariMaster?.lat ?? null;
    const lng = g.lng.length > 0 ? rata(g.lng) : dariMaster?.lng ?? null;
    wilayah.push({
      kode: sls,
      nama: info ? `${info.nagari} · ${info.sls}` : `SLS ${sls}`,
      kecamatan: info ? info.kecamatan.toUpperCase() : null,
      nagari: info ? info.nagari.toUpperCase() : null,
      lat,
      lng,
      jumlah_sampel: g.utama,
      kebutuhan_ppl: 0,
      kebutuhan_pml: 0,
    });
  }
  const dipakai = wilayah.slice(0, maks);
  return { wilayah: dipakai, sls: semua.length, baris_utama: utama, tak_dikenal: takDikenal, terpotong: Math.max(0, wilayah.length - dipakai.length) };
}

/** Rata-rata titik sub SLS per SLS (14 digit pertama idsubsls). */
export function koordinatPerSls(baris: readonly { idsubsls: string; lat: number; lon: number }[]): Map<string, { lat: number; lng: number }> {
  const g = new Map<string, { lat: number[]; lng: number[] }>();
  for (const b of baris) {
    const id = String(b.idsubsls ?? "");
    if (id.length < 14 || !titikSah(b.lat, b.lon)) continue;
    const k = id.slice(0, 14);
    const x = g.get(k) ?? { lat: [], lng: [] };
    x.lat.push(b.lat);
    x.lng.push(b.lon);
    g.set(k, x);
  }
  return new Map([...g].map(([k, v]) => [k, { lat: rata(v.lat), lng: rata(v.lng) }]));
}

/** Apakah isian form (teks) sudah sama dengan usulan; dipakai UI untuk menandai "sudah sama". */
export function kebutuhanSama(form: { kebutuhan_ppl: string; kebutuhan_pml: string; sudah_ppl: string; sudah_pml: string }, u: UsulanKebutuhan): boolean {
  const n = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));
  return n(form.kebutuhan_ppl) === u.kebutuhan_ppl && n(form.kebutuhan_pml) === u.kebutuhan_pml && n(form.sudah_ppl) === u.sudah_ppl && n(form.sudah_pml) === u.sudah_pml;
}
