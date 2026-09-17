// app/api/penyisiran/update/route.ts
//
// Simpan hasil checklist petugas lapangan (status kunjungan + catatan)
// untuk satu keluarga. Butuh token sesi valid.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_VALID = new Set(["belum", "ditemukan", "tidak_ditemukan", "tidak_bisa"]);

export async function PATCH(req: NextRequest) {
  if (!verifySession(extractBearer(req))) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const status = typeof body?.status_kunjungan === "string" ? body.status_kunjungan : "";
  const catatan = typeof body?.catatan_petugas === "string" ? body.catatan_petugas : null;

  if (!id || !STATUS_VALID.has(status)) {
    return NextResponse.json({ error: "Data tidak lengkap / status tidak valid." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { error } = await supabase
    .from("penyisiran_usaha")
    .update({
      status_kunjungan: status,
      catatan_petugas: catatan,
      updated_at: new Date().toISOString(),
    })
    .eq("kode_identitas", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
