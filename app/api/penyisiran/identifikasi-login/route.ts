// app/api/penyisiran/identifikasi-login/route.ts
//
// Login PERSONAL utk tab "Identifikasi PPL" -- menggantikan PIN bersama
// (PENYISIRAN_IDENTIFIKASI_PIN) dengan Nama + Tanggal Lahir milik masing-
// masing PPL, dicocokkan ke tabel ppl_akun (diisi dari sheet "PPL (Login)"
// pada file "Kode Wilayah dan Alokasi IDSLS - Rapi.xlsx"). Kalau cocok,
// terbitkan token role "identifikasi_ppl" yang membawa id ppl_akun
// (lihat lib/penyisiranAuth.ts) supaya endpoint daftar/isi keluarga bisa
// otomatis dibatasi ke ID Sub SLS milik PPL tsb saja -- PPL tidak perlu
// lagi pilih kecamatan/nagari manual.
//
// Nama dicocokkan case/spasi-insensitive (nama_norm, generated column di
// DB) supaya "budi pernandes" / "BUDI PERNANDES " / "Budi  Pernandes"
// semua dianggap sama. Tanggal lahir harus PERSIS sama (dipakai sbg
// "PIN" personal) -- format input dari client: "YYYY-MM-DD".

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
    .from("ppl_akun")
    .select("id, nama, tanggal_lahir")
    .eq("nama_norm", namaNorm)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data) {
    return NextResponse.json(
      { error: "Nama tidak ditemukan di daftar PPL. Periksa kembali ejaan nama Anda." },
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

  const token = signSession("identifikasi_ppl", String(data.id));
  return NextResponse.json({ token, nama: data.nama });
}
