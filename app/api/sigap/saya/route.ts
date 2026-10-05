// app/api/sigap/saya/route.ts
//
// (5 Okt 2026) Info akun yg sedang masuk SIGAP utk portal: menu mana yg tampil (sesuai peran & izin)
// -- permintaan user: satu pintu portal, menu sesuai hak akses.
// GET (Authorization: Bearer <sesi>) -> { nama, token_petugas|null, peran[], izin, admin, kelola_akses }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { penugasanAkun } from "@/lib/sigap";
import { boleh, izinAkun, punyaAksesAdmin, sesiDariHeader } from "@/lib/sigapAkses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  const akunId = sesiDariHeader(req.headers);
  if (!akunId) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  const { data: a } = await db.from("sigap_akun").select("id, nama, token, aktif").eq("id", akunId).maybeSingle();
  if (!a || !a.aktif) return NextResponse.json({ error: "Akun tidak aktif." }, { status: 403 });
  const [pen, { peran, izin }] = await Promise.all([penugasanAkun(db, akunId), izinAkun(db, akunId)]);
  return NextResponse.json({
    nama: a.nama,
    token_petugas: pen.length > 0 ? a.token : null,
    jumlah_penugasan: pen.length,
    peran,
    izin,
    admin: punyaAksesAdmin(izin),
    kelola_akses: boleh(izin, "akses.kelola", "kelola"),
  });
}
