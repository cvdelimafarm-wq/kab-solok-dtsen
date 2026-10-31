// lib/portal/rataPenilaian.ts  (hanya server)
//
// (31 Okt 2026) Rata-rata PERSIS (tanpa pembulatan) semua penilaian Mitra per akun dari sigap_penilaian_mitra (SQL 20261031j).
// Dipakai papan seleksi (variabel rekam jejak). null = tabelnya belum ada -> pemanggil memakai bencana_petugas.nilai_kinerja.

import type { Db } from "@/lib/sigap";
import { rataPersis } from "@/lib/penilaianMitra";

const POTONG = 50; // akun per permintaan; tiap akun punya satu baris per kolom kegiatan, jadi dibaca berhalaman

export async function rataPenilaianPerAkun(db: Db, akunIds: number[]): Promise<Map<number, number> | null> {
  const hasil = new Map<number, number>();
  const unik = [...new Set(akunIds)];
  for (let i = 0; i < unik.length; i += POTONG) {
    const potong = unik.slice(i, i + POTONG);
    const nilai = new Map<number, number[]>();
    for (let dari = 0; dari < 20000; dari += 1000) {
      const { data, error } = await db.from("sigap_penilaian_mitra").select("akun_id, nilai").in("akun_id", potong).order("akun_id").order("kolom_id").range(dari, dari + 999);
      if (error) return null;
      for (const r of (data ?? []) as { akun_id: number; nilai: number }[]) nilai.set(r.akun_id, [...(nilai.get(r.akun_id) ?? []), r.nilai]);
      if ((data ?? []).length < 1000) break;
    }
    for (const [id, n] of nilai) {
      const r = rataPersis(n);
      if (r !== null) hasil.set(id, r);
    }
  }
  return hasil;
}
