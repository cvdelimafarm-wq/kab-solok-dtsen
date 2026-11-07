// lib/portal/masterWilayah.ts  (hanya server)
//
// (7 Nov 2026, tahap C1) Data layar Master > Wilayah dan Peta: tampilan master_v_subsls_status (SQL 20261107h) + status batas dari berkas public/peta/batas
// + usulan pembaruan master dari penggantian sampel (sigap_sampel_ganti.usul_master, SQL 20261107g). Hanya baca. Aman dipakai sebelum SQL dijalankan:
// tampilan belum ada -> siap:false; tabel penggantian belum ada -> usulan kosong.

import type { Db } from "@/lib/sigap";
import { MASTER_KOSONG, bacaBarisMaster, type BarisMaster, type DataMasterWilayah, type UsulanMaster } from "@/lib/masterWilayah";
import { RINGKAS_BATAS_KOSONG } from "@/lib/portal/batasServer";
import { muatIdBatasUntuk } from "@/lib/portal/batasVersi";

const HALAMAN = 1000;
const belumAda = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|could not find the (table|view)|schema cache/i.test(e.message ?? ""));

const tahunWib = (d: Date) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric" }).format(d));

async function bacaTampilan(db: Db): Promise<{ siap: boolean; mentah: unknown[] }> {
  const semua: unknown[] = [];
  for (let dari = 0; dari < 20_000; dari += HALAMAN) {
    const { data, error } = await db.from("master_v_subsls_status").select("*").order("idsubsls").range(dari, dari + HALAMAN - 1);
    if (error) {
      if (belumAda(error)) return { siap: false, mentah: [] };
      throw new Error(error.message);
    }
    const bagian = (data ?? []) as unknown[];
    semua.push(...bagian);
    if (bagian.length < HALAMAN) break;
  }
  return { siap: true, mentah: semua };
}

/** Usulan pembaruan master dari lapangan (penggantian sampel yang ditandai usul_master), terbaru dulu, maks 200. */
async function bacaUsulan(db: Db, baris: readonly BarisMaster[]): Promise<UsulanMaster[]> {
  const ambil = (belumDiputus: boolean) => {
    let q = db
      .from("sigap_sampel_ganti")
      .select("id, kegiatan_id, idsubsls, utama_kk_id, alasan, status, diajukan_nama, diajukan_at")
      .eq("usul_master", true)
      .in("status", ["menunggu", "disetujui"]);
    if (belumDiputus) q = q.is("usul_putusan", null); // kolom keputusan ada sejak SQL 20261107j (tahap C3)
    return q.order("id", { ascending: false }).limit(200);
  };
  let { data, error } = await ambil(true);
  if (error) ({ data, error } = await ambil(false)); // SQL j belum dijalankan: kolom belum ada
  if (error || !data || data.length === 0) return [];
  const r = data as Record<string, unknown>[];
  const kkIds = [...new Set(r.map((x) => Number(x.utama_kk_id)).filter((n) => Number.isInteger(n)))];
  const kegIds = [...new Set(r.map((x) => Number(x.kegiatan_id)).filter((n) => Number.isInteger(n)))];
  const [{ data: kk }, { data: keg }] = await Promise.all([
    db.from("master_kk").select("id, nama_kk").in("id", kkIds),
    db.from("sigap_kegiatan").select("id, nama").in("id", kegIds),
  ]);
  const namaKk = new Map(((kk ?? []) as { id: unknown; nama_kk: unknown }[]).map((x) => [Number(x.id), String(x.nama_kk ?? "")]));
  const namaKeg = new Map(((keg ?? []) as { id: unknown; nama: unknown }[]).map((x) => [Number(x.id), String(x.nama ?? "")]));
  const wil = new Map(baris.map((b) => [b.idsubsls, b]));
  return r.map((x): UsulanMaster => {
    const w = wil.get(String(x.idsubsls));
    return {
      id: Number(x.id),
      kegiatan_id: Number(x.kegiatan_id),
      kegiatan: namaKeg.get(Number(x.kegiatan_id)) ?? `Kegiatan ${x.kegiatan_id}`,
      idsubsls: String(x.idsubsls),
      kecamatan: w?.kecamatan ?? "",
      nagari: w?.nagari ?? "",
      alasan: String(x.alasan ?? ""),
      nama_kk: namaKk.get(Number(x.utama_kk_id)) ?? "",
      status: x.status === "disetujui" ? "disetujui" : "menunggu",
      diajukan_nama: (x.diajukan_nama as string | null) ?? null,
      diajukan_at: String(x.diajukan_at),
    };
  });
}

export async function dataMasterWilayah(db: Db, sekarang = new Date()): Promise<DataMasterWilayah> {
  const tahun = tahunWib(sekarang);
  const [{ siap, mentah }, batas] = await Promise.all([bacaTampilan(db), muatIdBatasUntuk(db)]);
  if (!siap) return { ...MASTER_KOSONG, tahun, sekarang: sekarang.toISOString() };
  const baris = mentah.map((m) => bacaBarisMaster(m, batas?.ids ?? null)).filter((b): b is BarisMaster => b !== null);
  const kegiatan = new Map<number, { id: number; nama: string; sub_sls: number }>();
  for (const b of baris) for (const s of b.daftar_survei) {
    const k = kegiatan.get(s.kegiatan_id) ?? { id: s.kegiatan_id, nama: s.kegiatan, sub_sls: 0 };
    k.sub_sls += 1;
    kegiatan.set(s.kegiatan_id, k);
  }
  return {
    siap: true,
    sekarang: sekarang.toISOString(),
    tahun,
    baris,
    batas: batas?.ringkas ?? RINGKAS_BATAS_KOSONG,
    usulan: await bacaUsulan(db, baris),
    kegiatan_tahun: [...kegiatan.values()].sort((a, b) => a.id - b.id),
  };
}
