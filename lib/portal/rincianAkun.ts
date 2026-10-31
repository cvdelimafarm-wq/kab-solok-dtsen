// lib/portal/rincianAkun.ts  (hanya server)
//
// (31 Okt 2026) Rincian akun dari data pendaftaran (nagari, HP, email, tanggal lahir) + penilaian Mitra SE2026.
// Dipakai /api/sigap/pengguna dan /api/sigap/penilaian-mitra. Aturan baca: lib/penggunaPool.rincianAkun.

import type { Db } from "@/lib/sigap";
import { rincianAkun, type BarisBencanaMitra, type BarisBencanaPetugas, type RincianAkun } from "@/lib/penggunaPool";

export type AkunTautan = { id: number; mitra_id: number | null; petugas_bencana_id: number | null };

const bagi = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/**
 * Nilai kolom "SE2026" di sigap_penilaian_mitra per akun (SQL 20261031j). null = tabelnya belum ada (pakai nilai lama bencana_petugas).
 */
export async function nilaiSe2026(db: Db, akunIds: number[]): Promise<Map<number, number> | null> {
  const { data: k, error } = await db.from("sigap_penilaian_kolom").select("id").eq("kode", "SE2026").maybeSingle();
  if (error) return null;
  const hasil = new Map<number, number>();
  if (!k) return hasil;
  for (const g of bagi(akunIds, 200)) {
    const { data } = await db.from("sigap_penilaian_mitra").select("akun_id, nilai").eq("kolom_id", (k as { id: number }).id).in("akun_id", g);
    for (const r of (data ?? []) as { akun_id: number; nilai: number }[]) hasil.set(r.akun_id, r.nilai);
  }
  return hasil;
}

/** Rincian per akun. Gagal baca = kosong, daftar tetap tampil. Penilaian SE2026 diambil dari tabel penilaian bila ada, kalau belum ada dari bencana_petugas. */
export async function rincianPerAkun(db: Db, akun: AkunTautan[]): Promise<Map<number, RincianAkun>> {
  const hasil = new Map<number, RincianAkun>();
  const mitra = new Map<number, BarisBencanaMitra>();
  const petugas = new Map<number, BarisBencanaPetugas>();
  try {
    for (const g of bagi([...new Set(akun.map((a) => a.mitra_id).filter((x): x is number => typeof x === "number"))], 200)) {
      const { data } = await db.from("bencana_mitra").select("id, alamat_desa, no_telp, email, tanggal_lahir").in("id", g);
      for (const m of (data ?? []) as BarisBencanaMitra[]) mitra.set(m.id, m);
    }
    for (const g of bagi([...new Set(akun.map((a) => a.petugas_bencana_id).filter((x): x is number => typeof x === "number"))], 200)) {
      const { data } = await db.from("bencana_petugas").select("id, alamat_nagari, no_hp, nilai_kinerja, nilai_kinerja_sumber").in("id", g);
      for (const m of (data ?? []) as BarisBencanaPetugas[]) petugas.set(m.id, m);
    }
  } catch {
    /* abaikan: kolom rincian kosong */
  }
  let se: Map<number, number> | null = null;
  try {
    se = await nilaiSe2026(db, akun.map((a) => a.id));
  } catch {
    se = null;
  }
  for (const a of akun) {
    const r = rincianAkun(a.mitra_id !== null ? mitra.get(a.mitra_id) : undefined, a.petugas_bencana_id !== null ? petugas.get(a.petugas_bencana_id) : undefined);
    if (se) r.nilai_se2026 = se.get(a.id) ?? null; // tabel penilaian adalah sumber; bila ada, nilai lama bencana_petugas diabaikan
    hasil.set(a.id, r);
  }
  return hasil;
}
