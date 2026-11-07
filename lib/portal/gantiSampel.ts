// lib/portal/gantiSampel.ts  (hanya server)
//
// (7 Nov 2026) Tahap B: penggantian sampel utama dengan cadangan atas persetujuan PML. Semua aturan ditegakkan fungsi basis data (migrasi 20261107g); modul ini
// membaca daftar pengajuan, memanggil fungsi itu, dan menerjemahkan penolakannya menjadi pesan. Aman dipakai SEBELUM migrasi dijalankan: pembacaan mengembalikan kosong.

import type { Db } from "@/lib/sigap";
import type { AkunPortal } from "@/lib/portal/server";
import { GalatSampel } from "@/lib/portal/sampel";
import { muatKonfigAlokasi } from "@/lib/portal/alokasiWilayah";
import {
  ALASAN_GANTI, GANTI_KOSONG, MAKS_CATATAN, rekapGanti, ringkasGantiAdmin,
  type AlasanGanti, type DataGantiAdmin, type GantiRow, type SinkronMaster, type StatusGanti,
} from "@/lib/gantiSampel";

const PESAN_BELUM_MIGRASI = "Penggantian sampel belum aktif di basis data (migrasi 20261107g belum dijalankan).";
const belumMigrasi = (e: { code?: string; message?: string } | null | undefined): boolean =>
  !!e && (e.code === "42P01" || e.code === "42883" || e.code === "42703" || e.code === "PGRST205" || e.code === "PGRST202" || /does not exist|schema cache|Could not find/i.test(e.message ?? ""));

type Hasil = { ok?: boolean; pesan?: string; kode?: string } & Record<string, unknown>;

async function panggil(db: Db, fn: string, args: Record<string, unknown>): Promise<Hasil> {
  const { data, error } = await db.rpc(fn, args);
  if (error) {
    if (belumMigrasi(error)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
    throw new Error(error.message);
  }
  const h = (data ?? {}) as Hasil;
  if (!h.ok) throw new GalatSampel(h.pesan ?? "Permintaan ditolak.", 409, h.kode);
  return h;
}

const idPositif = (v: unknown, nama: string): number => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw new GalatSampel(`${nama} tidak sah.`);
  return n;
};

const KODE_ALASAN = new Set<string>(ALASAN_GANTI.map((a) => a.kode));
const STATUS = new Set<string>(["menunggu", "disetujui", "ditolak", "dibatalkan"]);

/** Setelan penggantian kegiatan; kolom yang belum ada (migrasi belum jalan) memakai bawaan. */
export async function bacaSetelanGanti(db: Db, kegiatanId: number): Promise<{ boleh_ganti: boolean; sinkron_ke_master: SinkronMaster }> {
  for (const kolom of ["boleh_ganti, sinkron_ke_master", "boleh_ganti"]) {
    const { data, error } = await db.from("sigap_sampel_konfig").select(kolom).eq("kegiatan_id", kegiatanId).maybeSingle();
    if (error) continue;
    const d = (data ?? {}) as unknown as Record<string, unknown>;
    return { boleh_ganti: typeof d.boleh_ganti === "boolean" ? d.boleh_ganti : true, sinkron_ke_master: d.sinkron_ke_master === "usulan" ? "usulan" : "tidak" };
  }
  return { boleh_ganti: true, sinkron_ke_master: "tidak" };
}

/** Daftar pengajuan (terbaru dulu) lengkap dengan nama KK. `idsubsls` membatasi satu sub SLS. Kosong bila migrasi belum jalan. */
export async function bacaGanti(db: Db, kegiatanId: number, opsi: { idsubsls?: string; batas?: number } = {}): Promise<{ siap: boolean; daftar: GantiRow[] }> {
  let q = db
    .from("sigap_sampel_ganti")
    .select("id, idsubsls, utama_kk_id, cadangan_kk_id, alasan, catatan, status, usul_master, diajukan_oleh, diajukan_nama, diajukan_at, diputus_nama, diputus_at, putus_sebagai, catatan_putus")
    .eq("kegiatan_id", kegiatanId);
  if (opsi.idsubsls) q = q.eq("idsubsls", opsi.idsubsls);
  const { data, error } = await q.order("id", { ascending: false }).limit(Math.min(Math.max(opsi.batas ?? 200, 1), 1000));
  if (error) {
    if (belumMigrasi(error)) return { siap: false, daftar: [] };
    throw new Error(error.message);
  }
  const baris = (data ?? []) as Record<string, unknown>[];
  const ids = Array.from(new Set(baris.flatMap((r) => [Number(r.utama_kk_id), Number(r.cadangan_kk_id)])));
  const nama = new Map<number, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: kk } = await db.from("master_kk").select("id, nama_kk").in("id", ids.slice(i, i + 200));
    for (const k of (kk ?? []) as Record<string, unknown>[]) nama.set(Number(k.id), String(k.nama_kk));
  }
  const daftar = baris.map((r): GantiRow => ({
    id: Number(r.id),
    idsubsls: String(r.idsubsls),
    utama_kk_id: Number(r.utama_kk_id),
    cadangan_kk_id: Number(r.cadangan_kk_id),
    utama_nama: nama.get(Number(r.utama_kk_id)) ?? "(KK)",
    cadangan_nama: nama.get(Number(r.cadangan_kk_id)) ?? "(KK)",
    alasan: (KODE_ALASAN.has(String(r.alasan)) ? r.alasan : "lainnya") as AlasanGanti,
    catatan: (r.catatan as string | null) ?? null,
    status: (STATUS.has(String(r.status)) ? r.status : "menunggu") as StatusGanti,
    usul_master: r.usul_master === true,
    diajukan_oleh: r.diajukan_oleh == null ? null : Number(r.diajukan_oleh),
    diajukan_nama: (r.diajukan_nama as string | null) ?? null,
    diajukan_at: String(r.diajukan_at),
    diputus_nama: (r.diputus_nama as string | null) ?? null,
    diputus_at: (r.diputus_at as string | null) ?? null,
    putus_sebagai: r.putus_sebagai === "pml" || r.putus_sebagai === "admin" ? r.putus_sebagai : null,
    catatan_putus: (r.catatan_putus as string | null) ?? null,
  }));
  return { siap: true, daftar };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Aksi
// ---------------------------------------------------------------------------------------------------------------------------------

export async function ajukanGanti(db: Db, akun: AkunPortal, kegiatanId: number, utamaKk: unknown, cadanganKk: unknown, alasan: unknown, catatan: unknown): Promise<{ id: number }> {
  if (typeof alasan !== "string" || !KODE_ALASAN.has(alasan)) throw new GalatSampel("Pilih alasan penggantian yang tersedia.");
  const c = typeof catatan === "string" ? catatan.trim() : "";
  if (c.length > MAKS_CATATAN) throw new GalatSampel(`Catatan maksimal ${MAKS_CATATAN} huruf.`);
  const h = await panggil(db, "sigap_ganti_ajukan", { p_kegiatan: kegiatanId, p_akun: akun.id, p_utama: idPositif(utamaKk, "KK utama"), p_cadangan: idPositif(cadanganKk, "KK cadangan"), p_alasan: alasan, p_catatan: c || null });
  return { id: Number(h.id) };
}

export async function batalGanti(db: Db, akun: AkunPortal, kegiatanId: number, id: unknown): Promise<void> {
  await panggil(db, "sigap_ganti_batal", { p_kegiatan: kegiatanId, p_akun: akun.id, p_id: idPositif(id, "Pengajuan") });
}

/** Keputusan PML (admin=false) atau admin atas nama (admin=true; izin dicek pemanggil). Mengembalikan status akhir. */
export async function putusGanti(db: Db, akun: AkunPortal, kegiatanId: number, id: unknown, setuju: unknown, catatan: unknown, admin: boolean): Promise<"disetujui" | "ditolak"> {
  if (typeof setuju !== "boolean") throw new GalatSampel("Keputusan harus setuju atau tolak.");
  const c = typeof catatan === "string" ? catatan.trim() : "";
  if (c.length > MAKS_CATATAN) throw new GalatSampel(`Catatan maksimal ${MAKS_CATATAN} huruf.`);
  const h = await panggil(db, "sigap_ganti_putus", { p_kegiatan: kegiatanId, p_akun: akun.id, p_id: idPositif(id, "Pengajuan"), p_setuju: setuju, p_catatan: c || null, p_admin: admin });
  return h.status === "ditolak" ? "ditolak" : "disetujui";
}

/** Ringkasan admin: setelan, rekap, tingkat penggantian per PPL, dan daftar pengajuan terbaru. */
export async function dataGantiAdmin(db: Db, kegiatanId: number, wilayah: ReadonlyArray<{ idsubsls: string; target: number; ppl_nama: string | null; pml_nama: string | null }>): Promise<DataGantiAdmin> {
  const [{ siap, daftar }, setelan] = await Promise.all([bacaGanti(db, kegiatanId, { batas: 500 }), bacaSetelanGanti(db, kegiatanId)]);
  if (!siap) return { ...GANTI_KOSONG, ...setelan };
  const { per_ppl, tingkat } = ringkasGantiAdmin(daftar, wilayah);
  // yang menunggu didahulukan, lalu terbaru; layar membatasi 100 baris
  const urut = [...daftar].sort((a, b) => Number(b.status === "menunggu") - Number(a.status === "menunggu") || b.id - a.id).slice(0, 100);
  return { siap: true, ...setelan, rekap: rekapGanti(daftar), tingkat, per_ppl, daftar: urut };
}

/** Simpan setelan sinkron master (tidak | usulan). Membuat baris setelan bila belum ada dengan nilai setelan lain tetap. */
export async function simpanSinkronMaster(db: Db, kegiatanId: number, nilai: unknown, oleh: string): Promise<SinkronMaster> {
  if (nilai !== "tidak" && nilai !== "usulan") throw new GalatSampel("Pilihan sinkron ke master tidak sah.");
  const { data: keg } = await db.from("sigap_kegiatan").select("id").eq("id", kegiatanId).maybeSingle();
  if (!keg) throw new GalatSampel("Kegiatan tidak ditemukan.", 404);
  const konfig = await muatKonfigAlokasi(db, kegiatanId);
  const { boleh_ganti } = await bacaSetelanGanti(db, kegiatanId);
  const baris = {
    kegiatan_id: kegiatanId, target_per_sls: konfig.target_per_sls, maks_sls_per_ppl: konfig.maks_sls_per_ppl, boleh_ganti,
    dengan_updating: konfig.dengan_updating, cadangan_per_sls: konfig.cadangan_per_sls, sinkron_ke_master: nilai, diubah_oleh: oleh.slice(0, 120), diubah_at: new Date().toISOString(),
  };
  const { error } = await db.from("sigap_sampel_konfig").upsert(baris, { onConflict: "kegiatan_id" });
  if (error) {
    if (belumMigrasi(error)) throw new GalatSampel(PESAN_BELUM_MIGRASI, 503);
    throw new Error(error.message);
  }
  return nilai;
}
