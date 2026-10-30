// lib/portal/rekapIdentifikasi.ts  (hanya server)
//
// (11 Okt 2026) Rekap hasil identifikasi untuk semua PML/PPL -- permintaan user. Hanya-baca; hanya wilayah + status (tanpa angka KK); termasuk Sub SLS yang belum diidentifikasi (pada SLS yang sudah dialokasikan).
// Pemanggil harus anggota lapangan (PML/PPL/korwil aktif) atau admin (izin bencana.admin, lihat): diperiksa di sini, fungsi database hanya untuk service_role.

import type { Db } from "@/lib/sigap";
import { izinAkun, bolehPsp } from "@/lib/sigapAkses";
import { periksaBarisPml, periksaBarisRekap, type BarisPml, type BarisRekap } from "@/lib/rekapIdentifikasi";

type AkunMin = { id: number; petugas_bencana_id: number | null };

/** (13 Okt 2026) Hak akses rekap: lapangan = PML/PPL/korwil/organik aktif; admin = izin bencana.admin (lihat). Admin juga boleh menanggapi sanggahan. */
export async function aksesRekap(db: Db, akun: AkunMin): Promise<{ boleh: boolean; admin: boolean }> {
  const { izin } = await izinAkun(db, akun.id);
  const admin = bolehPsp(izin, "lihat");
  if (admin) return { boleh: true, admin: true };
  if (akun.petugas_bencana_id) {
    const { data } = await db.from("bencana_petugas").select("aktif, peran, status_kepegawaian").eq("id", akun.petugas_bencana_id).maybeSingle();
    if (data && data.aktif !== false && (data.peran === "pml" || data.peran === "ppl" || data.peran === "korwil" || data.status_kepegawaian === "organik")) return { boleh: true, admin: false };
  }
  return { boleh: false, admin: false };
}

/** Boleh melihat rekap? PML/PPL/korwil aktif, atau admin bencana. */
export async function bolehLihatRekap(db: Db, akun: AkunMin): Promise<boolean> {
  return (await aksesRekap(db, akun)).boleh;
}

const larik = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const angkaId = (v: unknown): number[] => larik(v).map(Number).filter((x) => Number.isInteger(x) && x > 0);

/**
 * (13 Okt 2026) Rekap + siapa yang mengidentifikasi + sanggahan. Rincian sanggahan disaring PER PEMANGGIL di server:
 * admin, PML bersangkutan (pelaksana/pendamping SLS-nya) dan petugas yang pernah mengidentifikasi Sub SLS itu melihat semuanya;
 * petugas lain hanya melihat sanggahannya sendiri (plus jumlah). Fungsi v3 gagal -> kembali ke v2 (tanpa petugas/sanggah) agar rekap tetap tampil.
 */
export async function rekapIdentifikasi(db: Db, akunId: number, admin: boolean): Promise<BarisRekap[]> {
  const v3 = await db.rpc("bencana_rekap_identifikasi_v3");
  if (!v3.error) {
    const mentah = (v3.data ?? []) as Record<string, unknown>[];
    return periksaBarisRekap(
      mentah.map((r) => {
        const petugas = larik(r.petugas) as Array<Record<string, unknown>>;
        const sanggah = larik(r.sanggah) as Array<Record<string, unknown>>;
        const pelaku = petugas.some((p) => Number(p.akun_id) === akunId);
        const pml = angkaId(r.pml_akun).includes(akunId);
        const lihatSemua = admin || pml || pelaku;
        const terbuka = sanggah.filter((x) => x.status === "terbuka").length;
        return {
          ...r,
          status: r.sudah !== true ? "belum" : r.tidak_terdampak === true ? "tidak_terdampak" : "terdampak",
          pml_akun: undefined,
          sanggah: lihatSemua ? sanggah : sanggah.filter((x) => Number(x.akun_id) === akunId),
          sanggah_total: sanggah.length,
          sanggah_terbuka: terbuka,
          dapat_tanggapi: (admin || pml) && terbuka > 0,
        };
      })
    );
  }
  console.error("[rekapIdentifikasi v3]", v3.error.message);
  const { data, error } = await db.rpc("bencana_rekap_identifikasi_v2");
  if (error) throw new Error(`Gagal memuat rekap identifikasi: ${error.message}`);
  return periksaBarisRekap(((data ?? []) as Record<string, unknown>[]).map((r) => ({ ...r, status: r.sudah !== true ? "belum" : r.tidak_terdampak === true ? "tidak_terdampak" : "terdampak" })));
}

/** (11 Okt 2026) Target & realisasi identifikasi per PML. Kegagalan di sini tidak boleh menggagalkan rekap utama: dikembalikan kosong. */
export async function rekapPml(db: Db): Promise<BarisPml[]> {
  const { data, error } = await db.rpc("bencana_rekap_pml");
  if (error) {
    console.error("[rekapPml]", error.message);
    return [];
  }
  return periksaBarisPml(data);
}
