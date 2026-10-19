// app/api/sigap/foto/mode/route.ts
//
// (19 Okt 2026) Saklar Kamera SIGAP bagi petugas: untuk tiap penugasan aktif, kegiatan memakai 'kamera' atau 'unggah' (metode lama).
// GET (Authorization: Bearer <sesi>) -> { bawaan, kegiatan: [{ kegiatan_id, penugasan_id, nama, peran, mode }] }
// Tabel pengaturan kosong/belum dimigrasi -> semua 'unggah' (perilaku lama).

import { NextRequest, NextResponse } from "next/server";
import { penugasanAkun } from "@/lib/sigap";
import { modeBawaan, modeKegiatan } from "@/lib/sigapFotoServer";
import { galat, masukFoto } from "@/lib/sigapFotoRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { db, akunId } = m;
  try {
    const pen = await penugasanAkun(db, akunId);
    const ids = Array.from(new Set(pen.map((p) => p.kegiatan.id)));
    const [bawaan, mode] = await Promise.all([modeBawaan(db), modeKegiatan(db, ids)]);
    return NextResponse.json({
      bawaan,
      kegiatan: pen.map((p) => ({
        kegiatan_id: p.kegiatan.id,
        penugasan_id: p.id,
        nama: p.kegiatan.nama,
        peran: p.peran,
        jumlah_foto: p.kegiatan.jumlah_foto,
        mode: mode[p.kegiatan.id] ?? "unggah",
        status_periode: p.status_periode,
      })),
    });
  } catch (e) {
    // Gagal membaca saklar -> jangan memaksa kamera: klien jatuh ke metode lama.
    return galat(e instanceof Error ? e.message : "Gagal membaca pengaturan.", 500);
  }
}
