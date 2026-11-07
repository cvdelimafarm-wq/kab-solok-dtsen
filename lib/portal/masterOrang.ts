// lib/portal/masterOrang.ts  (hanya server)
//
// (7 Nov 2026, tahap C4) Membaca akun, pool mitra, dan profil pegawai (kolom non-pribadi saja) untuk panel kesehatan master. Hanya baca; tidak ada penulisan.
// Kolom yang TIDAK diambil: NIK, NIP, nomor HP, email, token, PIN, rekening. Aman bila tabel pool/profil belum ada (dianggap kosong).

import type { Db } from "@/lib/sigap";
import { susunKesehatanOrang, type AkunMaster, type DataMasterOrang, type PoolMaster, type ProfilMaster } from "@/lib/masterOrang";

const HALAMAN = 1000;
const belumAda = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703" || /does not exist|could not find the (table|view)|schema cache/i.test(e.message ?? ""));

async function bacaSemua(db: Db, tabel: string, kolom: string, urutKolom: string): Promise<Record<string, unknown>[] | null> {
  const semua: Record<string, unknown>[] = [];
  for (let dari = 0; dari < 20_000; dari += HALAMAN) {
    const { data, error } = await db.from(tabel).select(kolom).order(urutKolom, { ascending: true }).range(dari, dari + HALAMAN - 1);
    if (error) {
      if (belumAda(error)) return null;
      throw new Error(error.message);
    }
    const bagian = (data ?? []) as unknown as Record<string, unknown>[];
    semua.push(...bagian);
    if (bagian.length < HALAMAN) break;
  }
  return semua;
}

/** Tahun kalender WIB untuk `sekarang`. */
export const tahunWib = (sekarang: Date) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric" }).format(sekarang));

export async function dataMasterOrang(db: Db, sekarang = new Date()): Promise<DataMasterOrang> {
  const tahun = tahunWib(sekarang);
  const akunMentah = await bacaSemua(db, "sigap_akun", "id, nama, jenis, aktif, magang, alamat_kecamatan, terakhir_masuk_at", "id");
  if (!akunMentah) return { ...susunKesehatanOrang([], [], [], tahun), siap: false };
  const [poolMentah, profilMentah] = await Promise.all([
    bacaSemua(db, "sigap_mitra_pool", "akun_id, tahun, status", "akun_id"),
    bacaSemua(db, "sigap_pegawai_profil", "id, akun_id, nama_lengkap", "id"),
  ]);
  const akun = akunMentah.map((r): AkunMaster => ({
    id: Number(r.id), nama: String(r.nama ?? ""), jenis: String(r.jenis ?? ""), aktif: r.aktif === true, magang: r.magang === true,
    alamat_kecamatan: typeof r.alamat_kecamatan === "string" ? r.alamat_kecamatan : null, sudah_masuk: !!r.terakhir_masuk_at,
  }));
  const pool = (poolMentah ?? []).map((r): PoolMaster => ({ akun_id: Number(r.akun_id), tahun: Number(r.tahun), status: String(r.status ?? "") }));
  const profil = (profilMentah ?? []).map((r): ProfilMaster => ({ id: Number(r.id), akun_id: r.akun_id === null || r.akun_id === undefined ? null : Number(r.akun_id), nama_lengkap: String(r.nama_lengkap ?? "") }));
  return susunKesehatanOrang(akun, pool, profil, tahun);
}
