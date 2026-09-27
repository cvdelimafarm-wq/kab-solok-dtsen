// app/api/penyisiran/alokasi/oh-monitoring/batalkan/route.ts
//
// Super user (7 pengelola, lihat lib/manajemenTargetAkses.ts) mengelola
// SATU baris hari tugas (per TANGGAL kalender) milik petugas tertentu --
// lihat komentar lengkap di .../oh-monitoring/route.ts & migrasi
// supabase/migrations/20260918_hari_tugas_jadi_tanggal_kalender.sql.
//
// body: { petugas_id: number, tanggal: string ("YYYY-MM-DD"), aksi:
// "batalkan" | "aktifkan" | "tambah" }
//  - "batalkan" mengisi dibatalkan_oleh (nama super user yg login) &
//    dibatalkan_at (now()) supaya baris itu TERKUNCI dari sisi petugas
//    (muncul sbg badge "Dibatalkan oleh <nama>" di checklist Hari Tugas
//    miliknya) & TIDAK IKUT DIHITUNG sbg OH terpakai.
//  - "aktifkan" membalikkan (reset ke null) kalau pembatalan keliru/ingin
//    dikembalikan -- HANYA berlaku kalau barisnya sudah ada (UPDATE saja).
//  - (25 Sep 2026) "tambah" -- BARU, permintaan user: super user bisa
//    LANGSUNG menambahkan hari tugas utk petugas aktif mana pun, BUKAN
//    cuma membatalkan baris yg sudah dicentang petugas sendiri. Beda dari
//    "aktifkan" krn baris utk (petugas_id, tanggal) itu BOLEH BELUM ADA
//    sama sekali (petugas ybs belum pernah centang tanggal itu, bahkan
//    belum py baris SATU PUN) -- makanya pakai UPSERT (insert kalau blm
//    ada, atau reset dibatalkan_oleh/dibatalkan_at ke null kalau row-nya
//    kebetulan sudah ada tapi dlm status dibatalkan), bukan UPDATE spt
//    "aktifkan". petugas_id divalidasi via FK (gagal rapi kalau id-nya
//    tidak ada di petugas_penyisiran_akun).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { bolehAksesManajemenTarget } from "@/lib/manajemenTargetAkses";
import { tanggalDalamPeriodeHariTugas } from "@/lib/penyisiranHari";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const token = extractBearer(req);
  if (!verifySession(token, "penyisiran_petugas")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const subjectId = getSessionSubject(token);
  const adminId = Number(subjectId);
  if (!subjectId || !Number.isFinite(adminId) || adminId <= 0) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const petugasId = typeof body?.petugas_id === "number" ? body.petugas_id : null;
  const tanggal = typeof body?.tanggal === "string" ? body.tanggal : null;
  const aksi = body?.aksi === "batalkan" || body?.aksi === "aktifkan" || body?.aksi === "tambah" ? body.aksi : null;
  if (!petugasId || !tanggal || !aksi || !tanggalDalamPeriodeHariTugas(tanggal)) {
    return NextResponse.json({ error: "Data tidak lengkap/tidak valid." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: admin, error: adminErr } = await supabase
    .from("petugas_penyisiran_akun")
    .select("nama")
    .eq("id", adminId)
    .maybeSingle();
  if (adminErr) return NextResponse.json({ error: adminErr.message }, { status: 500 });
  if (!bolehAksesManajemenTarget(admin?.nama)) {
    return NextResponse.json({ error: "Aksi ini hanya dapat dilakukan oleh pengelola yang ditentukan." }, { status: 403 });
  }

  if (aksi === "tambah") {
    // UPSERT (bukan UPDATE) -- baris (petugas_id, tanggal) ini boleh belum
    // ada sama sekali (lihat komentar header di atas).
    const { error } = await supabase
      .from("penyisiran_alokasi_hari_tugas")
      .upsert(
        { petugas_id: petugasId, tanggal, dibatalkan_oleh: null, dibatalkan_at: null },
        { onConflict: "petugas_id,tanggal" }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const patch =
    aksi === "batalkan"
      ? { dibatalkan_oleh: admin!.nama, dibatalkan_at: new Date().toISOString() }
      : { dibatalkan_oleh: null, dibatalkan_at: null };

  const { error } = await supabase
    .from("penyisiran_alokasi_hari_tugas")
    .update(patch)
    .eq("petugas_id", petugasId)
    .eq("tanggal", tanggal);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
