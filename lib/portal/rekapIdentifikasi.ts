// lib/portal/rekapIdentifikasi.ts  (hanya server)
//
// (11 Okt 2026) Rekap hasil identifikasi untuk semua PML/PPL -- permintaan user. Hanya-baca; hanya wilayah + status (tanpa angka KK).
// Pemanggil harus anggota lapangan (PML/PPL/korwil aktif) atau admin (izin bencana.admin, lihat): diperiksa di sini, fungsi database hanya untuk service_role.

import type { Db } from "@/lib/sigap";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import { periksaBarisRekap, type BarisRekap } from "@/lib/rekapIdentifikasi";

type AkunMin = { id: number; petugas_bencana_id: number | null };

/** Boleh melihat rekap? PML/PPL/korwil aktif, atau admin bencana. */
export async function bolehLihatRekap(db: Db, akun: AkunMin): Promise<boolean> {
  if (akun.petugas_bencana_id) {
    const { data } = await db.from("bencana_petugas").select("aktif, peran, status_kepegawaian").eq("id", akun.petugas_bencana_id).maybeSingle();
    if (data && data.aktif !== false && (data.peran === "pml" || data.peran === "ppl" || data.peran === "korwil" || data.status_kepegawaian === "organik")) return true;
  }
  const { izin } = await izinAkun(db, akun.id);
  return boleh(izin, "bencana.admin", "lihat");
}

export async function rekapIdentifikasi(db: Db): Promise<BarisRekap[]> {
  const { data, error } = await db.rpc("bencana_rekap_identifikasi");
  if (error) throw new Error(`Gagal memuat rekap identifikasi: ${error.message}`);
  return periksaBarisRekap(((data ?? []) as Record<string, unknown>[]).map((r) => ({ ...r, status: r.tidak_terdampak === true ? "tidak_terdampak" : "terdampak" })));
}
