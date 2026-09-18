// app/api/penyisiran/alokasi/export-subsls/route.ts
//
// Unduh alokasi SLS yang SUDAH DIPILIH petugas (penyisiran_alokasi_pilihan),
// dipecah per SUBSLS, sebagai file Excel (.xlsx) dengan format kolom yang
// SAMA dengan contoh file "Pengawas" yang diberikan pengelola:
//   PROVINSI | KABUPATEN/KOTA | KECAMATAN | DESA | SLS | SUBSLS |
//   Email Pengawas | Email Pencacah
// (satu baris per SUBSLS -- satu SLS dgn 3 subsls jadi 3 baris).
//
// Dipakai tombol export di tab Perencanaan Lapangan, di samping header
// "Identifikasi Wilayah Sampel SLS" (lihat perencanaan-lapangan.tsx,
// WilayahSampelPanel). Akses DIKUNCI ke pengelola yang sama dengan tab
// Manajemen Target / Master Petugas (bolehAksesManajemenTarget), karena
// email pengawas & pencacah adalah data yang dikelola lewat tab Master
// Petugas -- lihat .../master-petugas/route.ts.
//
// PROVINSI & KABUPATEN/KOTA di-hardcode (13 / "03") krn aplikasi ini
// khusus Kabupaten Solok, Provinsi Sumatera Barat -- sama seperti kode
// yang sudah dipakai di tempat lain pada aplikasi ini.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { bolehAksesManajemenTarget } from "@/lib/manajemenTargetAkses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVINSI_KODE = "13"; // Sumatera Barat
const KABUPATEN_KODE = "03"; // Kabupaten Solok

interface ExportRow {
  kec_kode: string;
  nagari_kode: string;
  sls_kode: string;
  subsls_kode: string;
  kec_nama: string | null;
  nagari_nama: string | null;
  sls_nama: string | null;
  petugas_id: number;
  petugas_nama: string;
  email_pencacah: string | null;
  email_pengawas: string | null;
}

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

  const { data, error } = await supabase.rpc("penyisiran_alokasi_export_subsls");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as ExportRow[];

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
  // Paksa semua kolom kode wilayah (A-F) jadi bertipe teks (bukan angka) di
  // file .xlsx yang dihasilkan -- kalau tidak, Excel akan otomatis membuang
  // angka nol di depan (mis. kode kecamatan "01" jadi 1) begitu dibuka.
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
  // XLSX.write(...) diketik "any" oleh definisi tipe paket xlsx -- SENGAJA
  // tidak di-cast ke "Buffer" (walau isinya memang Node Buffer krn
  // type:"buffer" & runtime "nodejs") krn generic Buffer<ArrayBufferLike>
  // di @types/node versi baru bentrok dgn union BodyInit di lib DOM saat
  // dipakai eksplisit sbg tipe -- dibiarkan "any" saja, tetap valid dioper
  // ke NextResponse (BodyInit) & tetap bisa diakses .length.
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="alokasi_pengawas_pencacah_subsls.xlsx"`,
      "Content-Length": String(buf.length),
    },
  });
}
