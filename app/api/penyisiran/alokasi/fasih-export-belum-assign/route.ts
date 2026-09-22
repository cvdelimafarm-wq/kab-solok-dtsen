// app/api/penyisiran/alokasi/fasih-export-belum-assign/route.ts
//
// Export Excel utk daftar "⚠ Belum Ter-assign di FASIH" pada panel
// "🔄 Monitoring Assignment FASIH" (tab Perencanaan Lapangan) --
// permintaan user: "untuk selisih Belum Ter-assign di FASIH, sediakan
// export untuk list tersebut agar bisa saya assign kembali". Baris di
// daftar ini = SubSLS yang SUDAH ditag "📋 Identifikasi Wilayah Sampel
// SLS" di sistem, tapi BELUM/TIDAK ketemu di data FASIH tersimpan
// (assignment gagal/belum diproses) -- lihat penjelasan lengkap di
// .../alokasi/fasih-compare/route.ts (fungsi hitungPerbandingan, field
// belum_di_fasih, DIIMPOR di sini, BUKAN dihitung ulang, spy selalu
// konsisten dgn angka yg tampil di panel).
//
// Format kolom file yang dihasilkan SENGAJA SAMA PERSIS dgn "⬇ Export
// Excel Pengawas/Pencacah (per SUBSLS)" (.../alokasi/export-subsls/
// route.ts) -- yaitu format yang FASIH terima utk diupload -- supaya
// user bisa LANGSUNG upload ulang file ini ke FASIH utk re-assign,
// tanpa perlu edit manual:
//   PROVINSI | KABUPATEN/KOTA | KECAMATAN | DESA | SLS | SUBSLS |
//   Email Pengawas | Email Pencacah
// (kolom KECAMATAN/DESA/SLS/SUBSLS pakai KODE wilayah, bukan nama --
// itulah kenapa fasih-compare/route.ts skrg jg menyimpan kec_kode dst
// pada tiap baris belum_di_fasih, sebelumnya cuma nama-nya saja).
//
// Akses DIKUNCI ke pengelola yang sama dgn panel/tombol export lain
// (bolehAksesManajemenTarget) -- pola gate SAMA PERSIS dgn
// .../alokasi/export-subsls/route.ts & .../alokasi/fasih-compare/route.ts.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { bolehAksesManajemenTarget } from "@/lib/manajemenTargetAkses";
import { hitungPerbandingan } from "../fasih-compare/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVINSI_KODE = "13"; // Sumatera Barat
const KABUPATEN_KODE = "03"; // Kabupaten Solok

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

async function pastikanPengelola(req: NextRequest, supabase: any): Promise<null | NextResponse> {
  const token = extractBearer(req);
  if (!verifySession(token, "penyisiran_petugas")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const subjectId = getSessionSubject(token);
  if (!subjectId) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }
  const { data: akun, error } = await supabase
    .from("petugas_penyisiran_akun")
    .select("nama")
    .eq("id", subjectId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!bolehAksesManajemenTarget(akun?.nama ?? null)) {
    return NextResponse.json(
      { error: "Export ini hanya dapat diakses oleh pengelola yang ditentukan." },
      { status: 403 }
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const gate = await pastikanPengelola(req, supabase);
  if (gate) return gate;

  const hasil = await hitungPerbandingan(supabase);
  if ("error" in hasil) return hasil.error;

  const rows = hasil.hasil.belum_di_fasih as Array<{
    kec_kode: string;
    nagari_kode: string;
    sls_kode: string;
    subsls_kode: string;
    email_pencacah: string | null;
    email_pengawas: string | null;
  }>;

  const header = [
    "PROVINSI",
    "KABUPATEN/KOTA",
    "KECAMATAN",
    "DESA",
    "SLS",
    "SUBSLS",
    "Email Pengawas",
    "Email Pencacah",
  ];
  const aoa: (string | null)[][] = [header];
  for (const r of rows) {
    aoa.push([
      PROVINSI_KODE,
      KABUPATEN_KODE,
      r.kec_kode,
      r.nagari_kode,
      r.sls_kode,
      r.subsls_kode,
      r.email_pengawas ?? "",
      r.email_pencacah ?? "",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Paksa semua kolom kode wilayah (A-F) jadi bertipe teks -- SAMA pola dgn
  // export-subsls/route.ts, supaya Excel tidak membuang angka nol di depan
  // (mis. kode kecamatan "01" jadi 1) begitu dibuka.
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for (let R = 1; R <= range.e.r; R++) {
    for (let C = 0; C <= 5; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (cell) cell.t = "s";
    }
  }
  ws["!cols"] = [
    { wch: 10 },
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
    { wch: 8 },
    { wch: 8 },
    { wch: 28 },
    { wch: 28 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet0");
  // "any" sengaja (lihat komentar sama di export-subsls/route.ts) --
  // hindari bentrok tipe Buffer<ArrayBufferLike> vs union BodyInit.
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="assignment_belum_di_fasih.xlsx"`,
      "Content-Length": String(buf.length),
    },
  });
}
