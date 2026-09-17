// app/api/penyisiran/petugas-toggle-aktif/route.ts
//
// Aktifkan/nonaktifkan satu petugas penyisiran (petugas_penyisiran_akun.aktif)
// -- dipakai fitur "Kelola Petugas Penyisiran" yang DEFAULT DISEMBUNYIKAN di
// tab "Monitoring Petugas Penyisiran". Petugas yang dinonaktifkan:
//  - tidak muncul lagi di dropdown "Nama Anda" (/api/penyisiran/penyisiran-names)
//    di tab Penyisiran Usaha,
//  - tidak bisa lagi login ke tab "Identifikasi Jorong" (/api/penyisiran/jorong-login
//    ikut memeriksa aktif=true).
// Riwayat kunjungan/identifikasi yang SUDAH tercatat atas nama petugas itu
// TIDAK dihapus/disembunyikan.
//
// Selain token sesi role "penyisiran" (basic gate tab ini), endpoint ini
// MEWAJIBKAN PIN diketik ulang (dicek server-side lewat checkPin(), sama PIN
// dgn PENYISIRAN_PIN) -- supaya tombol aktif/nonaktif tidak kepencet asal
// oleh siapa saja yang sekadar membuka tab monitoring ini.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer, checkPin } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  if (!verifySession(extractBearer(req), "penyisiran")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const petugasId = typeof body?.petugas_id === "number" ? body.petugas_id : null;
  const aktif = typeof body?.aktif === "boolean" ? body.aktif : null;
  const pin = typeof body?.pin === "string" ? body.pin : "";

  if (!petugasId || aktif === null) {
    return NextResponse.json({ error: "Data tidak lengkap." }, { status: 400 });
  }
  if (!checkPin(pin, "penyisiran")) {
    return NextResponse.json({ error: "PIN salah." }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { error } = await supabase.from("petugas_penyisiran_akun").update({ aktif }).eq("id", petugasId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
