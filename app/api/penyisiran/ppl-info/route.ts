// app/api/penyisiran/ppl-info/route.ts
//
// "Riwayat pendataan": cari PPL/mantan pendata SE2026 yang dulu
// dialokasikan ke ID Sub SLS suatu keluarga (tabel ppl_alokasi_idsls ->
// ppl_akun), dipakai tombol "Riwayat Pendataan" di tiap kartu keluarga
// pada tab Penyisiran Usaha -- supaya petugas yang menyisir bisa langsung
// tahu & menghubungi siapa yang dulu mendata wilayah itu kalau perlu
// konfirmasi lapangan. Mengembalikan nama + No HP PPL (data internal BPS,
// BUKAN data warga), jadi tetap dikunci role "penyisiran" spt endpoint
// lain di tab ini.
//
// Catatan: satu ID Sub SLS = satu PPL (unique di ppl_alokasi_idsls), tapi
// beberapa Sub SLS/ID Sub SLS BISA konflik dialokasikan ke >1 nama (lihat
// catatan di migrasi 20260917_ppl_akun_alokasi_idsls.sql) -- kalau
// kejadian, endpoint ini mengembalikan SEMUA nama yang match supaya tidak
// ada yang tersembunyi, bukan cuma salah satu.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!verifySession(extractBearer(req), ["penyisiran", "penyisiran_petugas"])) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const idsubsls = req.nextUrl.searchParams.get("idsubsls") || "";
  if (!idsubsls) return NextResponse.json({ ppl: [] });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("ppl_alokasi_idsls")
    .select("status_pencocokan, ppl_akun(nama, no_hp, korwil, pml)")
    .eq("idsubsls", idsubsls);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ppl = (data ?? []).map((r: any) => ({
    nama: r.ppl_akun?.nama ?? "",
    no_hp: r.ppl_akun?.no_hp ?? "",
    korwil: r.ppl_akun?.korwil ?? "",
    pml: r.ppl_akun?.pml ?? "",
  }));

  return NextResponse.json({ ppl });
}
