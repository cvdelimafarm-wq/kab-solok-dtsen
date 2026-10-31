// lib/wilayah/wilayah.ts  (murni, tanpa basis data)
//
// (1 Nov 2026) Pencarian dan pemeriksaan kode wilayah terhadap master Kabupaten Solok yang tertanam di kode (masterSolok.ts).
// Kode: prov 2 + kab 2 + kec 3 + nagari 3 + SLS 4 + sub SLS 2 = 16 digit (idsubsls). iddesa = 10 digit pertama, idsls = 14 digit pertama.

import { MASTER_SOLOK } from "./masterSolok";

export const KODE_KABUPATEN = "1303";

export type InfoSls = {
  idsls: string; // 14 digit
  iddesa: string; // 10 digit
  kecamatan: string;
  nagari: string;
  sls: string;
  sub: string[]; // kode sub SLS 2 digit ("00" = tidak dipecah)
};

export type RingkasMaster = { kecamatan: number; nagari: number; sls: number; sub_sls: number };

/** "JORONG SAPAN  MUNGGU 3" -> "Jorong Sapan Munggu 3"; angka romawi pendek (I, II, IV, X) dipertahankan kapital. */
export function judulWilayah(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/(^|[\s\-(\/.])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(Ii|Iii|Iv|Vi|Vii|Viii|Ix|Xi|Xii)\b/g, (m) => m.toUpperCase())
    .replace(/\bX Koto\b/g, "X Koto")
    .replace(/\bKec\./g, "Kec.");
}

let cache: { sls: Map<string, InfoSls>; ringkas: RingkasMaster } | null = null;

function muat() {
  if (cache) return cache;
  const sls = new Map<string, InfoSls>();
  const kec = new Set<string>();
  const nag = new Set<string>();
  let sub = 0;
  for (const baris of MASTER_SOLOK.split("\n")) {
    const b = baris.trim();
    if (!b) continue;
    const [iddesa, kecamatan, nagari, daftar] = b.split("|");
    kec.add(kecamatan);
    nag.add(iddesa);
    for (const s of daftar.split(";")) {
      const [kode4, nama, subs] = s.split(":");
      const idsls = iddesa + kode4;
      const sublist = subs ? subs.split(",") : [];
      sub += sublist.length;
      sls.set(idsls, { idsls, iddesa, kecamatan: judulWilayah(kecamatan), nagari: judulWilayah(nagari), sls: judulWilayah(nama), sub: sublist });
    }
  }
  cache = { sls, ringkas: { kecamatan: kec.size, nagari: nag.size, sls: sls.size, sub_sls: sub } };
  return cache;
}

export const ringkasMaster = (): RingkasMaster => muat().ringkas;

/** Semua SLS master (urut kode); untuk daftar rujukan. */
export const semuaSls = (): InfoSls[] => [...muat().sls.values()];

/** SLS menurut 14 digit pertama kode (boleh kode 14-16 digit). Null bila tidak ada di master. */
export function cariSls(kode: string): InfoSls | null {
  if (!/^\d{14,16}$/.test(kode)) return null;
  return muat().sls.get(kode.slice(0, 14)) ?? null;
}

/** "Pantai Cermin › Surian › Jorong Lubuk Rasam" untuk kode yang dikenal; null bila tidak. */
export function namaWilayah(kode: string): string | null {
  const s = cariSls(kode);
  return s ? `${s.kecamatan} › ${s.nagari} › ${s.sls}` : null;
}

export type HasilKodeWilayah = { ok: true; info: InfoSls } | { ok: false; alasan: "terlalu_pendek" | "kabupaten_lain" | "nagari_tidak_ada" | "sls_tidak_ada" | "sub_tidak_ada"; pesan: string };

/**
 * Memeriksa kode (10-16 digit angka) terhadap master. Bukan galat tegas: pemanggil memutuskan (di impor sampel dijadikan peringatan).
 */
export function periksaKodeWilayah(kode: string): HasilKodeWilayah {
  const m = muat();
  if (kode.length < 14) {
    return { ok: false, alasan: "terlalu_pendek", pesan: `Kode ${kode} hanya ${kode.length} digit; kode SLS butuh 14 digit (16 digit bila sampai sub SLS), jadi SLS tidak bisa dipastikan.` };
  }
  if (kode.slice(2, 4) !== KODE_KABUPATEN.slice(2)) {
    return { ok: false, alasan: "kabupaten_lain", pesan: `Kode ${kode} bukan Kabupaten Solok (digit 3-4 harus ${KODE_KABUPATEN.slice(2)}); periksa apakah kolom kode wilayah benar.` };
  }
  const idsls = kode.slice(0, 14);
  const info = m.sls.get(idsls);
  if (!info) {
    const iddesa = kode.slice(0, 10);
    const adaNagari = [...m.sls.values()].some((s) => s.iddesa === iddesa);
    if (!adaNagari) return { ok: false, alasan: "nagari_tidak_ada", pesan: `Kode nagari ${iddesa} (10 digit pertama) tidak ada di master wilayah Kabupaten Solok.` };
    return { ok: false, alasan: "sls_tidak_ada", pesan: `Kode SLS ${idsls} tidak ada di master wilayah (nagari ada, nomor SLS ${kode.slice(10, 14)} tidak).` };
  }
  if (kode.length === 16 && !info.sub.includes(kode.slice(14))) {
    return { ok: false, alasan: "sub_tidak_ada", pesan: `Sub SLS ${kode.slice(14)} tidak ada pada ${info.sls} (${info.nagari}); sub SLS yang ada: ${info.sub.join(", ") || "-"}.` };
  }
  return { ok: true, info };
}

/**
 * Peringatan per baris untuk daftar kode terbaca (nomor = nomor baris Excel). Kode yang cocok master tidak menghasilkan apa pun.
 * Bentuk keluaran sama dengan `GalatBaris` di sampelSls.
 */
export function peringatanWilayah(kode: readonly string[], nomor: readonly number[]): { baris: number; pesan: string }[] {
  const hasil: { baris: number; pesan: string }[] = [];
  kode.forEach((k, i) => {
    const h = periksaKodeWilayah(k);
    if (!h.ok) hasil.push({ baris: nomor[i] ?? i + 2, pesan: h.pesan });
  });
  return hasil;
}
