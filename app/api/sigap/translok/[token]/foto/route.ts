// app/api/sigap/translok/[token]/foto/route.ts
//
// (5 Okt 2026) Upload dokumentasi SIGAP Transport Lokal -- 5 foto per HARI KERJA (slot 1-5).
// Aturan (keputusan user): upload WAJIB pada hari yg sama s.d. 23:59 WIB; tanggal terlewat
// TIDAK dapat diupload kembali kecuali admin anggaran memberi izin susulan (lib/sigap cekAksesIsian).
// Foto dirapikan di server (sharp: rotasi EXIF, maks 1600 px, JPEG q80) sebelum disimpan
// di bucket privat sigap-files: translok/<penugasan>/<tanggal>/slot<n>.jpg
//
// POST multipart { penugasan_id, tanggal, slot, file }   -> unggah / ganti foto slot
// DELETE ?penugasan_id=&tanggal=&slot=                    -> hapus foto slot (hanya selama masih boleh)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { BUCKET_SIGAP, akunDariToken, cekAksesIsian } from "@/lib/sigap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAKS_BYTE = 15 * 1024 * 1024;

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}
type Db = NonNullable<ReturnType<typeof supabaseAdmin>>;

async function cekAkses(db: Db, token: string, penugasanId: number, tanggal: unknown, slot: number) {
  const akun = await akunDariToken(db, token);
  if (!akun) return { error: "Sesi tidak valid. Silakan masuk kembali.", status: 404 } as const;
  if (!Number.isInteger(slot) || slot < 1 || slot > 10) return { error: "Slot foto tidak valid.", status: 400 } as const;
  const akses = await cekAksesIsian(db, akun.id, penugasanId, tanggal);
  // (7 Okt 2026) jumlah foto per kegiatan (Admin > Kegiatan, peran & tarif)
  if (!("error" in akses) && slot > akses.penugasan.kegiatan.jumlah_foto) return { error: "Slot foto tidak valid.", status: 400 } as const;
  return akses;
}

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  try {
    const form = await req.formData();
    const penugasanId = Number(form.get("penugasan_id"));
    const slot = Number(form.get("slot"));
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "File foto tidak ditemukan." }, { status: 400 });
    if (file.size > MAKS_BYTE) return NextResponse.json({ error: "Ukuran foto maksimal 15 MB." }, { status: 400 });
    if (!/^image\//.test(file.type || "image/jpeg")) return NextResponse.json({ error: "File harus berupa foto (gambar)." }, { status: 400 });

    const akses = await cekAkses(db, token, penugasanId, form.get("tanggal"), slot);
    if ("error" in akses) return NextResponse.json({ error: akses.error }, { status: akses.status });

    let jpeg: Buffer;
    try {
      jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch {
      return NextResponse.json({ error: "Foto tidak bisa dibaca. Coba ambil ulang foto (format JPG/PNG/HEIC)." }, { status: 400 });
    }
    const path = `translok/${penugasanId}/${akses.tanggal}/slot${slot}.jpg`;
    const { error: eUp } = await db.storage.from(BUCKET_SIGAP).upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
    if (eUp) return NextResponse.json({ error: `Gagal menyimpan foto: ${eUp.message}` }, { status: 500 });
    const { error } = await db.from("sigap_dokumentasi").upsert(
      {
        penugasan_id: penugasanId,
        kegiatan_id: akses.penugasan.kegiatan.id,
        tanggal: akses.tanggal,
        slot,
        file_path: path,
        file_nama_asli: file.name?.slice(0, 200) || null,
        ukuran_byte: jpeg.length,
        susulan: akses.susulan,
        diunggah_at: new Date().toISOString(),
      },
      { onConflict: "penugasan_id,tanggal,slot" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const { data: signed } = await db.storage.from(BUCKET_SIGAP).createSignedUrl(path, 3600);
    return NextResponse.json({ ok: true, slot, url: signed?.signedUrl ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  try {
    const sp = req.nextUrl.searchParams;
    const penugasanId = Number(sp.get("penugasan_id"));
    const slot = Number(sp.get("slot"));
    const akses = await cekAkses(db, token, penugasanId, sp.get("tanggal"), slot);
    if ("error" in akses) return NextResponse.json({ error: akses.error }, { status: akses.status });
    const { data: row } = await db
      .from("sigap_dokumentasi")
      .select("id, file_path")
      .eq("penugasan_id", penugasanId)
      .eq("tanggal", akses.tanggal)
      .eq("slot", slot)
      .maybeSingle();
    if (!row) return NextResponse.json({ ok: true });
    await db.storage.from(BUCKET_SIGAP).remove([row.file_path as string]);
    const { error } = await db.from("sigap_dokumentasi").delete().eq("id", row.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
