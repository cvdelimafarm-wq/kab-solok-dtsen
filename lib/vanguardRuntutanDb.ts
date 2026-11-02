// lib/vanguardRuntutanDb.ts  (khusus server)
//
// (2 Nov 2026) Aturan Vanguard 3 hari berturut-turut: baca/simpan aturan (kolom vanguard_* pada sigap_pelatihan_aturan, SQL 20261102zp), baca sesi Vanguard selesai
// (sigap_vanguard_ujian), dan hitung runtutan banyak akun sekaligus. Aturan murni: lib/runtutanVanguard.ts.
// TAHAN SQL BELUM DIJALANKAN: kolom belum ada / gagal baca = mode tidak_ada (tidak ada kunci, tidak ada kartu); menyimpan memberi pesan yang menunjuk ke berkas SQL.

import type { Db } from "@/lib/sigap";
import { versiBawaan } from "@/lib/sigapAturanTes";
import { keadaanVanguard } from "@/lib/vanguardAkses";
import {
  ATURAN_VANGUARD_BAWAAN, JENIS_SESI_VANGUARD, hariWib, hitungRuntutanVanguard, periksaKelayakan, rapikanAturanVanguard,
  type AturanVanguard, type HasilRuntutan, type KelayakanRuntutan, type SesiVanguard,
} from "@/lib/runtutanVanguard";

export const PESAN_SQL_VANGUARD = "Kolom aturan Vanguard belum ada di database. Jalankan SQL 20261102zp_vanguard_aturan_pelatihan.sql, lalu simpan ulang.";
const KOLOM = "vanguard_mode, vanguard_hari_berturut, vanguard_sesi_min_per_hari, vanguard_nilai_minimal";
const HARI_MS = 86_400_000;
const galatKolom = (m: string | undefined) => /column|relation|does not exist|schema cache/i.test(m ?? "");

export async function muatAturanVanguard(db: Db, kegiatanId: number): Promise<AturanVanguard> {
  try {
    const { data, error } = await db.from("sigap_pelatihan_aturan").select(KOLOM).eq("kegiatan_id", kegiatanId).maybeSingle();
    if (error) return { ...ATURAN_VANGUARD_BAWAAN };
    return rapikanAturanVanguard((data as Record<string, unknown> | null) ?? null);
  } catch {
    return { ...ATURAN_VANGUARD_BAWAAN };
  }
}

export async function simpanAturanVanguard(db: Db, kegiatanId: number, a: AturanVanguard, oleh: string): Promise<{ ok: true } | { ok: false; pesan: string }> {
  const isi = { vanguard_mode: a.mode, vanguard_hari_berturut: a.hari_berturut, vanguard_sesi_min_per_hari: a.sesi_min_per_hari, vanguard_nilai_minimal: a.nilai_minimal, diubah_oleh: oleh.slice(0, 120), diubah_at: new Date().toISOString() };
  try {
    const { data: ada, error: e0 } = await db.from("sigap_pelatihan_aturan").select("kegiatan_id").eq("kegiatan_id", kegiatanId).maybeSingle();
    if (e0) return { ok: false, pesan: galatKolom(e0.message) ? PESAN_SQL_VANGUARD : e0.message };
    if (ada) {
      const { error } = await db.from("sigap_pelatihan_aturan").update(isi).eq("kegiatan_id", kegiatanId);
      if (error) return { ok: false, pesan: galatKolom(error.message) ? PESAN_SQL_VANGUARD : error.message };
      return { ok: true };
    }
    // belum ada baris aturan: buat dengan versi nilai bawaan kegiatan (PSP = 1, lainnya = 2) supaya aturan nilai tidak berubah diam-diam
    let kode: string | null = null;
    try {
      const { data } = await db.from("sigap_kegiatan").select("kode").eq("id", kegiatanId).maybeSingle();
      kode = (data?.kode as string | undefined) ?? null;
    } catch {
      /* kode tak terbaca: versi 2 */
    }
    const { error } = await db.from("sigap_pelatihan_aturan").insert({ kegiatan_id: kegiatanId, aturan_versi: versiBawaan(kode), blokir_tahap: false, izin_ajukan: false, ...isi });
    if (error) return { ok: false, pesan: galatKolom(error.message) ? PESAN_SQL_VANGUARD : error.message };
    return { ok: true };
  } catch {
    return { ok: false, pesan: PESAN_SQL_VANGUARD };
  }
}

/** Sesi Vanguard selesai (60 hari terakhir) per akun. Gagal baca = kosong. */
export async function muatSesiVanguard(db: Db, akunIds: readonly number[], sekarang: number): Promise<Map<number, SesiVanguard[]>> {
  const peta = new Map<number, SesiVanguard[]>();
  if (akunIds.length === 0) return peta;
  try {
    const { data, error } = await db
      .from("sigap_vanguard_ujian")
      .select("akun_id, jenis, selesai_at, skor")
      .in("akun_id", [...akunIds])
      .in("jenis", [...JENIS_SESI_VANGUARD])
      .not("selesai_at", "is", null)
      .gte("selesai_at", new Date(sekarang - 60 * HARI_MS).toISOString())
      .limit(20000);
    if (error) return peta;
    for (const r of (data ?? []) as { akun_id: number; selesai_at: string | null; skor: number | string | null }[]) {
      const daftar = peta.get(Number(r.akun_id)) ?? [];
      daftar.push({ selesai_at: r.selesai_at, skor: r.skor });
      peta.set(Number(r.akun_id), daftar);
    }
  } catch {
    /* dianggap belum ada sesi */
  }
  return peta;
}

/** Tanggal (WIB) Pretest aktif paling awal dibuka; null bila tidak ada. */
export function tanggalBukaPretest(tes: readonly { jenis: string; aktif?: boolean; buka_at?: string | null }[]): string | null {
  const hari = tes.filter((t) => t.jenis === "pretest" && t.aktif !== false).map((t) => hariWib(t.buka_at)).filter((x): x is string => !!x).sort();
  return hari[0] ?? null;
}

export type RuntutanAkun = HasilRuntutan & { kelayakan: KelayakanRuntutan };
export type RuntutanBatch = {
  aturan: AturanVanguard;
  /** Vanguard menyala di kegiatan ini (centang / Identifikasi survei). */
  menyala: boolean;
  /** Aturan berlaku: mode bukan tidak_ada DAN Vanguard menyala. */
  berlaku: boolean;
  /** Mengunci Pretest: mode wajib DAN berlaku. */
  mengunci: boolean;
  tanggal_pretest: string | null;
  hari_ini: string;
  peta: Map<number, RuntutanAkun>;
};

export async function muatRuntutanBatch(db: Db, kegiatanId: number, akunIds: readonly number[], sekarang: number, tanggalPretest: string | null, aturanDiketahui?: AturanVanguard): Promise<RuntutanBatch> {
  const aturan = aturanDiketahui ?? (await muatAturanVanguard(db, kegiatanId));
  const hariIni = hariWib(sekarang) as string;
  const kosong: RuntutanBatch = { aturan, menyala: false, berlaku: false, mengunci: false, tanggal_pretest: tanggalPretest, hari_ini: hariIni, peta: new Map() };
  if (aturan.mode === "tidak_ada") return kosong;
  let menyala = false;
  try {
    menyala = (await keadaanVanguard(db, kegiatanId)).menyala;
  } catch {
    menyala = false;
  }
  if (!menyala) return kosong;
  const sesi = await muatSesiVanguard(db, akunIds, sekarang);
  const peta = new Map<number, RuntutanAkun>();
  for (const id of akunIds) {
    const r = hitungRuntutanVanguard(sesi.get(id) ?? [], hariIni, aturan);
    peta.set(id, { ...r, kelayakan: periksaKelayakan(r, hariIni, tanggalPretest) });
  }
  return { aturan, menyala: true, berlaku: true, mengunci: aturan.mode === "wajib", tanggal_pretest: tanggalPretest, hari_ini: hariIni, peta };
}

export type RuntutanPeserta = RuntutanAkun & { mode: AturanVanguard["mode"]; tanggal_pretest: string | null; hari_ini: string };

/** Runtutan satu akun untuk kartu di Hari ini (Vanguard sudah dipastikan menyala oleh pemanggil, tetapi tetap diperiksa). null = tidak diatur / tidak menyala. */
export async function ringkasRuntutanAkun(db: Db, kegiatanId: number, akunId: number, sekarang: number): Promise<RuntutanPeserta | null> {
  try {
    const aturan = await muatAturanVanguard(db, kegiatanId);
    if (aturan.mode === "tidak_ada") return null;
    const { data } = await db.from("sigap_tes").select("jenis, aktif, buka_at").eq("kegiatan_id", kegiatanId).eq("jenis", "pretest");
    const b = await muatRuntutanBatch(db, kegiatanId, [akunId], sekarang, tanggalBukaPretest((data ?? []) as { jenis: string; aktif?: boolean; buka_at?: string | null }[]), aturan);
    const r = b.peta.get(akunId);
    if (!b.berlaku || !r) return null;
    return { ...r, mode: aturan.mode, tanggal_pretest: b.tanggal_pretest, hari_ini: b.hari_ini };
  } catch {
    return null;
  }
}
