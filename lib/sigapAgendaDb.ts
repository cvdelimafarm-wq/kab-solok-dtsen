// lib/sigapAgendaDb.ts
//
// (9 Nov 2026) Akses database Agenda hari H (khusus server). Semua pembacaan TAHAN tabel belum ada: tabel sigap_agenda_sesi belum dibuat (SQL belum jalan)
// atau tes tanpa baris agenda = tes berjadwal biasa (perilaku lama), jadi memasang kode ini lebih dulu dari SQL tidak mengubah apa pun.

import type { Db } from "@/lib/sigap";
import type { TesBaris } from "@/lib/sigapTes";
import { KOLOM_AGENDA, tesDenganAgenda, type BarisAgenda } from "@/lib/sigapAgenda";

export function bacaBarisAgenda(x: unknown): BarisAgenda {
  const r = x as Record<string, unknown>;
  const angka = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: Number(r.id),
    kegiatan_id: Number(r.kegiatan_id),
    kelas: Number(r.kelas),
    tes_id: Number(r.tes_id),
    jendela_menit: Number(r.jendela_menit),
    mulai_at: (r.mulai_at as string | null) ?? null,
    mulai_oleh: angka(r.mulai_oleh),
    selesai_at: (r.selesai_at as string | null) ?? null,
  };
}

/** Baris agenda sebuah tes (semua kelas). Tabel belum ada / galat = daftar kosong. */
export async function muatAgendaTes(db: Db, tesId: number): Promise<BarisAgenda[]> {
  const { data, error } = await db.from("sigap_agenda_sesi").select(KOLOM_AGENDA).eq("tes_id", tesId);
  if (error || !data) return [];
  return (data as unknown[]).map(bacaBarisAgenda);
}

/** Tes seorang peserta dengan agenda kelasnya diterapkan (lihat tesDenganAgenda). */
export async function terapkanAgendaPeserta(db: Db, tes: TesBaris, kelas: number | null): Promise<TesBaris> {
  const baris = await muatAgendaTes(db, tes.id);
  if (baris.length === 0) return tes;
  return tesDenganAgenda(tes, baris.find((b) => kelas !== null && b.kelas === kelas) ?? null, true);
}
