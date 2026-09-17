// app/api/penyisiran/identifikasi/route.ts
//
// Simpan hasil "Identifikasi PPL (Mantan Pendata)": seingat PPL yang dulu
// mendata SE2026 di wilayah ini, apakah keluarga tsb punya usaha atau
// tidak (Ada / Tidak Ada / Ragu). Dipisah dari update/route.ts (checklist
// petugas lapangan) karena dilindungi PIN yang BEDA
// (PENYISIRAN_IDENTIFIKASI_PIN) -- PIN ini yang dibagikan ke para PPL,
// jadi sengaja diterima juga token role "penyisiran" (supervisor internal
// boleh ikut mengisi) tapi TIDAK sebaliknya: token "identifikasi" tidak
// bisa dipakai memanggil endpoint checklist utama (list/update/upload/
// export/markers).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID = new Set(["belum", "ada", "tidak_ada", "ragu"]);

export async function PATCH(req: NextRequest) {
  if (!verifySession(extractBearer(req), ["penyisiran", "identifikasi"])) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const nilai = typeof body?.identifikasi_ppl === "string" ? body.identifikasi_ppl : "";

  if (!id || !VALID.has(nilai)) {
    return NextResponse.json({ error: "Data tidak lengkap / nilai tidak valid." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { error } = await supabase
    .from("penyisiran_usaha")
    .update({ identifikasi_ppl: nilai, identifikasi_ppl_at: new Date().toISOString() })
    .eq("kode_identitas", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
