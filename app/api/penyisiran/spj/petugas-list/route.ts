// app/api/penyisiran/spj/petugas-list/route.ts
//
// Daftar SEMUA petugas yang bisa ditautkan ke Surat Tugas (gabungan
// petugas_penyisiran_akun + tetangga_akun, yang AKTIF saja) -- dipakai
// dropdown/checklist "tautkan ke petugas" di form upload Surat Tugas.
// HANYA bisa diakses pengelola (lihat pastikanPengelolaSpj di
// lib/spjAuth.ts), krn daftar ini menyingkap nama SEMUA petugas lintas
// dua tabel akun, bukan cuma milik sendiri.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, pastikanPengelolaSpj } from "@/lib/spjAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const namaPengelola = await pastikanPengelolaSpj(session, supabase);
  if (!namaPengelola) {
    return NextResponse.json(
      { error: "Fitur ini hanya dapat diakses oleh pengelola yang ditentukan." },
      { status: 403 }
    );
  }

  const [{ data: penyisiran, error: errPenyisiran }, { data: tetangga, error: errTetangga }] = await Promise.all([
    supabase.from("petugas_penyisiran_akun").select("id, nama").eq("aktif", true).order("nama", { ascending: true }),
    supabase.from("tetangga_akun").select("id, nama").eq("aktif", true).order("nama", { ascending: true }),
  ]);
  if (errPenyisiran) return NextResponse.json({ error: errPenyisiran.message }, { status: 500 });
  if (errTetangga) return NextResponse.json({ error: errTetangga.message }, { status: 500 });

  const hasil = [
    ...(penyisiran ?? []).map((p: { id: number; nama: string }) => ({
      jenis: "penyisiran" as const,
      id: p.id,
      nama: p.nama,
      label: `${p.nama} (Petugas Penyisiran)`,
    })),
    ...(tetangga ?? []).map((p: { id: number; nama: string }) => ({
      jenis: "tetangga" as const,
      id: p.id,
      nama: p.nama,
      label: `${p.nama} (Tetangga/Lainnya)`,
    })),
  ].sort((a, b) => a.nama.localeCompare(b.nama));

  return NextResponse.json({ petugas: hasil });
}
