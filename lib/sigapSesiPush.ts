// lib/sigapSesiPush.ts  (hanya server)
//
// (9 Nov 2026) Notifikasi push ke peserta saat sebuah sesi dibuka (pretest/posttest/roleplay/kuis). Dipanggil TANPA ditunggu dan semua galat ditelan:
// membuka sesi tidak boleh gagal atau tertunda gara-gara push. Penerima = peserta aktif (bukan administrasi) kelas itu, tanpa panitia, instruktur, dan akun instruktur kelas.

import type { Db } from "@/lib/sigap";
import { kirimKeAkun, pushSiap } from "@/lib/sigapPush";
import { FILTER_BUKAN_ADMINISTRASI } from "@/lib/sigapTesDb";
import { kelasEfektif, muatKelasKegiatan } from "@/lib/sigapKelasKegiatan";
import { muatInstruktur } from "@/lib/sigapInstrukturDb";

/** kelas === null = semua kelas (ruang "Semua Kelas"). */
export async function kabariPesertaKelas(db: Db, kegiatanId: number, kelas: number | null, pesan: { judul: string; isi: string; url: string; tag: string }): Promise<void> {
  try {
    if (!pushSiap()) return;
    const { data } = await db.from("sigap_penugasan").select("akun_id, peran, kelas").eq("kegiatan_id", kegiatanId).eq("aktif", true).or(FILTER_BUKAN_ADMINISTRASI).limit(2000);
    const baris = (data ?? []) as { akun_id: number; peran: string; kelas: number | null }[];
    if (!baris.length) return;
    const [daftarKelas, instruktur] = await Promise.all([muatKelasKegiatan(db, kegiatanId), muatInstruktur(db, kegiatanId)]);
    const instrukturIds = new Set(instruktur.map((i) => i.akun_id));
    const ids = baris
      .filter((b) => b.peran !== "panitia" && b.peran !== "instruktur" && !instrukturIds.has(Number(b.akun_id)))
      .filter((b) => kelas === null || kelasEfektif(b.kelas, daftarKelas) === kelas)
      .map((b) => Number(b.akun_id));
    if (!ids.length) return;
    await kirimKeAkun(db, ids, pesan);
  } catch {
    /* push opsional */
  }
}
