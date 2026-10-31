// app/api/sigap/foto/laporan-unggah/route.ts
//
// (31 Okt 2026) UNGGAH FOTO LAPORAN di luar hari kerja (pendamping Kamera SIGAP).
// Kegiatan bermode kamera (mis. SPDT NTP) wajib memotret lewat kamera pada hari kerja/Translok; unggah dari galeri hanya diizinkan untuk keperluan
// SELAIN Translok, yaitu hari ini BUKAN hari kerja petugas. Foto menempati nomor 3 (Saat mendata) tanggal hari ini dan MENIMPA foto lamanya,
// baik foto lama itu dari kamera maupun dari unggah (foto lama kamera tetap tersimpan di sigap_foto sebagai cadangan).
// Tanggal bukan hari kerja tidak ikut perhitungan SPJ (semua pembaca SPJ berjalan dari sigap_hari_kerja), jadi aman bagi Kwitansi/Dokumentasi.
//
// POST multipart (Authorization: Bearer <sesi>) { kegiatan_id, berkas } -> { ok, slot, menimpa }

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { BUCKET_SIGAP, cekAksesIsian, hariIniWib } from "@/lib/sigap";
import { penugasanAkunMemo } from "@/lib/portal/penugasanMemo";
import { SLOT_FOTO_LAPORAN, bolehFotoLaporan } from "@/lib/sigapFoto";
import { modeKegiatan } from "@/lib/sigapFotoServer";
import { angka, galat, masukFoto } from "@/lib/sigapFotoRoute";
import { galatServer } from "@/lib/sigapGalat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAKS_BYTE = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { db, akunId } = m;
  try {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return galat("Isian tidak terbaca.");
    }
    const berkas = form.get("berkas");
    if (!(berkas instanceof File)) return galat("Berkas foto wajib.");
    if (berkas.size > MAKS_BYTE) return galat("Berkas terlalu besar (maks 15 MB).", 413);
    if (berkas.size < 5000) return galat("Berkas terlalu kecil.");
    if (berkas.type && !/^image\//.test(berkas.type)) return galat("File harus berupa foto (gambar).");
    const kegiatanId = angka(form.get("kegiatan_id"));
    if (!kegiatanId) return galat("kegiatan_id wajib.");

    const [modePeta, daftarPen] = await Promise.all([modeKegiatan(db, [kegiatanId]), penugasanAkunMemo(db, akunId)]);
    if (modePeta[kegiatanId] !== "kamera") return galat("Kegiatan ini memakai unggah foto biasa di halaman Transport Lokal.", 403, { mode: "unggah" });
    const pen = daftarPen.find((p) => p.kegiatan.id === kegiatanId);
    if (!pen) return galat("Anda tidak terdaftar pada kegiatan ini.", 403);
    if (!bolehFotoLaporan(pen.kegiatan.jumlah_foto)) return galat("Kegiatan ini tidak memakai foto laporan di luar hari kerja.", 403);

    // Hanya HARI INI dan hanya bila hari ini BUKAN hari kerja. Pada hari kerja/Translok, foto wajib dari Kamera SIGAP.
    const tanggal = hariIniWib();
    const akses = await cekAksesIsian(db, akunId, pen.id, tanggal, { izinTanpaHariKerja: true });
    if ("error" in akses) return galat(akses.error, akses.status);
    if (!akses.tanpaHariKerja) return galat("Hari ini hari kerja Anda: foto dokumentasi wajib diambil lewat Kamera SIGAP. Unggah hanya untuk hari di luar hari kerja.", 403, { kode: "hari_kerja" });

    let jpeg: Buffer;
    try {
      jpeg = await sharp(Buffer.from(await berkas.arrayBuffer()))
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch {
      return galat("Foto tidak bisa dibaca. Coba pilih foto lain (format JPG/PNG/HEIC).", 400);
    }

    const path = `translok/${pen.id}/${tanggal}/slot${SLOT_FOTO_LAPORAN}.jpg`;
    const { data: lama } = await db.from("sigap_dokumentasi").select("id, foto_id, file_path, sumber").eq("penugasan_id", pen.id).eq("tanggal", tanggal).eq("slot", SLOT_FOTO_LAPORAN).maybeSingle();
    const { error: eUp } = await db.storage.from(BUCKET_SIGAP).upload(path, jpeg, { contentType: "image/jpeg", upsert: true });
    if (eUp) return galatServer("[api/sigap/foto/laporan-unggah unggah]", eUp, "Gagal menyimpan foto. Coba lagi.");

    const baris = {
      kegiatan_id: kegiatanId, penugasan_id: pen.id, tanggal, slot: SLOT_FOTO_LAPORAN,
      file_path: path, file_nama_asli: berkas.name?.slice(0, 200) || null, ukuran_byte: jpeg.length,
      susulan: false, diunggah_at: new Date().toISOString(), foto_id: null, sumber: "unggah",
    };
    const { error } = lama
      ? await db.from("sigap_dokumentasi").update(baris).eq("id", lama.id)
      : await db.from("sigap_dokumentasi").insert(baris);
    if (error) return galatServer("[api/sigap/foto/laporan-unggah simpan]", error);

    if (lama) {
      // foto kamera yang tadinya menempati nomor ini dilepas (tetap ada di sigap_foto sebagai cadangan); catat untuk jejak audit
      if (lama.foto_id) await db.from("sigap_foto_tag").update({ status: "dilepas", dokumentasi_id: null, diubah_at: new Date().toISOString(), diubah_oleh: akunId }).eq("dokumentasi_id", lama.id);
      await db.from("sigap_audit").insert({
        akun_id: akunId, aksi: "foto.nomor_diganti",
        detail: { penugasan_id: pen.id, tanggal, slot: SLOT_FOTO_LAPORAN, file_lama: lama.file_path, foto_lama: lama.foto_id, sumber_baru: "unggah" },
      });
    }
    return NextResponse.json({ ok: true, slot: SLOT_FOTO_LAPORAN, menimpa: !!lama });
  } catch (e) {
    return galatServer("[api/sigap/foto/laporan-unggah]", e);
  }
}
