// lib/portal/laporanFoto.ts  (hanya server)
//
// (30 Okt 2026) Daftar foto dokumentasi (nomor foto 1-5) dan gambar kecil/sedang untuk pemilih foto Lampiran B Laporan Sementara.
// SELALU terikat satu kegiatan: setiap penyaring memakai kegiatan_id, dan gambar diperiksa ulang milik kegiatan itu sebelum diunduh.

import sharp from "sharp";
import { BUCKET_SIGAP, type Db } from "@/lib/sigap";
import { MAKS_FOTO_LAPORAN, MAKS_ID_SARINGAN, SISI_GAMBAR_KECIL, SISI_GAMBAR_WORD, peranBasisData, type FilterFoto, type FotoItem, type HasilDaftarFoto } from "@/lib/laporanFoto";

sharp.cache(false);

type BarisDok = { id: number; penugasan_id: number; tanggal: string; slot: number; foto_id: number | null };
type Penugasan = { id: number; peran: string; nama: string };

/** Penugasan kegiatan ini beserta nama petugas (peran dan nama bisa disaring di sini; jumlahnya ratusan). */
async function muatPenugasan(db: Db, kegiatanId: number): Promise<Map<number, Penugasan>> {
  const peta = new Map<number, Penugasan>();
  for (let dari = 0; ; dari += 1000) {
    const { data, error } = await db.from("sigap_penugasan").select("id, peran, akun_id").eq("kegiatan_id", kegiatanId).order("id").range(dari, dari + 999);
    if (error) throw new Error(error.message);
    const baris = (data ?? []) as { id: number; peran: string; akun_id: number }[];
    const akunIds = Array.from(new Set(baris.map((b) => b.akun_id)));
    const nama = new Map<number, string>();
    for (let i = 0; i < akunIds.length; i += 200) {
      const { data: a, error: e2 } = await db.from("sigap_akun").select("id, nama").in("id", akunIds.slice(i, i + 200));
      if (e2) throw new Error(e2.message);
      for (const r of (a ?? []) as { id: number; nama: string | null }[]) nama.set(r.id, r.nama ?? "");
    }
    for (const b of baris) peta.set(b.id, { id: b.id, peran: b.peran, nama: nama.get(b.akun_id) ?? "" });
    if (baris.length < 1000) break;
  }
  return peta;
}

async function perkaya(db: Db, baris: BarisDok[], pen: Map<number, Penugasan>): Promise<FotoItem[]> {
  const fotoIds = Array.from(new Set(baris.map((b) => b.foto_id).filter((x): x is number => x !== null)));
  const info = new Map<number, { lokasi: string | null; diambil: string | null }>();
  for (let i = 0; i < fotoIds.length; i += 200) {
    const { data, error } = await db.from("sigap_foto").select("id, lokasi_teks, diambil_at").in("id", fotoIds.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { id: number; lokasi_teks: string | null; diambil_at: string | null }[]) info.set(r.id, { lokasi: r.lokasi_teks, diambil: r.diambil_at });
  }
  return baris.map((b) => {
    const p = pen.get(b.penugasan_id);
    const f = b.foto_id !== null ? info.get(b.foto_id) : undefined;
    return { id: b.id, slot: b.slot, peran: p?.peran ?? "", nama: p?.nama ?? "", tanggal: b.tanggal, diambil: f?.diambil ?? null, lokasi: f?.lokasi ?? null, kamera: b.foto_id !== null };
  });
}

/** Penugasan yang lolos saringan peran dan nama; null = tidak ada yang cocok. */
function penugasanLolos(pen: Map<number, Penugasan>, f: FilterFoto): number[] {
  const peran = peranBasisData(f.peran);
  const cari = f.cari.toLowerCase();
  return Array.from(pen.values())
    .filter((p) => (peran.length === 0 || peran.includes(p.peran)) && (!cari || p.nama.toLowerCase().includes(cari)))
    .map((p) => p.id);
}

function kueri(db: Db, kegiatanId: number, f: FilterFoto, penIds: number[], kolom: string, hitung: boolean) {
  let q = db
    .from("sigap_dokumentasi")
    .select(kolom, hitung ? { count: "exact" } : undefined)
    .eq("kegiatan_id", kegiatanId)
    .is("nonaktif_at", null)
    .in("penugasan_id", penIds);
  if (f.slot.length) q = q.in("slot", f.slot);
  if (f.dari) q = q.gte("tanggal", f.dari);
  if (f.sampai) q = q.lte("tanggal", f.sampai);
  return q.order("tanggal", { ascending: false }).order("penugasan_id").order("slot");
}

/** Satu halaman foto menurut saringan (terbaru dulu). */
export async function daftarFoto(db: Db, kegiatanId: number, f: FilterFoto): Promise<HasilDaftarFoto> {
  const pen = await muatPenugasan(db, kegiatanId);
  const penIds = penugasanLolos(pen, f);
  if (penIds.length === 0) return { total: 0, halaman: f.halaman, ukuran: f.ukuran, foto: [] };
  const dari = (f.halaman - 1) * f.ukuran;
  const { data, error, count } = await kueri(db, kegiatanId, f, penIds, "id, penugasan_id, tanggal, slot, foto_id", true).range(dari, dari + f.ukuran - 1);
  if (error) throw new Error(error.message);
  const foto = await perkaya(db, (data ?? []) as unknown as BarisDok[], pen);
  return { total: count ?? foto.length, halaman: f.halaman, ukuran: f.ukuran, foto };
}

/** Semua foto hasil saringan (untuk "pilih semua hasil saringan"), dibatasi MAKS_ID_SARINGAN; `terpotong` = ada yang tidak ikut. */
export async function semuaFotoSaringan(db: Db, kegiatanId: number, f: FilterFoto): Promise<{ total: number; terpotong: boolean; foto: FotoItem[] }> {
  const pen = await muatPenugasan(db, kegiatanId);
  const penIds = penugasanLolos(pen, f);
  if (penIds.length === 0) return { total: 0, terpotong: false, foto: [] };
  const { data, error, count } = await kueri(db, kegiatanId, f, penIds, "id, penugasan_id, tanggal, slot, foto_id", true).range(0, MAKS_ID_SARINGAN - 1);
  if (error) throw new Error(error.message);
  const foto = await perkaya(db, (data ?? []) as unknown as BarisDok[], pen);
  const total = count ?? foto.length;
  return { total, terpotong: total > foto.length, foto };
}

/** Rincian foto menurut id (untuk memulihkan pilihan tersimpan); id yang bukan milik kegiatan ini atau sudah nonaktif dibuang. */
export async function rincianFoto(db: Db, kegiatanId: number, ids: number[]): Promise<FotoItem[]> {
  const unik = Array.from(new Set(ids.filter((n) => Number.isInteger(n) && n > 0))).slice(0, MAKS_FOTO_LAPORAN);
  if (unik.length === 0) return [];
  const { data, error } = await db.from("sigap_dokumentasi").select("id, penugasan_id, tanggal, slot, foto_id").eq("kegiatan_id", kegiatanId).is("nonaktif_at", null).in("id", unik);
  if (error) throw new Error(error.message);
  const pen = await muatPenugasan(db, kegiatanId);
  const baris = (data ?? []) as unknown as BarisDok[];
  const item = await perkaya(db, baris, pen);
  const peta = new Map(item.map((x) => [x.id, x] as const));
  return unik.map((id) => peta.get(id)).filter((x): x is FotoItem => x !== undefined);
}

export type UkuranGambar = "kecil" | "sedang";
export const ukuranGambarSah = (s: string | null): UkuranGambar => (s === "sedang" ? "sedang" : "kecil");

/** JPEG yang sudah diputar menurut EXIF dan diperkecil. null = foto tidak ada / bukan milik kegiatan ini / berkas hilang. */
export async function gambarFoto(db: Db, kegiatanId: number, id: number, ukuran: UkuranGambar): Promise<Buffer | null> {
  const { data: baris, error } = await db.from("sigap_dokumentasi").select("file_path").eq("id", id).eq("kegiatan_id", kegiatanId).is("nonaktif_at", null).maybeSingle();
  if (error || !baris || typeof (baris as { file_path?: unknown }).file_path !== "string") return null;
  const { data: berkas, error: e2 } = await db.storage.from(BUCKET_SIGAP).download((baris as { file_path: string }).file_path);
  if (e2 || !berkas) return null;
  const sisi = ukuran === "sedang" ? SISI_GAMBAR_WORD : SISI_GAMBAR_KECIL;
  return sharp(Buffer.from(await berkas.arrayBuffer()))
    .rotate()
    .resize({ width: sisi, height: sisi, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: ukuran === "sedang" ? 80 : 70, mozjpeg: false })
    .toBuffer();
}
