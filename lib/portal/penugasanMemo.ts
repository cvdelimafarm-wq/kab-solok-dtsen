// lib/portal/penugasanMemo.ts  (hanya server)
//
// (29 Okt 2026) Penugasan akun disimpan 30 detik di memori server. Satu pembukaan halaman/unggah foto memanggil penugasanAkun() yang
// menembakkan 4 permintaan kecil ke database; saat jam padat (puluhan petugas + unggah foto bersamaan) jumlah permintaan itulah yang
// membuat CPU database penuh, bukan beratnya query. Hanya untuk jalur BACA/penapis ringan. Jalur simpan/otorisasi tetap memakai
// penugasanAkun() langsung (selalu segar). Simpanan dibuang otomatis setiap admin mengubah data (lihat app/api/sigap/admin/route.ts).

import { penugasanAkun, type Db, type Penugasan } from "@/lib/sigap";
import { memoWaktu } from "@/lib/portal/memoSingkat";

export const TTL_PENUGASAN_MS = 30_000;
export const AWALAN_MEMO_PENUGASAN = "pen-akun:";

/** Salinan baru tiap pemanggilan, supaya pemanggil yang mengubah hasilnya tidak merusak simpanan. */
export async function penugasanAkunMemo(db: Db, akunId: number): Promise<Penugasan[]> {
  const hasil = await memoWaktu(`${AWALAN_MEMO_PENUGASAN}${akunId}`, TTL_PENUGASAN_MS, () => penugasanAkun(db, akunId));
  return structuredClone(hasil);
}
