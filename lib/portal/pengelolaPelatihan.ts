// lib/portal/pengelolaPelatihan.ts  (hanya server)
//
// (3 Nov 2026) Dipisah dari induk.ts supaya ringan diuji. Dipakai indukUntukAkun.

import type { Db } from "@/lib/sigap";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import type { PeranPengelola } from "@/lib/sigapTahap";

/**
 * (3 Nov 2026) Peran PENGELOLA akun pada pelatihan: panitia (izin pelatihan.kelola, lihat) atau instruktur kelas (sigap_kuis_instruktur_kelas).
 * Panitia didahulukan. Gagal membaca = kosong (Beranda tetap jalan). Bukan peserta pun tetap melihat kartu pelatihannya di Beranda.
 */
export async function pengelolaPelatihan(db: Db, akunId: number, idKegiatan: number[]): Promise<Map<number, PeranPengelola>> {
  const hasil = new Map<number, PeranPengelola>();
  if (idKegiatan.length === 0) return hasil;
  try {
    const [{ izin }, { data: ins }] = await Promise.all([izinAkun(db, akunId), db.from("sigap_kuis_instruktur_kelas").select("kegiatan_id").eq("akun_id", akunId).in("kegiatan_id", idKegiatan)]);
    const instruktur = new Set(((ins ?? []) as { kegiatan_id: number }[]).map((x) => Number(x.kegiatan_id)));
    for (const id of idKegiatan) {
      if (boleh(izin, "pelatihan.kelola", "lihat", id)) hasil.set(id, "panitia");
      else if (instruktur.has(id)) hasil.set(id, "instruktur");
    }
  } catch {
    /* abaikan */
  }
  return hasil;
}
