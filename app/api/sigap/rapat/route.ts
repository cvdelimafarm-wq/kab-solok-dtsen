// app/api/sigap/rapat/route.ts
//
// (9 Okt 2026) SIGAP -- presensi rapat Zoom untuk petugas (modal di aplikasi). Permintaan user: tekan "Hadir" + wajib mengetik token rapat.
// GET  (Authorization: Bearer <sesi>) -> { rapat: {id, judul, mulai_at, selesai_at, buka_at, tutup_at, tautan, meeting_id, passcode, status, hadir_at} | null, sekarang }
//      Hanya rapat aktif yang menyasar akun ini. TOKEN TIDAK PERNAH dikirim.
// POST {rapat_id, token} -> { ok:true, hadir_at } atau galat dgn { error, kode }
//      Diperiksa di server: sasaran, jendela waktu, token (tak peka huruf besar/kecil), batas 5 salah / 10 menit. Satu hadir per petugas per rapat.
// (1 Nov 2026) Logika dipindah ke lib/portal/rapatPeserta.ts (dibagi dengan /api/sigap/pelatihan/rapat); perilaku di sini tidak berubah: semua kegiatan, modal Beranda.
//      Tambahan: hadir pada rapat kegiatan PELATIHAN otomatis dicatat sebagai presensi sesi (jawaban memuat presensi_sesi).

import { NextRequest, NextResponse } from "next/server";
import { ambilRapatPeserta, hadirRapatPeserta } from "@/lib/portal/rapatPeserta";
import { akunDariRequest, dbAdmin } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const j = await ambilRapatPeserta(db, akun.id, null);
    return NextResponse.json(j.json, { status: j.status });
  } catch (e) {
    // gagal baca (mis. tabel belum ada) tidak boleh mengganggu beranda: tanpa modal
    return NextResponse.json({ rapat: null, sekarang: new Date().toISOString(), catatan: e instanceof Error ? e.message : "galat" });
  }
}

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const j = await hadirRapatPeserta(db, akun.id, body, null);
    return NextResponse.json(j.json, { status: j.status });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
