// lib/portal/seleksiKandidat.ts  (hanya server)
//
// (31 Okt 2026) Bacaan data bersama untuk seleksi: calon (Mitra aktif anggota pool + nagari domisili), wilayah sampel, dan tahun pool. Dipakai
// app/api/sigap/seleksi (PJ/admin) dan app/api/sigap/seleksi-saya (Mitra). Aturan kelayakan: lib/seleksiSyarat.ts.

import type { Db } from "@/lib/sigap";
import type { KandidatLokasi, WilayahSeleksi } from "@/lib/seleksiSyarat";

export type CalonMitra = KandidatLokasi & { pool: boolean };

export const tahunWib = (): number => Number(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 4));

export async function bacaWilayah(db: Db, seleksiId: number): Promise<WilayahSeleksi[]> {
  const { data } = await db.from("sigap_seleksi_wilayah").select("kode, nama, kecamatan, nagari, lat, lng, jumlah_sampel, kebutuhan_ppl, kebutuhan_pml").eq("seleksi_id", seleksiId).order("kode");
  return (data ?? []) as WilayahSeleksi[];
}

/** Tahun pool = tahun mulai kegiatan; kegiatan tanpa tanggal mulai = tahun berjalan (WIB). */
export async function tahunPoolKegiatan(db: Db, kegiatanId: number): Promise<number> {
  const { data } = await db.from("sigap_kegiatan").select("tanggal_mulai").eq("id", kegiatanId).maybeSingle();
  return Number(String(data?.tanggal_mulai ?? "").slice(0, 4)) || tahunWib();
}

type BarisAkun = { id: number; nama: string; alamat_kecamatan: string | null; domisili_lat: number | null; domisili_lng: number | null; mitra_id: number | null };
const KOLOM_AKUN = "id, nama, alamat_kecamatan, domisili_lat, domisili_lng, mitra_id";

async function peta<T>(ambil: (dari: number, sampai: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<{ baris: T[]; galat: boolean }> {
  const baris: T[] = [];
  for (let dari = 0; dari < 5000; dari += 1000) {
    const { data, error } = await ambil(dari, dari + 999);
    if (error) return { baris, galat: true };
    baris.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return { baris, galat: false };
}

async function petaDesa(db: Db): Promise<Map<number, string>> {
  const { baris } = await peta<{ id: number; alamat_desa: string | null }>((a, b) => db.from("bencana_mitra").select("id, alamat_desa").order("id").range(a, b));
  const m = new Map<number, string>();
  for (const x of baris) if (x.alamat_desa) m.set(x.id, x.alamat_desa);
  return m;
}

/** Mitra aktif + penanda pool tahun itu. Tabel pool belum dibuat -> semua Mitra aktif jadi calon dan poolSiap=false. */
export async function bacaKandidat(db: Db, tahun: number): Promise<{ calon: CalonMitra[]; poolSiap: boolean }> {
  const { baris: akun } = await peta<BarisAkun>((a, b) => db.from("sigap_akun").select(KOLOM_AKUN).eq("jenis", "mitra").eq("aktif", true).order("id").range(a, b));
  const { baris: pool, galat } = await peta<{ akun_id: number }>((a, b) => db.from("sigap_mitra_pool").select("akun_id").eq("tahun", tahun).eq("status", "aktif").order("akun_id").range(a, b));
  const poolSiap = !galat;
  const ada = new Set(pool.map((p) => p.akun_id));
  const desa = await petaDesa(db);
  const calon = akun
    .filter((a) => !poolSiap || ada.has(a.id))
    .map((a) => ({ id: a.id, nama: a.nama, kecamatan: a.alamat_kecamatan, nagari: a.mitra_id ? desa.get(a.mitra_id) ?? null : null, lat: a.domisili_lat, lng: a.domisili_lng, pool: poolSiap }));
  return { calon, poolSiap };
}

/** Satu Mitra (untuk halaman pendaftaran): null bila bukan Mitra aktif, atau (pool siap) bukan anggota pool aktif tahun itu. */
export async function bacaCalonSatu(db: Db, akunId: number, tahun: number): Promise<{ calon: CalonMitra | null; poolSiap: boolean; alasan: string | null }> {
  const { data: a } = await db.from("sigap_akun").select(`${KOLOM_AKUN}, jenis, aktif`).eq("id", akunId).maybeSingle();
  if (!a || a.jenis !== "mitra" || !a.aktif) return { calon: null, poolSiap: true, alasan: "Seleksi ini untuk Mitra Kepka." };
  const { data: p, error } = await db.from("sigap_mitra_pool").select("status").eq("akun_id", akunId).eq("tahun", tahun).maybeSingle();
  const poolSiap = !error;
  if (poolSiap && p?.status !== "aktif") return { calon: null, poolSiap, alasan: `Anda belum tercatat sebagai Mitra Kepka aktif tahun ${tahun}.` };
  let nagari: string | null = null;
  if (a.mitra_id) {
    const { data: m } = await db.from("bencana_mitra").select("alamat_desa").eq("id", a.mitra_id).maybeSingle();
    nagari = (m?.alamat_desa as string | null) ?? null;
  }
  return { calon: { id: a.id as number, nama: a.nama as string, kecamatan: a.alamat_kecamatan as string | null, nagari, lat: a.domisili_lat as number | null, lng: a.domisili_lng as number | null, pool: poolSiap }, poolSiap, alasan: null };
}
