// lib/anggaranRabUji.ts
//
// (22 Okt 2026) Penyimpanan UJI COBA RAB berversi untuk tab "Anggaran" di halaman Perencanaan (app/sigap/kelola/perencanaan).
// Seperti data perencanaan lainnya di halaman itu, RAB disimpan di BROWSER dulu (localStorage, kunci KUNCI_RAB) sampai aturan disetujui
// dan migrasi skema (claude/skema-sql/20261022b_keu_anggaran.sql) diterapkan. Logika murni (tanpa React/DB) supaya bisa diuji.
//
// Aturan yang dijaga di sini (cermin rancangan):
//  - v1 = salinan POK dan TIDAK bisa diubah.
//  - RAB tidak pernah ditimpa: hanya versi TERAKHIR yang boleh diubah, dan hanya bila nomornya > 1. Membuat versi baru
//    menyalin versi terakhir, sehingga versi sebelumnya membeku.
//  - Tiap versi menyimpan tanggal dan alasan; versi baru wajib beralasan (alasanSah, min. 10 karakter).

import { jumlahBaris, rentangBawaan, salinPokKeRab, totalRab, type BarisRab, type SelisihItem } from "./anggaranRab";
import { kunciDetail, type DetailPok } from "./perencanaanPok";

export const KUNCI_RAB = "sigap_uji_rab_v1";

export type RabVersi = {
  no: number;
  /** ISO. */
  tanggal: string;
  alasan: string;
  rentangPersen: number;
  baris: BarisRab[];
};
export type RabRo = { versi: RabVersi[]; terpilih: number };
export type DataRab = Record<string, RabRo>;

export const alasanSah = (a: string): boolean => a.trim().length >= 10;

const angka = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function barisSah(b: unknown): b is BarisRab {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return (
    (o.kunci === null || typeof o.kunci === "string") &&
    typeof o.akun === "string" &&
    typeof o.uraian === "string" &&
    angka(o.volume) &&
    typeof o.satuan === "string" &&
    angka(o.harga)
  );
}

/** Baca isi localStorage dengan aman: data rusak/tidak dikenal diabaikan per RO, bukan membuat halaman gagal. */
export function bacaRab(raw: string | null): DataRab {
  if (!raw) return {};
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) return {};
  const hasil: DataRab = {};
  for (const [roId, v] of Object.entries(j as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    if (!Array.isArray(r.versi) || r.versi.length === 0) continue;
    const versi: RabVersi[] = [];
    let sah = true;
    for (const x of r.versi) {
      const o = x as Record<string, unknown>;
      if (!o || !angka(o.no) || typeof o.tanggal !== "string" || typeof o.alasan !== "string" || !angka(o.rentangPersen) || !Array.isArray(o.baris) || !o.baris.every(barisSah)) {
        sah = false;
        break;
      }
      versi.push({ no: o.no, tanggal: o.tanggal, alasan: o.alasan, rentangPersen: o.rentangPersen, baris: o.baris as BarisRab[] });
    }
    if (!sah) continue;
    const nomor = versi.map((x) => x.no);
    const terpilih = angka(r.terpilih) && nomor.includes(r.terpilih) ? r.terpilih : nomor[nomor.length - 1];
    hasil[roId] = { versi, terpilih };
  }
  return hasil;
}

/** RAB awal sebuah RO: v1 = salinan POK. */
export function awalRab(pokRo: DetailPok[], tanggal: string): RabRo {
  return { versi: [{ no: 1, tanggal, alasan: "Salinan POK", rentangPersen: rentangBawaan(1), baris: salinPokKeRab(pokRo) }], terpilih: 1 };
}

export const versiTerakhir = (r: RabRo): RabVersi => r.versi[r.versi.length - 1];
export const versiDipilih = (r: RabRo): RabVersi => r.versi.find((v) => v.no === r.terpilih) ?? versiTerakhir(r);

/** Boleh diubah? Hanya versi terakhir dan bukan v1. */
export const bolehUbah = (r: RabRo, no: number): boolean => no > 1 && no === versiTerakhir(r).no;

/** Buat versi baru dari versi terakhir. Mengembalikan null bila alasan kurang. */
export function versiBaru(r: RabRo, alasan: string, tanggal: string): RabRo | null {
  if (!alasanSah(alasan)) return null;
  const akhir = versiTerakhir(r);
  const no = akhir.no + 1;
  const baru: RabVersi = { no, tanggal, alasan: alasan.trim(), rentangPersen: rentangBawaan(no), baris: akhir.baris.map((b) => ({ ...b, jadwal: b.jadwal ? b.jadwal.map((j) => ({ ...j })) : undefined })) };
  return { versi: [...r.versi, baru], terpilih: no };
}

/** Ubah volume/harga satu baris. Mengembalikan RAB yang sama (tak berubah) bila versi itu terkunci. Nilai tidak sah (negatif/bukan angka) ditolak. */
export function ubahBaris(r: RabRo, no: number, indeks: number, ubah: { volume?: number; harga?: number; rentangPersen?: number }): RabRo {
  if (!bolehUbah(r, no)) return r;
  const v = versiTerakhir(r);
  if (indeks < 0 || indeks >= v.baris.length) return r;
  for (const n of [ubah.volume, ubah.harga]) if (n !== undefined && (!angka(n) || n < 0)) return r;
  const baris = v.baris.map((b, i) => (i === indeks ? { ...b, volume: ubah.volume ?? b.volume, harga: ubah.harga ?? b.harga } : b));
  const rentang = ubah.rentangPersen !== undefined && angka(ubah.rentangPersen) && ubah.rentangPersen >= 0 && ubah.rentangPersen <= 100 ? ubah.rentangPersen : v.rentangPersen;
  return { ...r, versi: [...r.versi.slice(0, -1), { ...v, baris, rentangPersen: rentang }] };
}

export const pilihVersi = (r: RabRo, no: number): RabRo => (r.versi.some((v) => v.no === no) ? { ...r, terpilih: no } : r);

export const paguPok = (pokRo: Pick<DetailPok, "jumlah">[]): number => pokRo.reduce((s, d) => s + d.jumlah, 0);

export type CocokPok = {
  /** true bila v1 masih sama dengan POK sekarang (baris dan pagu). */
  sama: boolean;
  paguV1: number;
  paguPok: number;
  /** Baris POK sekarang yang tidak ada di v1. */
  baru: number;
  /** Baris v1 (berasal dari POK) yang tidak ada lagi di POK sekarang. */
  hilang: number;
};

/**
 * Apakah RAB tersimpan masih selaras dengan POK sekarang? Dipakai untuk mendeteksi RAB "basi": POK direset (Kembalikan contoh awal) atau dimuat ulang
 * dengan baris/angka berbeda sesudah v1 dibuat. Yang dibandingkan v1 (salinan POK), bukan versi berikutnya yang memang boleh berbeda.
 */
export function cocokDenganPok(r: RabRo, pokRo: DetailPok[]): CocokPok {
  const v1 = r.versi[0];
  const kunciV1 = new Set(v1.baris.map((b) => b.kunci).filter((k): k is string => k !== null));
  const kunciPok = new Set(pokRo.map((d) => kunciDetail(d)));
  const baru = [...kunciPok].filter((k) => !kunciV1.has(k)).length;
  const hilang = [...kunciV1].filter((k) => !kunciPok.has(k)).length;
  const paguV1 = totalRab(v1.baris);
  const pagu = paguPok(pokRo);
  return { sama: baru === 0 && hilang === 0 && paguV1 === pagu, paguV1, paguPok: pagu, baru, hilang };
}

/** Selisih per baris POK (pagu baris - RAB baris). Baris POK yang tak ada di RAB dianggap RAB 0; baris RAB di luar POK menambah kebutuhan. */
export function selisihBaris(pokRo: DetailPok[], baris: BarisRab[], programKode: string, roKode: string): SelisihItem[] {
  const rab = new Map<string, number>();
  for (const b of baris) if (b.kunci) rab.set(b.kunci, (rab.get(b.kunci) ?? 0) + jumlahBaris(b));
  const item: SelisihItem[] = pokRo.map((d) => {
    const k = kunciDetail(d);
    return { kunci: `${roKode}::${k}`, uraian: d.uraian, programKode, roKode, selisih: d.jumlah - (rab.get(k) ?? 0) };
  });
  baris.forEach((b, i) => {
    if (b.kunci === null) item.push({ kunci: `${roKode}::luar-pok-${i}`, uraian: b.uraian, programKode, roKode, selisih: -jumlahBaris(b) });
  });
  return item;
}

export { totalRab };
