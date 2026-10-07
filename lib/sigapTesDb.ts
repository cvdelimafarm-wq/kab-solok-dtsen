// lib/sigapTesDb.ts
//
// (7 Okt 2026) SIGAP > Pelatihan -- akses database utk pretest/posttest (khusus server).
// Waktu SELALU dari jam server (bukan jam perangkat peserta). Finalisasi sesi yang kedaluwarsa
// dilakukan "lazy": saat sesi dibaca/disimpan/dipantau dan batas_at sudah lewat.

import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { Db } from "@/lib/sigap";
import { sesiDariHeader } from "@/lib/sigapAkses";
import {
  KODE_KEGIATAN_PELATIHAN,
  bersihkanJawaban,
  hasilBolehTampil,
  hitungSkor,
  statusTes,
  type JenisTes,
  type SesiBaris,
  type SoalLengkap,
  type SoalPeserta,
  type StatusTes,
  type TesBaris,
} from "@/lib/sigapTes";

export function dbAdmin(): Db | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

/** Akun aktif dari header Authorization: Bearer <sesi>, atau null. */
export async function akunDariRequest(req: NextRequest, db: Db): Promise<{ id: number; nama: string; jenis: string } | null> {
  const akunId = sesiDariHeader(req.headers);
  if (!akunId) return null;
  const { data: a } = await db.from("sigap_akun").select("id, nama, aktif, jenis").eq("id", akunId).maybeSingle();
  if (!a || !a.aktif) return null;
  return { id: a.id as number, nama: a.nama as string, jenis: a.jenis as string };
}

export async function idKegiatanPelatihan(db: Db): Promise<number | null> {
  const { data } = await db.from("sigap_kegiatan").select("id").eq("kode", KODE_KEGIATAN_PELATIHAN).maybeSingle();
  return (data?.id as number | undefined) ?? null;
}

const KOLOM_TES = "id, kegiatan_id, jenis, judul, buka_at, durasi_menit, tutup_at, aktif";

export async function muatTesDaftar(db: Db, kegiatanId: number): Promise<TesBaris[]> {
  const { data } = await db.from("sigap_tes").select(KOLOM_TES).eq("kegiatan_id", kegiatanId).order("jenis", { ascending: false }); // pretest dulu
  return (data ?? []) as TesBaris[];
}

export async function muatTes(db: Db, kegiatanId: number, jenis: JenisTes): Promise<TesBaris | null> {
  const { data } = await db.from("sigap_tes").select(KOLOM_TES).eq("kegiatan_id", kegiatanId).eq("jenis", jenis).maybeSingle();
  return (data as TesBaris | null) ?? null;
}

export async function muatSoal(db: Db, tesId: number): Promise<SoalLengkap[]> {
  const { data } = await db.from("sigap_tes_soal").select("nomor, teks, opsi, kunci, bobot").eq("tes_id", tesId).order("nomor");
  return ((data ?? []) as Record<string, unknown>[]).map((x) => ({
    nomor: x.nomor as number,
    teks: x.teks as string,
    opsi: (x.opsi as SoalLengkap["opsi"]) ?? [],
    kunci: x.kunci as string,
    bobot: Number(x.bobot),
  }));
}

export async function jumlahSoal(db: Db, tesIds: number[]): Promise<Map<number, number>> {
  const peta = new Map<number, number>();
  if (tesIds.length === 0) return peta;
  const { data } = await db.from("sigap_tes_soal").select("tes_id").in("tes_id", tesIds).limit(5000);
  for (const r of data ?? []) peta.set(r.tes_id as number, (peta.get(r.tes_id as number) ?? 0) + 1);
  return peta;
}

const KOLOM_SESI = "id, tes_id, akun_id, mulai_at, batas_at, selesai_at, jawaban, skor, benar, total, diubah_at";

export async function muatSesi(db: Db, tesId: number, akunId: number): Promise<SesiBaris | null> {
  const { data } = await db.from("sigap_tes_sesi").select(KOLOM_SESI).eq("tes_id", tesId).eq("akun_id", akunId).maybeSingle();
  return (data as SesiBaris | null) ?? null;
}

export const KOLOM_SESI_PUBLIK = KOLOM_SESI;

/**
 * Nilai & tutup sesi. Idempoten: hanya baris yang selesai_at-nya masih null yang diubah.
 * `selesaiAt`: saat peserta menekan Kirim = sekarang; saat kedaluwarsa = batas_at.
 */
export async function finalisasiSesi(db: Db, sesi: SesiBaris, soal: SoalLengkap[], selesaiAt: Date): Promise<SesiBaris> {
  if (sesi.selesai_at) return sesi;
  const jawaban = bersihkanJawaban(sesi.jawaban, soal);
  const h = hitungSkor(soal, jawaban);
  const { data } = await db
    .from("sigap_tes_sesi")
    .update({ selesai_at: selesaiAt.toISOString(), jawaban, skor: h.skor, benar: h.benar, total: h.total, diubah_at: new Date().toISOString() })
    .eq("id", sesi.id)
    .is("selesai_at", null)
    .select(KOLOM_SESI)
    .maybeSingle();
  if (data) return data as SesiBaris;
  // sudah difinalisasi permintaan lain -> baca ulang
  const { data: ulang } = await db.from("sigap_tes_sesi").select(KOLOM_SESI).eq("id", sesi.id).maybeSingle();
  return (ulang as SesiBaris) ?? sesi;
}

/** Finalisasi bila batas_at sudah lewat. */
export async function finalisasiBilaKedaluwarsa(db: Db, sesi: SesiBaris, soal: SoalLengkap[], sekarang: Date): Promise<SesiBaris> {
  if (!sesi.selesai_at && sekarang.getTime() >= new Date(sesi.batas_at).getTime()) {
    return finalisasiSesi(db, sesi, soal, new Date(sesi.batas_at));
  }
  return sesi;
}

export type KeadaanTes = {
  tes: { jenis: JenisTes; judul: string; buka_at: string; tutup_at: string; durasi_menit: number };
  sekarang: string;
  status: StatusTes;
  jumlah_soal: number;
  sesi: { mulai_at: string; batas_at: string; selesai_at: string | null; terjawab: number } | null;
  /** Hanya saat status "mengerjakan". */
  soal?: SoalPeserta[];
  jawaban?: Record<string, string>;
  /** Sudah kirim/selesai tetapi tes belum ditutup: hasil disembunyikan. */
  hasil_tertunda: boolean;
  /** Hanya setelah tutup_at & peserta punya sesi. */
  hasil?: {
    skor: number;
    benar: number;
    total: number;
    butir: { nomor: number; teks: string; opsi: SoalLengkap["opsi"]; jawab: string | null; kunci: string; benar: boolean }[];
  };
};

/** Susun keadaan tes bagi seorang peserta (dipakai GET & balasan POST). Menjalankan finalisasi lazy. */
export async function susunKeadaan(db: Db, tes: TesBaris, akunId: number, sekarang: Date): Promise<KeadaanTes> {
  const soal = await muatSoal(db, tes.id);
  let sesi = await muatSesi(db, tes.id, akunId);
  if (sesi) sesi = await finalisasiBilaKedaluwarsa(db, sesi, soal, sekarang);
  const status = statusTes(tes, soal.length, sesi, sekarang);
  const k: KeadaanTes = {
    tes: { jenis: tes.jenis, judul: tes.judul, buka_at: tes.buka_at, tutup_at: tes.tutup_at, durasi_menit: tes.durasi_menit },
    sekarang: sekarang.toISOString(),
    status,
    jumlah_soal: soal.length,
    sesi: sesi ? { mulai_at: sesi.mulai_at, batas_at: sesi.batas_at, selesai_at: sesi.selesai_at, terjawab: Object.keys(bersihkanJawaban(sesi.jawaban, soal)).length } : null,
    hasil_tertunda: false,
  };
  if (status === "mengerjakan" && sesi) {
    k.soal = soal.map((s) => ({ nomor: s.nomor, teks: s.teks, opsi: s.opsi }));
    k.jawaban = bersihkanJawaban(sesi.jawaban, soal);
  }
  if (status === "selesai" && sesi) {
    if (hasilBolehTampil(tes, sekarang)) {
      const h = hitungSkor(soal, bersihkanJawaban(sesi.jawaban, soal));
      k.hasil = {
        skor: sesi.skor !== null ? Number(sesi.skor) : h.skor,
        benar: sesi.benar ?? h.benar,
        total: sesi.total ?? h.total,
        butir: soal.map((s, i) => ({ nomor: s.nomor, teks: s.teks, opsi: s.opsi, jawab: h.rincian[i].jawab, kunci: s.kunci, benar: h.rincian[i].benar })),
      };
    } else {
      k.hasil_tertunda = true;
    }
  }
  return k;
}

/** Peserta pelatihan = akun dengan penugasan aktif pada kegiatan pelatihan. */
export async function pesertaPelatihan(db: Db, akunId: number, kegiatanId: number): Promise<{ penugasan_id: number; peran: string; kelas: number | null } | null> {
  const { data } = await db.from("sigap_penugasan").select("id, peran, kelas").eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).eq("aktif", true).maybeSingle();
  if (!data) return null;
  return { penugasan_id: data.id as number, peran: data.peran as string, kelas: (data.kelas as number | null) ?? null };
}
