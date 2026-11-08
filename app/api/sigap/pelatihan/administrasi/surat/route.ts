// app/api/sigap/pelatihan/administrasi/surat/route.ts
//
// (9 Nov 2026) Surat undangan pelatihan per kelas, jalur UNGGAH (PDF yang terbit di luar SIGAP). Izin sama dengan foto lampiran:
// pelatihan.administrasi (lihat untuk GET; kelola untuk POST), hanya kelas yang boleh diakses akun (panitia dan instruktur kelasnya).
// Satu surat aktif per kelas; mengunggah lagi = surat lama menjadi RIWAYAT (tidak dihapus) dengan alasan. Dipakai sebagai Lampiran undangan
// Laporan Pelatihan dan Laporan Pelatihan Instruktur, dan butir Kesiapan "Undangan bernomor".
//
// GET  ?kelas=N                      -> { tersedia, aktif, riwayat, url_aktif }
// POST multipart { kelas, nomor, tanggal, perihal, alasan?, file }  -> surat baru menjadi aktif
// GET  ?kelas=N&id=ID                -> { url } tautan sementara berkas riwayat

import { NextRequest, NextResponse } from "next/server";
import { BUCKET_SIGAP } from "@/lib/sigap";
import { catatAudit } from "@/lib/sigapAkses";
import { galatJson as galat, kelasBoleh, siapkanAdministrasi } from "@/lib/sigapAdministrasi";
import { alasanBersih, periksaBerkas, periksaIsian } from "@/lib/sigapSuratUndangan";
import { muatSurat, tautanSurat } from "@/lib/sigapSuratUndanganDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const k = await siapkanAdministrasi(req, false);
    if (k instanceof NextResponse) return k;
    const kelas = kelasBoleh(k, req.nextUrl.searchParams.get("kelas"));
    if (kelas instanceof NextResponse) return kelas;
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (Number.isInteger(id) && id > 0) {
      const url = await tautanSurat(k.db, k.kegiatanId, kelas, id);
      return url ? NextResponse.json({ url }) : galat("Surat tidak ditemukan.", 404);
    }
    const hasil = await muatSurat(k.db, k.kegiatanId, kelas);
    const url_aktif = hasil.aktif ? await tautanSurat(k.db, k.kegiatanId, kelas, hasil.aktif.id) : null;
    return NextResponse.json({ ...hasil, url_aktif, boleh_kelola: k.bisaKelola });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const k = await siapkanAdministrasi(req, true);
    if (k instanceof NextResponse) return k;
    const form = await req.formData();
    const kelas = kelasBoleh(k, form.get("kelas"));
    if (kelas instanceof NextResponse) return kelas;
    const cek = periksaIsian({ nomor: form.get("nomor"), tanggal: form.get("tanggal"), perihal: form.get("perihal") });
    if (!cek.ok) return galat(cek.galat);
    const file = form.get("file");
    if (!(file instanceof File)) return galat("Berkas PDF tidak ditemukan.");
    const isi = new Uint8Array(await file.arrayBuffer());
    const masalah = periksaBerkas(isi.length, isi.subarray(0, 8));
    if (masalah) return galat(masalah);

    const lama = await muatSurat(k.db, k.kegiatanId, kelas);
    if (!lama.tersedia) return galat("Tabel surat undangan belum dipasang. Jalankan SQL 20261109c_pelatihan_surat_undangan.sql dulu.", 409);
    const alasan = alasanBersih(form.get("alasan"));
    if (lama.aktif && !alasan) return galat("Kelas ini sudah punya surat undangan aktif. Isi alasan penggantian.");

    const path = `pelatihan-undangan/${k.kegiatanId}/${kelas}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.pdf`;
    const { error: eUp } = await k.db.storage.from(BUCKET_SIGAP).upload(path, isi, { contentType: "application/pdf", upsert: false });
    if (eUp) return galat(`Gagal menyimpan berkas: ${eUp.message}`, 500);

    // surat lama dinonaktifkan dulu (indeks unik: satu aktif per kelas), lalu yang baru dimasukkan; gagal -> kembalikan
    if (lama.aktif) {
      const { error: eNon } = await k.db.from("sigap_pelatihan_surat_undangan").update({ aktif: false, alasan_ganti: alasan, diganti_at: new Date().toISOString() }).eq("id", lama.aktif.id);
      if (eNon) {
        await k.db.storage.from(BUCKET_SIGAP).remove([path]).catch(() => null);
        return galat(eNon.message, 500);
      }
    }
    const { data: baru, error } = await k.db
      .from("sigap_pelatihan_surat_undangan")
      .insert({ kegiatan_id: k.kegiatanId, kelas, jalur: "unggah", nomor: cek.isian.nomor, tanggal: cek.isian.tanggal, perihal: cek.isian.perihal, file_path: path, aktif: true, dibuat_oleh: `${k.akun.nama} (#${k.akun.id})` })
      .select("id")
      .single();
    if (error || !baru) {
      await k.db.storage.from(BUCKET_SIGAP).remove([path]).catch(() => null);
      if (lama.aktif) await k.db.from("sigap_pelatihan_surat_undangan").update({ aktif: true, alasan_ganti: null, diganti_at: null }).eq("id", lama.aktif.id);
      return galat(error?.message ?? "Gagal mencatat surat.", 500);
    }
    await catatAudit(k.db, k.akun.id, "pelatihan_surat_undangan_unggah", { kelas, surat_id: baru.id, nomor: cek.isian.nomor, mengganti: lama.aktif?.id ?? null });
    return NextResponse.json({ ok: true, id: baru.id });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
