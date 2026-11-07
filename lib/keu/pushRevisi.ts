// lib/keu/pushRevisi.ts  (hanya server)
//
// (7 Nov 2026, tahap 4c) Push siklus revisi: notifikasi "Siklus revisi dibuka" dan "Saatnya menanggapi" (jenis revisi_buka / revisi_ingat di keu_notifikasi,
// dibuat oleh keu_tanggapan_sinkron tiap 5 menit) dikirim ke perangkat ketua tim dan wakil. Dijalankan di dalam cron pengingat yang sudah ada
// (app/api/sigap/pengingat-push, ?slot=auto, tiap 5 menit), sehingga tidak perlu cron baru. Antrean dan penandaan ada di basis data
// (keu_revisi_push_antri / keu_revisi_push_tandai, berkas 20261107l): satu notifikasi dikirim sekali; tanpa perangkat = ditandai selesai (notifikasi
// dalam aplikasi tetap ada); perangkat ada tetapi gagal = dicoba lagi pada putaran berikut.

import type { Db } from "@/lib/sigap";
import { kirimKeAkun, pushSiap } from "@/lib/sigapPush";
import { jamSenyap } from "@/lib/sigapPushJadwal";
import { urlInternalAman, type PesanPush } from "@/lib/sigapPushUtil";

export type BarisAntri = { notif_id: number; akun_id: number; judul: string; isi: string; tautan: string | null };
export type HasilPushRevisi = { siap: boolean; senyap?: boolean; antrean: number; terkirim: number; tanpa_perangkat: number; gagal: number; uji: boolean; galat?: string };
type Pengirim = (db: Db, akun: number[], pesan: PesanPush & { tag?: string }) => Promise<{ perangkat: number; terkirim: number; gagal: number }>;

export const TAUTAN_BAWAAN = "/sigap/revisi/tanggapan";
const MAKS_PER_PUTARAN = 200;

/** Mengirim push revisi yang tertunda. `uji` hanya menghitung. Galat basis data dikembalikan di hasil, tidak dilempar. */
export async function kirimPushRevisi(db: Db, sekarangMs: number, uji = false, kirim: Pengirim = kirimKeAkun): Promise<HasilPushRevisi> {
  const hasil: HasilPushRevisi = { siap: pushSiap() || uji, antrean: 0, terkirim: 0, tanpa_perangkat: 0, gagal: 0, uji };
  if (!hasil.siap) return hasil;
  if (jamSenyap(sekarangMs)) return { ...hasil, senyap: true };
  const { data, error } = await db.rpc("keu_revisi_push_antri", { p_batas: MAKS_PER_PUTARAN });
  if (error) return { ...hasil, galat: error.message };
  const antri = (Array.isArray(data) ? data : []) as BarisAntri[];
  hasil.antrean = antri.length;
  if (uji || antri.length === 0) return hasil;

  const selesai: number[] = [];
  for (const b of antri) {
    try {
      const url = (b.tautan ? urlInternalAman(b.tautan) : null) ?? TAUTAN_BAWAAN;
      const h = await kirim(db, [b.akun_id], { judul: b.judul, isi: b.isi, url, tag: `revisi-${b.notif_id}` });
      if (h.terkirim > 0) { hasil.terkirim++; selesai.push(b.notif_id); }
      else if (h.perangkat === 0) { hasil.tanpa_perangkat++; selesai.push(b.notif_id); }
      else hasil.gagal++;
    } catch {
      hasil.gagal++;
    }
  }
  if (selesai.length) {
    const { error: e2 } = await db.rpc("keu_revisi_push_tandai", { p_ids: selesai });
    if (e2) hasil.galat = e2.message;
  }
  return hasil;
}
