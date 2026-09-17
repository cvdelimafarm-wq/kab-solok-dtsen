// app/api/penyisiran/tetangga-login/route.ts
//
// Login PERSONAL utk tab "Identifikasi Tetangga/Lainnya" -- Nama +
// Tanggal Lahir, dicocokkan ke tabel tetangga_akun (TABEL SENDIRI, beda
// dari ppl_akun MAUPUN petugas_penyisiran_akun -- lihat migrasi
// supabase/migrations/20260918_tetangga_akun.sql). Sama persis pola dgn
// /api/penyisiran/jorong-login, cuma tabel sumber & role token yang
// terbit beda ("identifikasi_tetangga").

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { signSession } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normNama(s: string): string {
  return s.trim().replace(/\s+/g, " ").toUpperCase();
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const nama = typeof body?.nama === "string" ? body.nama : "";
  const tanggalLahir = typeof body?.tanggal_lahir === "string" ? body.tanggal_lahir : "";

  if (!nama.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(tanggalLahir)) {
    return NextResponse.json(
      { error: "Isi nama lengkap dan tanggal lahir (format tanggal tidak valid)." },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const namaNorm = normNama(nama);

  const { data, error } = await supabase
    .from("tetangga_akun")
    .select("id, nama, tanggal_lahir")
    .eq("nama_norm", namaNorm)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data) {
    return NextResponse.json(
      { error: "Nama tidak ditemukan di daftar. Periksa kembali ejaan nama Anda." },
      { status: 401 }
    );
  }

  if (!data.tanggal_lahir) {
    return NextResponse.json(
      {
        error:
          "Tanggal lahir Anda belum tercatat di sistem sehingga belum bisa login. Mohon hubungi petugas BPS Kabupaten Solok untuk melengkapi data ini.",
      },
      { status: 403 }
    );
  }

  if (data.tanggal_lahir !== tanggalLahir) {
    return NextResponse.json({ error: "Nama ditemukan, tapi tanggal lahir tidak cocok." }, { status: 401 });
  }

  const token = signSession("identifikasi_tetangga", String(data.id));
  return NextResponse.json({ token, nama: data.nama });
}
