// lib/sigapAturanDb.ts  (khusus server)
//
// (2 Nov 2026) Aturan nilai & kelulusan per kegiatan pelatihan (tabel sigap_pelatihan_aturan, SQL 20261102zl). Pembacaan tahan galat:
// tabel belum ada / gagal dibaca = bawaan (PSP = versi 1, selain itu versi 2), sehingga sistem tetap berjalan sebelum SQL dijalankan.

import type { Db } from "@/lib/sigap";
import { rapikanAturan, type AturanPelatihan } from "@/lib/sigapAturanTes";

export const PESAN_SQL_ATURAN = "Tabel aturan pelatihan belum ada di database. Jalankan SQL 20261102zl_aturan_nilai_v2.sql, lalu simpan ulang.";

export async function muatAturan(db: Db, kegiatanId: number): Promise<AturanPelatihan> {
  let kode: string | null = null;
  try {
    const { data } = await db.from("sigap_kegiatan").select("kode").eq("id", kegiatanId).maybeSingle();
    kode = (data?.kode as string | undefined) ?? null;
  } catch {
    /* kode tak terbaca: bawaan versi 2 */
  }
  try {
    const { data, error } = await db.from("sigap_pelatihan_aturan").select("aturan_versi, blokir_tahap, izin_ajukan").eq("kegiatan_id", kegiatanId).maybeSingle();
    if (error) return rapikanAturan(null, kode);
    return rapikanAturan((data as Record<string, unknown> | null) ?? null, kode);
  } catch {
    return rapikanAturan(null, kode);
  }
}

export async function simpanAturan(db: Db, kegiatanId: number, a: Pick<AturanPelatihan, "versi" | "blokir_tahap" | "izin_ajukan">, oleh: string): Promise<{ ok: true } | { ok: false; pesan: string }> {
  try {
    const { error } = await db
      .from("sigap_pelatihan_aturan")
      .upsert({ kegiatan_id: kegiatanId, aturan_versi: a.versi, blokir_tahap: a.blokir_tahap, izin_ajukan: a.izin_ajukan, diubah_oleh: oleh.slice(0, 120), diubah_at: new Date().toISOString() }, { onConflict: "kegiatan_id" });
    if (error) return { ok: false, pesan: /relation|does not exist|schema cache/i.test(error.message) ? PESAN_SQL_ATURAN : error.message };
    return { ok: true };
  } catch {
    return { ok: false, pesan: PESAN_SQL_ATURAN };
  }
}

/**
 * Skor percobaan PERTAMA per sesi tes (kunci: id sesi). Dibaca dari kolom skor_awal; sesi yang sudah mengulang tetapi skor_awal-nya kosong dilengkapi dari arsip.
 * Tahan galat: kolom skor_awal belum ada -> hanya arsip yang dipakai.
 */
export async function muatSkorPertama(db: Db, sesiIds: readonly number[]): Promise<Map<number, number>> {
  const hasil = new Map<number, number>();
  if (sesiIds.length === 0) return hasil;
  const ids = [...sesiIds];
  try {
    const { data, error } = await db.from("sigap_tes_sesi").select("id, skor_awal").in("id", ids).not("skor_awal", "is", null).limit(10000);
    if (!error) for (const r of (data ?? []) as { id: number; skor_awal: number | string }[]) hasil.set(Number(r.id), Number(r.skor_awal));
  } catch {
    /* kolom belum ada */
  }
  const sisa = ids.filter((i) => !hasil.has(i));
  if (sisa.length > 0) {
    try {
      const { data } = await db.from("sigap_tes_sesi_arsip").select("sesi_id, skor").in("sesi_id", sisa).eq("percobaan", 1).limit(10000);
      for (const r of (data ?? []) as { sesi_id: number; skor: number | string | null }[]) if (r.skor !== null && r.skor !== undefined) hasil.set(Number(r.sesi_id), Number(r.skor));
    } catch {
      /* arsip tak terbaca */
    }
  }
  return hasil;
}
