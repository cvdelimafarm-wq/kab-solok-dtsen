// lib/portal/fitur.ts  (hanya server)
//
// (30 Okt 2026) Profil fitur kegiatan: baca dan simpan strategi (sigap_kegiatan.strategi) dan centang (sigap_kegiatan_fitur). Migrasi 20261030e.
// Aman dipakai SEBELUM migrasi dijalankan: kolom/tabel yang belum ada dibaca sebagai bawaan (strategi menurut kegiatan, tanpa centang), jadi layar Kelola
// Pendataan berperilaku seperti sebelumnya; menyimpan sebelum migrasi memberi pesan yang jelas.

import type { Db } from "@/lib/sigap";
import {
  KODE_FITUR, bacaProfilFitur, centangBeda, fiturEfektif, fiturSah, strategiBawaanKegiatan, strategiSah,
  type CentangFitur, type PetaFitur, type StrategiKegiatan,
} from "@/lib/sigapFitur";

export type ProfilFitur = {
  kegiatan: { id: number; nama: string; jenis: string | null };
  strategi: StrategiKegiatan;
  /** Centang tersimpan (hanya yang berbeda dari paket bawaan strategi). */
  centang: CentangFitur;
  /** Keadaan akhir tiap fitur. */
  efektif: PetaFitur;
  /** true = migrasi 20261030e sudah dijalankan (strategi dan centang bisa disimpan). */
  siap: boolean;
};

export class GalatFitur extends Error {
  constructor(pesan: string, readonly status = 400) {
    super(pesan);
  }
}

export async function muatProfilFitur(db: Db, kegiatanId: number): Promise<ProfilFitur> {
  let siap = true;
  let r = await db.from("sigap_kegiatan").select("id, nama, jenis, strategi").eq("id", kegiatanId).maybeSingle();
  if (r.error) {
    siap = false;
    r = await db.from("sigap_kegiatan").select("id, nama, jenis").eq("id", kegiatanId).maybeSingle();
  }
  if (r.error) throw new GalatFitur(r.error.message, 500);
  const k = r.data as { id: number; nama: string; jenis: string | null; strategi?: string } | null;
  if (!k) throw new GalatFitur("Kegiatan tidak ditemukan.", 404);
  const strategi: StrategiKegiatan = siap && strategiSah(k.strategi) ? k.strategi : strategiBawaanKegiatan(kegiatanId);
  let mentah: Record<string, boolean> = {};
  if (siap) {
    const f = await db.from("sigap_kegiatan_fitur").select("fitur, aktif").eq("kegiatan_id", kegiatanId);
    if (f.error) siap = false;
    else for (const x of (f.data ?? []) as { fitur: string; aktif: boolean }[]) mentah[x.fitur] = x.aktif === true;
  }
  const { centang } = bacaProfilFitur({ strategi, centang: mentah }, kegiatanId);
  return { kegiatan: { id: Number(k.id), nama: String(k.nama), jenis: k.jenis ?? null }, strategi, centang, efektif: fiturEfektif(strategi, centang, kegiatanId), siap };
}

/**
 * Simpan profil: `fitur` = keadaan yang diinginkan tiap fitur (kode tak dikenal dibuang). Yang disimpan hanya selisih terhadap paket bawaan `strategi`,
 * jadi perubahan paket bawaan ikut berlaku untuk fitur yang tidak pernah diubah. Fitur yang tidak tersedia untuk kegiatan ini diabaikan.
 */
export async function simpanProfilFitur(db: Db, kegiatanId: number, strategi: StrategiKegiatan, fitur: Record<string, unknown>, oleh: string): Promise<ProfilFitur> {
  const saatIni = await muatProfilFitur(db, kegiatanId);
  if (!saatIni.siap) throw new GalatFitur("Profil fitur belum aktif di basis data: jalankan migrasi 20261030e_kegiatan_fitur.sql lebih dulu.", 409);
  const diinginkan: CentangFitur = {};
  for (const [k, v] of Object.entries(fitur)) if (fiturSah(k) && typeof v === "boolean") diinginkan[k] = v;
  const beda = centangBeda(strategi, fiturEfektif(strategi, diinginkan, kegiatanId), kegiatanId);
  const u = await db.from("sigap_kegiatan").update({ strategi }).eq("id", kegiatanId);
  if (u.error) throw new GalatFitur(u.error.message, 500);
  const d = await db.from("sigap_kegiatan_fitur").delete().eq("kegiatan_id", kegiatanId);
  if (d.error) throw new GalatFitur(d.error.message, 500);
  const baris = KODE_FITUR.filter((k) => typeof beda[k] === "boolean").map((k) => ({ kegiatan_id: kegiatanId, fitur: k, aktif: beda[k] as boolean, diubah_oleh: oleh }));
  if (baris.length > 0) {
    const i = await db.from("sigap_kegiatan_fitur").insert(baris);
    if (i.error) throw new GalatFitur(i.error.message, 500);
  }
  return muatProfilFitur(db, kegiatanId);
}
