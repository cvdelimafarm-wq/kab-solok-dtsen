// app/api/penyisiran/alokasi/oh-monitoring/route.ts
//
// Dashboard monitoring kuota translok (Orang-Hari/OH) -- HANYA bisa
// diakses 4 nama pengelola yang SAMA dgn tab "Manajemen Target" (lihat
// lib/manajemenTargetAkses.ts: Bambang Suryanggono, Deswaty, M. Iqbal
// Hadi, Wisnu Dwi Jayanto), login menumpang akun & role "penyisiran_petugas"
// yang sama dgn tab "Perencanaan Lapangan"/"Penyisiran Usaha".
//
// KUOTA_OH_TRANSLOK = 280 (dikonfirmasi user, HARDCODE -- gampang diubah
// di sini kalau kuota resmi berubah). 1 baris aktif (dibatalkan_oleh IS
// NULL) di penyisiran_alokasi_hari_tugas = 1 OH terpakai. Kalau kuota
// habis, endpoint checklist petugas (.../alokasi/hari-tugas) TETAP
// mengizinkan centang baru -- dashboard ini cuma menampilkan
// peringatan/status, TIDAK mengunci apa pun (dikonfirmasi user).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { bolehAksesManajemenTarget } from "@/lib/manajemenTargetAkses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const KUOTA_OH_TRANSLOK = 280;

export async function GET(req: NextRequest) {
  const token = extractBearer(req);
  if (!verifySession(token, "penyisiran_petugas")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const subjectId = getSessionSubject(token);
  const petugasId = Number(subjectId);
  if (!subjectId || !Number.isFinite(petugasId) || petugasId <= 0) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: akun, error: akunErr } = await supabase
    .from("petugas_penyisiran_akun")
    .select("nama")
    .eq("id", petugasId)
    .maybeSingle();
  if (akunErr) return NextResponse.json({ error: akunErr.message }, { status: 500 });
  if (!bolehAksesManajemenTarget(akun?.nama)) {
    return NextResponse.json({ error: "Panel ini hanya dapat diakses oleh pengelola yang ditentukan." }, { status: 403 });
  }

  const { data: rows, error: rowsErr } = await supabase
    .from("penyisiran_alokasi_hari_tugas")
    .select("petugas_id, hari, dibatalkan_oleh, dibatalkan_at, petugas_penyisiran_akun(nama)")
    .order("petugas_id", { ascending: true });
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  type Baris = {
    petugas_id: number;
    hari: string;
    dibatalkan_oleh: string | null;
    dibatalkan_at: string | null;
    petugas_penyisiran_akun: { nama: string } | { nama: string }[] | null;
  };
  const list = (rows ?? []) as unknown as Baris[];

  const terpakai = list.filter((r) => !r.dibatalkan_oleh).length;

  const perPetugas = new Map<number, { petugas_id: number; petugas_nama: string; hari: Baris[] }>();
  for (const r of list) {
    const namaObj = Array.isArray(r.petugas_penyisiran_akun) ? r.petugas_penyisiran_akun[0] : r.petugas_penyisiran_akun;
    if (!perPetugas.has(r.petugas_id)) {
      perPetugas.set(r.petugas_id, { petugas_id: r.petugas_id, petugas_nama: namaObj?.nama ?? "-", hari: [] });
    }
    perPetugas.get(r.petugas_id)!.hari.push(r);
  }
  const rincian = Array.from(perPetugas.values())
    .map((p) => ({
      petugas_id: p.petugas_id,
      petugas_nama: p.petugas_nama,
      hari: p.hari.map((h) => ({ hari: h.hari, dibatalkan_oleh: h.dibatalkan_oleh, dibatalkan_at: h.dibatalkan_at })),
    }))
    .sort((a, b) => a.petugas_nama.localeCompare(b.petugas_nama));

  return NextResponse.json({
    kuota: KUOTA_OH_TRANSLOK,
    terpakai,
    sisa: KUOTA_OH_TRANSLOK - terpakai,
    rincian,
  });
}
