// app/api/sigap/vanguard/konteks/route.ts
//
// (2 Nov 2026) GET -> { konteks: KonteksPelatihan | null } untuk akun yang sedang masuk. Dipakai layar Vanguard dan Sertifikasi untuk menampilkan Panduan pelatihan,
// label WAJIB/OPSIONAL, dan menyembunyikan kartu yang tidak ikut dihitung. null = bukan peserta pelatihan (tampilan lama). Hanya membaca; tidak bergantung pada ?k=.
// Gagal membaca = { konteks: null } (layar tetap dapat dipakai seperti biasa).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { sesiDariHeader } from "@/lib/sigapAkses";
import { muatKonteksPelatihan } from "@/lib/vanguardKonteksDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ konteks: null });
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key) as unknown as Db;
    return NextResponse.json({ konteks: await muatKonteksPelatihan(db, akunId, Date.now()) });
  } catch {
    return NextResponse.json({ konteks: null });
  }
}
