// app/api/sigap/pelatihan/langkah/route.ts
//
// (7 Okt 2026) SIGAP > Pelatihan > Langkah Pelatihan -- mencatat bahwa peserta sudah membuka halaman Undangan.
// POST json {kode:"undangan"} (Authorization: Bearer <sesi>) -> { ok: true }. Hanya utk peserta pelatihan.
// (Langkah "instrumen" dicatat di sisi server saat berkas diunduh -- lihat ../instrumen/route.ts.)

import { NextRequest, NextResponse } from "next/server";
import { akunDariRequest, catatLangkah, dbAdmin, idKegiatanPelatihan, pesertaPelatihan } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const body = await req.json().catch(() => null);
    if (body?.kode !== "undangan") return galat("Langkah tidak dikenal.");
    const kegiatanId = await idKegiatanPelatihan(db);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    if (!(await pesertaPelatihan(db, akun.id, kegiatanId))) return NextResponse.json({ ok: true, dicatat: false });
    await catatLangkah(db, akun.id, kegiatanId, "undangan");
    return NextResponse.json({ ok: true, dicatat: true });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
