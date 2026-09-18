// app/api/penyisiran/target/ringkasan/route.ts
//
// Rekap jumlah hasil Identifikasi (Ada / Tidak Ada / Ragu / Belum)
// dikelompokkan per level wilayah pilihan (?level=kec|nagari|subsls) --
// panel "Ringkasan Hasil Identifikasi" di tab "Manajemen Target". Bungkus
// RPC penyisiran_ringkasan_identifikasi(p_level) -- lihat migrasi
// 20260918_petugas_target.sql.
//
// Akses SAMA dgn /api/penyisiran/target (role "penyisiran_petugas" +
// nama termasuk pengelola yg diizinkan) -- ringkasan ini memang bagian
// dari tab yang sama, bukan endpoint publik/tab lain.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { bolehAksesManajemenTarget } from "@/lib/manajemenTargetAkses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEVEL_VALID = new Set(["kec", "nagari", "subsls"]);

export async function GET(req: NextRequest) {
  const token = extractBearer(req);
  if (!verifySession(token, "penyisiran_petugas")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const subjectId = getSessionSubject(token);
  if (!subjectId) return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: akun, error: akunErr } = await supabase
    .from("petugas_penyisiran_akun")
    .select("nama")
    .eq("id", subjectId)
    .maybeSingle();
  if (akunErr) return NextResponse.json({ error: akunErr.message }, { status: 500 });
  if (!bolehAksesManajemenTarget(akun?.nama)) {
    return NextResponse.json(
      { error: "Tab ini hanya dapat diakses oleh pengelola yang ditentukan." },
      { status: 403 }
    );
  }

  const levelInput = req.nextUrl.searchParams.get("level") || "kec";
  const level = LEVEL_VALID.has(levelInput) ? levelInput : "kec";

  const { data, error } = await supabase.rpc("penyisiran_ringkasan_identifikasi", { p_level: level });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ level, data: data ?? [] });
}
