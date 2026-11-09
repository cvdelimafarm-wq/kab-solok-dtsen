// app/api/sigap/pelatihan/administrasi/foto/kamera/route.ts
//
// (9 Nov 2026) Foto lampiran laporan pelatihan diambil dari FOTO KAMERA peserta (sigap_dokumentasi, nomor foto 1-5 per petugas per hari) supaya tidak unggah ulang.
// Berkas DISALIN (bucket sigap-files) ke pelatihan-laporan/<kegiatan>/<kelas>/dok<ID>_<acak>.jpg; asal foto tampak dari nama berkas (tanpa kolom baru),
// sehingga satu foto Kamera tidak terpakai dua kali. Aturan sama dengan unggah manual: 4 foto per hari per kelas (panitia + instruktur satu kumpulan).
// Izin: pelatihan.administrasi (lihat untuk GET, kelola untuk POST), hanya kelas yang boleh diakses akun.
//
// GET  ?kelas=N&tanggal=YYYY-MM-DD                -> { foto: [{ id, nama, slot, url, dipakai }] } (maks. 60, urut nama lalu nomor foto)
// POST { kelas, tanggal, ids: number[] }          -> { ok, ditambah }  (ids = sigap_dokumentasi.id)

import { NextRequest, NextResponse } from "next/server";
import { BUCKET_SIGAP, type Db } from "@/lib/sigap";
import { catatAudit } from "@/lib/sigapAkses";
import { galatJson as galat, kelasBoleh, muatHariKegiatan, siapkanAdministrasi } from "@/lib/sigapAdministrasi";
import { FOTO_PER_HARI, dokumentasiIdDariPath, pathSalinanKamera, sisaPilih, tanggalEfektif } from "@/lib/sigapFotoHari";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAKS_TAMPIL = 60;
const MAKS_PILIH = 8;



/** Foto Kamera peserta kelas itu pada tanggal tersebut. */
async function fotoKamera(db: Db, kegiatanId: number, kelas: number, tanggal: string) {
  const { data: pen } = await db.from("sigap_penugasan").select("id, akun_id").eq("kegiatan_id", kegiatanId).eq("kelas", kelas).eq("aktif", true).limit(2000);
  const penugasan = (pen ?? []) as { id: number; akun_id: number }[];
  if (penugasan.length === 0) return [];
  const ids = penugasan.map((p) => p.id);
  const { data: dok } = await db.from("sigap_dokumentasi").select("id, penugasan_id, slot, file_path").eq("kegiatan_id", kegiatanId).eq("tanggal", tanggal).in("penugasan_id", ids).order("penugasan_id").order("slot").limit(2000);
  const baris = (dok ?? []) as { id: number; penugasan_id: number; slot: number; file_path: string }[];
  if (baris.length === 0) return [];
  const akunId = new Map(penugasan.map((p) => [p.id, p.akun_id]));
  const { data: ak } = await db.from("sigap_akun").select("id, nama").in("id", Array.from(new Set(penugasan.map((p) => p.akun_id))));
  const nama = new Map(((ak ?? []) as { id: number; nama: string }[]).map((a) => [Number(a.id), String(a.nama)]));
  return baris
    .map((b) => ({ ...b, nama: nama.get(akunId.get(b.penugasan_id) ?? -1) ?? `Penugasan ${b.penugasan_id}` }))
    .sort((a, b) => a.nama.localeCompare(b.nama) || a.slot - b.slot);
}

async function sudahDipakai(db: Db, kegiatanId: number, kelas: number): Promise<Set<number>> {
  const { data } = await db.from("sigap_pelatihan_laporan_foto").select("file_path").eq("kegiatan_id", kegiatanId).eq("kelas", kelas).limit(2000);
  const s = new Set<number>();
  for (const r of (data ?? []) as { file_path: string }[]) {
    const id = dokumentasiIdDariPath(r.file_path);
    if (id !== null) s.add(id);
  }
  return s;
}

const tglSah = (t: unknown): t is string => typeof t === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t);

export async function GET(req: NextRequest) {
  try {
    const k = await siapkanAdministrasi(req, false);
    if (k instanceof NextResponse) return k;
    const kelas = kelasBoleh(k, req.nextUrl.searchParams.get("kelas"));
    if (kelas instanceof NextResponse) return kelas;
    const tanggal = req.nextUrl.searchParams.get("tanggal");
    if (!tglSah(tanggal)) return galat("Tanggal tidak valid.");
    const [semua, dipakai] = await Promise.all([fotoKamera(k.db, k.kegiatanId, kelas, tanggal), sudahDipakai(k.db, k.kegiatanId, kelas)]);
    const tampil = semua.slice(0, MAKS_TAMPIL);
    const foto = [];
    for (const f of tampil) {
      const { data: s } = await k.db.storage.from(BUCKET_SIGAP).createSignedUrl(String(f.file_path), 3600);
      foto.push({ id: f.id, nama: f.nama, slot: f.slot, url: s?.signedUrl ?? null, dipakai: dipakai.has(f.id) });
    }
    return NextResponse.json({ foto, total: semua.length });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const k = await siapkanAdministrasi(req, true);
    if (k instanceof NextResponse) return k;
    const kelas = kelasBoleh(k, body?.kelas);
    if (kelas instanceof NextResponse) return kelas;
    const tanggal = body?.tanggal;
    if (!tglSah(tanggal)) return galat("Tanggal tidak valid.");
    const hari = await muatHariKegiatan(k.db, k.kegiatanId);
    if (hari.length && !hari.includes(tanggal)) return galat("Tanggal foto harus salah satu hari pelaksanaan pelatihan.");
    const diminta = Array.from(new Set(((Array.isArray(body?.ids) ? body.ids : []) as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n > 0)));
    if (diminta.length === 0) return galat("Pilih minimal 1 foto.");
    if (diminta.length > MAKS_PILIH) return galat(`Pilih paling banyak ${MAKS_PILIH} foto sekali ambil.`);

    // foto yang diminta harus benar-benar foto Kamera peserta kelas ini pada tanggal itu, dan belum dipakai
    const [kamera, dipakai] = await Promise.all([fotoKamera(k.db, k.kegiatanId, kelas, tanggal), sudahDipakai(k.db, k.kegiatanId, kelas)]);
    const sah = new Map(kamera.map((f) => [f.id, f]));
    const pilih = diminta.filter((id) => sah.has(id) && !dipakai.has(id));
    if (pilih.length === 0) return galat("Foto yang dipilih tidak ditemukan atau sudah dipakai sebagai lampiran.", 409);

    // aturan 4 per hari per kelas
    const a = await k.db.from("sigap_pelatihan_laporan_foto").select("id, urut, tanggal").eq("kegiatan_id", k.kegiatanId).eq("kelas", kelas);
    let ada: { id: number; urut: number | null; tanggal?: string | null }[];
    if (a.error) {
      const b = await k.db.from("sigap_pelatihan_laporan_foto").select("id, urut").eq("kegiatan_id", k.kegiatanId).eq("kelas", kelas);
      ada = ((b.data ?? []) as typeof ada).map((x) => ({ ...x, tanggal: null }));
    } else ada = (a.data ?? []) as typeof ada;
    const hariIni = ada.filter((x) => tanggalEfektif(x.tanggal ?? null, hari) === tanggal).length;
    const sisa = hari.length ? sisaPilih(hariIni, ada.length, hari.length) : Math.max(0, FOTO_PER_HARI - ada.length);
    if (sisa <= 0) return galat(`Foto tanggal ini sudah ${FOTO_PER_HARI} (maks ${FOTO_PER_HARI} per hari per kelas, dipakai bersama panitia dan instruktur).`, 409);
    if (pilih.length > sisa) return galat(`Tinggal ${sisa} foto lagi yang boleh ditambah pada tanggal ini; Anda memilih ${pilih.length}.`, 409);

    let urut = ada.reduce((m, x) => Math.max(m, Number(x.urut ?? 0)), 0);
    let ditambah = 0;
    for (const id of pilih) {
      const f = sah.get(id)!;
      const tujuan = pathSalinanKamera(k.kegiatanId, kelas, id, Math.random().toString(36).slice(2, 8), String(f.file_path));
      const { error: eCopy } = await k.db.storage.from(BUCKET_SIGAP).copy(String(f.file_path), tujuan);
      if (eCopy) {
        if (ditambah === 0) return galat(`Gagal menyalin foto: ${eCopy.message}`, 500);
        break;
      }
      urut += 1;
      const isi = { kegiatan_id: k.kegiatanId, kelas, urut, file_path: tujuan, keterangan: `Foto Kamera: ${f.nama}`.slice(0, 160), dibuat_oleh: `${k.akun.nama} (#${k.akun.id})` };
      let hasil = await k.db.from("sigap_pelatihan_laporan_foto").insert({ ...isi, tanggal }).select("id").single();
      if (hasil.error) hasil = await k.db.from("sigap_pelatihan_laporan_foto").insert(isi).select("id").single(); // kolom tanggal belum dipasang
      if (hasil.error || !hasil.data) {
        await k.db.storage.from(BUCKET_SIGAP).remove([tujuan]).catch(() => null);
        if (ditambah === 0) return galat(hasil.error?.message ?? "Gagal mencatat foto.", 500);
        break;
      }
      ditambah += 1;
    }
    await catatAudit(k.db, k.akun.id, "pelatihan_administrasi_foto_dari_kamera", { kelas, tanggal, ids: pilih, ditambah });
    return NextResponse.json({ ok: true, ditambah });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
