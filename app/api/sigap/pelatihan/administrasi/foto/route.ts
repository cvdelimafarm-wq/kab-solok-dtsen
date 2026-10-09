// app/api/sigap/pelatihan/administrasi/foto/route.ts
//
// (8 Okt 2026) Lampiran foto kegiatan untuk Laporan Pelatihan & Laporan Pelatihan Instruktur (tab Administrasi).
// Izin: pelatihan.administrasi level kelola, hanya untuk kelas yang boleh diakses akun. Maks. 4 foto per kelas (9 Okt 2026, sebelumnya 8).
// Foto dirapikan di server (sharp: rotasi EXIF, maks 1600 px, JPEG q80) lalu disimpan di bucket privat sigap-files:
// pelatihan-laporan/<kegiatan>/<kelas>/<berkas>.jpg ; satu set foto dipakai kedua laporan kelas itu.
//
// POST multipart { kelas, keterangan?, file }  -> tambah foto
// DELETE ?id=N                                  -> hapus foto (berkas & baris)
// PATCH { id, keterangan }                      -> ubah keterangan

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { BUCKET_SIGAP } from "@/lib/sigap";
import { catatAudit } from "@/lib/sigapAkses";
import { MAKS_FOTO_LAPORAN, galatJson as galat, kelasBoleh, siapkanAdministrasi } from "@/lib/sigapAdministrasi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAKS_BYTE = 15 * 1024 * 1024;
const bersih = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 160) : null);

export async function POST(req: NextRequest) {
  try {
    const k = await siapkanAdministrasi(req, true);
    if (k instanceof NextResponse) return k;
    const form = await req.formData();
    const kelas = kelasBoleh(k, form.get("kelas"));
    if (kelas instanceof NextResponse) return kelas;
    const file = form.get("file");
    if (!(file instanceof File)) return galat("File foto tidak ditemukan.");
    if (file.size > MAKS_BYTE) return galat("Ukuran foto maksimal 15 MB.");
    if (!/^image\//.test(file.type || "image/jpeg")) return galat("File harus berupa foto (gambar).");

    const { data: ada } = await k.db.from("sigap_pelatihan_laporan_foto").select("id, urut").eq("kegiatan_id", k.kegiatanId).eq("kelas", kelas);
    if ((ada ?? []).length >= MAKS_FOTO_LAPORAN) return galat(`Maksimal ${MAKS_FOTO_LAPORAN} foto per kelas. Hapus salah satu dulu.`, 409);

    let jpeg: Buffer;
    try {
      jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch {
      return galat("Foto tidak bisa dibaca. Gunakan format JPG/PNG/HEIC.");
    }
    const path = `pelatihan-laporan/${k.kegiatanId}/${kelas}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error: eUp } = await k.db.storage.from(BUCKET_SIGAP).upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
    if (eUp) return galat(`Gagal menyimpan foto: ${eUp.message}`, 500);
    const urut = (ada ?? []).reduce((m, x) => Math.max(m, Number(x.urut ?? 0)), 0) + 1;
    const { data: baru, error } = await k.db
      .from("sigap_pelatihan_laporan_foto")
      .insert({ kegiatan_id: k.kegiatanId, kelas, urut, file_path: path, keterangan: bersih(form.get("keterangan")), dibuat_oleh: `${k.akun.nama} (#${k.akun.id})` })
      .select("id")
      .single();
    if (error || !baru) {
      await k.db.storage.from(BUCKET_SIGAP).remove([path]).catch(() => null);
      return galat(error?.message ?? "Gagal mencatat foto.", 500);
    }
    await catatAudit(k.db, k.akun.id, "pelatihan_administrasi_tambah_foto", { kelas, foto_id: baru.id });
    return NextResponse.json({ ok: true, id: baru.id });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const k = await siapkanAdministrasi(req, true);
    if (k instanceof NextResponse) return k;
    const id = Number(req.nextUrl.searchParams.get("id"));
    const { data: f } = await k.db.from("sigap_pelatihan_laporan_foto").select("id, kelas, file_path").eq("id", id).eq("kegiatan_id", k.kegiatanId).maybeSingle();
    if (!f) return galat("Foto tidak ditemukan.", 404);
    const kelas = kelasBoleh(k, f.kelas);
    if (kelas instanceof NextResponse) return kelas;
    await k.db.storage.from(BUCKET_SIGAP).remove([String(f.file_path)]);
    const { error } = await k.db.from("sigap_pelatihan_laporan_foto").delete().eq("id", id);
    if (error) return galat(error.message, 500);
    await catatAudit(k.db, k.akun.id, "pelatihan_administrasi_hapus_foto", { kelas, foto_id: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const k = await siapkanAdministrasi(req, true);
    if (k instanceof NextResponse) return k;
    const id = Number(body?.id);
    const { data: f } = await k.db.from("sigap_pelatihan_laporan_foto").select("id, kelas").eq("id", id).eq("kegiatan_id", k.kegiatanId).maybeSingle();
    if (!f) return galat("Foto tidak ditemukan.", 404);
    const kelas = kelasBoleh(k, f.kelas);
    if (kelas instanceof NextResponse) return kelas;
    const { error } = await k.db.from("sigap_pelatihan_laporan_foto").update({ keterangan: bersih(body?.keterangan) }).eq("id", id);
    if (error) return galat(error.message, 500);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
