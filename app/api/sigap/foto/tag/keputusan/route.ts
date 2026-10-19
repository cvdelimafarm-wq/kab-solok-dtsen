// app/api/sigap/foto/tag/keputusan/route.ts
//
// (19 Okt 2026) Penerima tag memutuskan: terima (memilih penugasan & nomor foto sendiri) atau tolak.
// POST { tag_id, aksi: 'terima'|'tolak', penugasan_id?, slot? }
//
// Aturan:
//  - Penerima dari tim / pemotret: penugasan harus di kegiatan yang SAMA dengan foto.
//  - Penerima di luar tim: boleh penugasan miliknya sendiri; kegiatan itu harus bermode kamera (keputusan user: sah sebagai bukti).
//  - Hari kerja, 23.59 WIB, kunci, periode: cekAksesIsian terhadap TANGGAL FOTO (bukan hari ini).
//  - Foto merah / dipertanyakan / di luar wilayah penerima (nomor 2-4) -> tag 'ditahan' sampai PML/admin menandai 'diperiksa'.
//  - Setelah diterima, nomor tidak diubah penerima (mengubah berarti mencabut baris = hapus). Pilih nomor dengan teliti sebelum Terima.
//  - Nomor sudah terisi foto lain: foto lama DILEPAS (bukan dihapus), berkas lama dicatat ke sigap_audit (di dalam fungsi SQL).

import { NextRequest, NextResponse } from "next/server";
import { cekAksesIsian, penugasanAkun } from "@/lib/sigap";
import { WILAYAH_MERAH_M, slotBerlokasi, slotValid } from "@/lib/sigapFoto";
import { jarakKeWilayah, modeKegiatan } from "@/lib/sigapFotoServer";
import { galat, masukFoto } from "@/lib/sigapFotoRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { db, akunId } = m;
  const b = (await req.json().catch(() => null)) as { tag_id?: unknown; aksi?: unknown; penugasan_id?: unknown; slot?: unknown } | null;
  const tagId = Number(b?.tag_id);
  if (!Number.isInteger(tagId) || (b?.aksi !== "terima" && b?.aksi !== "tolak")) return galat("tag_id dan aksi wajib.");

  const { data: tag } = await db.from("sigap_foto_tag").select("*").eq("id", tagId).maybeSingle();
  if (!tag || tag.akun_id !== akunId) return galat("Tag tidak ditemukan.", 404);
  if (tag.status !== "diajukan") return galat("Tag ini sudah diputuskan.", 409, { status: tag.status });

  if (b.aksi === "tolak") {
    if (tag.peran_tag === "pemotret") return galat("Pemotret tidak menolak fotonya sendiri.");
    await db.from("sigap_foto_tag").update({ status: "ditolak", diubah_at: new Date().toISOString(), diubah_oleh: akunId }).eq("id", tagId);
    return NextResponse.json({ ok: true, status: "ditolak" });
  }

  const penugasanId = Number(b.penugasan_id);
  const slot = Number(b.slot);
  if (!Number.isInteger(penugasanId) || !slotValid(slot)) return galat("penugasan_id dan slot (1-5) wajib untuk menerima.");

  const { data: foto } = await db.from("sigap_foto").select("id, kegiatan_id, tanggal, lat, lng, kepercayaan, status_periksa, file_dihapus_at").eq("id", tag.foto_id).maybeSingle();
  if (!foto) return galat("Foto tidak ditemukan.", 404);
  if (foto.file_dihapus_at) return galat("Berkas foto ini sudah dihapus.", 410);

  const pen = (await penugasanAkun(db, akunId)).find((p) => p.id === penugasanId);
  if (!pen) return galat("Penugasan tidak ditemukan.", 403);
  if (tag.peran_tag !== "luar_tim" && pen.kegiatan.id !== foto.kegiatan_id) return galat("Foto ini untuk kegiatan lain. Pilih penugasan pada kegiatan yang sama dengan foto.", 400);
  if (slot > pen.kegiatan.jumlah_foto) return galat(`Kegiatan ini hanya memakai ${pen.kegiatan.jumlah_foto} nomor foto.`);
  if (tag.peran_tag === "luar_tim") {
    const mode = (await modeKegiatan(db, [pen.kegiatan.id]))[pen.kegiatan.id];
    if (mode !== "kamera") return galat("Kegiatan tujuan memakai unggah foto (metode lama), jadi foto kamera tidak bisa dipakai sebagai bukti di sana.", 403, { mode: "unggah" });
  }

  const akses = await cekAksesIsian(db, akunId, penugasanId, foto.tanggal as string);
  if ("error" in akses) return galat(akses.error, akses.status);

  let tahan = foto.kepercayaan === "merah" && foto.status_periksa !== "diperiksa";
  if (foto.status_periksa === "dipertanyakan") tahan = true;
  if (!tahan && foto.status_periksa !== "diperiksa" && slotBerlokasi(slot) && typeof foto.lat === "number" && typeof foto.lng === "number") {
    const jarak = await jarakKeWilayah(db, akunId, foto.lat, foto.lng);
    if (jarak !== null && jarak > WILAYAH_MERAH_M) tahan = true;
  }

  const { data, error } = await db.rpc("sigap_foto_tempatkan", {
    p_tag_id: tagId, p_akun_id: akunId, p_penugasan_id: penugasanId, p_slot: slot, p_susulan: akses.susulan, p_tahan: tahan,
  });
  if (error) return galat(`Gagal menempatkan foto: ${error.message}`, 500);
  if (data && data.ok === false) return galat(`Tidak dapat diterima (${data.error}).`, 409, { rincian: data });
  return NextResponse.json({ ok: true, status: data?.status ?? (tahan ? "ditahan" : "diterima"), ditahan: tahan });
}
