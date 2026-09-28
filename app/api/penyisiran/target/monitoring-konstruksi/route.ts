// app/api/penyisiran/target/monitoring-konstruksi/route.ts
//
// Monitoring khusus usaha Konstruksi SE2026 -- panel "Monitoring Usaha
// Konstruksi" di tab "Manajemen Target". LIVE (bukan snapshot Excel):
// membungkus dua RPC yg query langsung ke penyisiran_usaha tiap kali
// dipanggil, jadi otomatis ikut berubah kalau data lapangan berubah --
// lihat migrasi 20260928c_monitoring_konstruksi_kecamatan_dan_ppl.sql.
//   - penyisiran_monitoring_konstruksi_kecamatan(): ringkasan per kecamatan
//     (target, realisasi, kelengkapan info, dll).
//   - penyisiran_monitoring_konstruksi_ppl(): rincian per baris PPL --
//     tipe_baris "PPL" (PPL terdaftar, wilayah pilihannya mencakup target
//     usaha ini -- bisa 0 kalau wilayah pilihannya kebetulan tdk kena
//     usaha Konstruksi manapun), "UNASSIGNED" (usaha yg lokasinya di luar
//     semua wilayah pilihan PPL yg terdaftar di kecamatan itu), "NO_PPL"
//     (kecamatan yg sama sekali belum py PPL terdaftar).
//
// Akses SAMA dgn /api/penyisiran/target/ringkasan (role "penyisiran_petugas"
// + nama termasuk pengelola yg diizinkan lewat bolehAksesManajemenTarget) --
// panel ini bagian dari tab "Manajemen Target" yg sama, bukan endpoint
// publik/tab lain.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { bolehAksesManajemenTarget } from "@/lib/manajemenTargetAkses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const [{ data: kecamatan, error: errKec }, { data: ppl, error: errPpl }] = await Promise.all([
    supabase.rpc("penyisiran_monitoring_konstruksi_kecamatan"),
    supabase.rpc("penyisiran_monitoring_konstruksi_ppl"),
  ]);
  if (errKec) return NextResponse.json({ error: errKec.message }, { status: 500 });
  if (errPpl) return NextResponse.json({ error: errPpl.message }, { status: 500 });

  return NextResponse.json({ kecamatan: kecamatan ?? [], ppl: ppl ?? [] });
}
