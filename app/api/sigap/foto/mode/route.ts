// app/api/sigap/foto/mode/route.ts
//
// (19 Okt 2026) Saklar Kamera SIGAP bagi petugas: untuk tiap penugasan aktif, kegiatan memakai 'kamera' atau 'unggah' (metode lama).
// GET (Authorization: Bearer <sesi>) -> { bawaan, kegiatan: [{ kegiatan_id, penugasan_id, nama, peran, mode }] }
// Tabel pengaturan kosong/belum dimigrasi -> semua 'unggah' (perilaku lama).

import { NextRequest, NextResponse } from "next/server";
import { penugasanAkunMemo } from "@/lib/portal/penugasanMemo";
import { HK_AKTIF, hariIniWib } from "@/lib/sigap";
import { SLOT_FOTO_LAPORAN } from "@/lib/sigapFoto";
import { modeBawaan, modeKegiatan } from "@/lib/sigapFotoServer";
import { galat, masukFoto } from "@/lib/sigapFotoRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { db, akunId } = m;
  try {
    const pen = await penugasanAkunMemo(db, akunId);
    const ids = Array.from(new Set(pen.map((p) => p.kegiatan.id)));
    const [bawaan, mode, { data: hk }, { data: dokIni }] = await Promise.all([
      modeBawaan(db),
      modeKegiatan(db, ids),
      // (31 Okt 2026) apakah hari ini hari kerja tiap penugasan: bar bawah kegiatan menanyakan dulu bila Kamera dibuka di luar hari kerja
      db.from("sigap_hari_kerja").select("penugasan_id").eq("akun_id", akunId).eq("tanggal", hariIniWib()).or(HK_AKTIF()),
      // (31 Okt 2026) foto laporan hari ini (nomor 3) tiap penugasan: di luar hari kerja foto baru MENIMPA yang ini (lib/sigapFoto.ts SLOT_FOTO_LAPORAN)
      pen.length
        ? db.from("sigap_dokumentasi").select("penugasan_id, sumber, diunggah_at").in("penugasan_id", pen.map((p) => p.id)).eq("tanggal", hariIniWib()).eq("slot", SLOT_FOTO_LAPORAN)
        : Promise.resolve({ data: [] as { penugasan_id: number; sumber: string; diunggah_at: string }[] }),
    ]);
    const laporanIni = new Map<number, { sumber: string; diunggah_at: string }>();
    for (const d of dokIni ?? []) laporanIni.set(d.penugasan_id as number, { sumber: String(d.sumber), diunggah_at: String(d.diunggah_at) });
    const hariKerjaIni = new Set((hk ?? []).map((h) => h.penugasan_id as number));
    return NextResponse.json({
      bawaan,
      nama_saya: m.akun.nama, // untuk draft cap di layar kamera (cap resmi tetap dicetak server)
      kegiatan: pen.map((p) => ({
        kegiatan_id: p.kegiatan.id,
        penugasan_id: p.id,
        nama: p.kegiatan.nama,
        peran: p.peran,
        jumlah_foto: p.kegiatan.jumlah_foto,
        jenis: p.kegiatan.jenis, // untuk keterangan tiap nomor foto (lib/sigapLabelFoto.ts)
        mode: mode[p.kegiatan.id] ?? "unggah",
        status_periode: p.status_periode,
        hari_kerja_hari_ini: hariKerjaIni.has(p.id),
        laporan_hari_ini: laporanIni.get(p.id) ?? null, // foto nomor 3 tanggal hari ini (dipakai layar kamera di luar hari kerja)
      })),
    });
  } catch (e) {
    // Gagal membaca saklar -> jangan memaksa kamera: klien jatuh ke metode lama.
    return galat(e instanceof Error ? e.message : "Gagal membaca pengaturan.", 500);
  }
}
