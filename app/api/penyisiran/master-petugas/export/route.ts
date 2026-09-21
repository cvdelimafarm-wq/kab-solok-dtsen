// app/api/penyisiran/master-petugas/export/route.ts
//
// Unduh SELURUH data "Daftar Petugas" (tabel petugas_penyisiran_akun) yang
// tampil di tab Master Petugas sebagai file Excel (.xlsx) -- satu baris per
// petugas, kolom SAMA dgn yang ditampilkan di tabel UI (Nama/Status Akun/
// Email/No. HP/Kecamatan/Nagari/Alamat Detail/Status Kepegawaian/Pengawas)
// DITAMBAH NIP & Tanggal Lahir (tersimpan di DB tapi belum ditampilkan di
// kolom tabel UI -- dibutuhkan pengelola utk keperluan biodata/administrasi).
//
// Tombol export di master-petugas.tsx (MasterPetugasPanel) -- akses DIKUNCI
// ke pengelola yg sama dgn tab ini sendiri (bolehAksesManajemenTarget),
// pola fetch+blob client-side SAMA dgn handleExportSubsls di
// perencanaan-lapangan.tsx (endpoint butuh header Authorization, jadi tidak
// bisa window.open langsung ke URL-nya).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";
import { bolehAksesManajemenTarget } from "@/lib/manajemenTargetAkses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { mitra: "Mitra", organik: "Organik" };

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

  const { data, error } = await supabase
    .from("petugas_penyisiran_akun")
    .select("id, nama, aktif, nip, tanggal_lahir, email, no_hp, alamat_kecamatan, alamat_nagari, alamat_detail, status_kepegawaian, pengawas_id, keterangan")
    .order("nama", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const semua = data ?? [];
  const namaById = new Map<number, string>(semua.map((p: any) => [p.id, p.nama]));

  const header = [
    "Nama Lengkap",
    "Status Akun",
    "NIP / No. Registrasi Sobat",
    "Tanggal Lahir",
    "Email",
    "No. HP",
    "Kecamatan",
    "Nagari",
    "Alamat Detail",
    "Status Kepegawaian",
    "Pengawas",
    "Keterangan",
  ];
  const aoa: (string | null)[][] = [header];
  for (const p of semua as any[]) {
    aoa.push([
      p.nama,
      p.aktif ? "Aktif" : "Nonaktif",
      p.nip ?? "",
      p.tanggal_lahir ?? "",
      p.email ?? "",
      p.no_hp ?? "",
      p.alamat_kecamatan ?? "",
      p.alamat_nagari ?? "",
      p.alamat_detail ?? "",
      p.status_kepegawaian ? STATUS_LABEL[p.status_kepegawaian] ?? p.status_kepegawaian : "",
      p.pengawas_id != null ? namaById.get(p.pengawas_id) ?? "" : "",
      p.keterangan ?? "",
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Kolom NIP (index 2) & Tanggal Lahir (index 3) dipaksa jadi teks -- kalau
  // tidak, Excel otomatis membuang nol di depan NIP / menafsirkan tanggal
  // dgn locale yang salah begitu file dibuka (sama alasan dgn kode wilayah
  // di export-subsls/route.ts).
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  for (let R = 1; R <= range.e.r; R++) {
    for (const C of [2, 3]) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (cell) cell.t = "s";
    }
  }
  ws["!cols"] = [
    { wch: 24 }, // Nama Lengkap
    { wch: 10 }, // Status Akun
    { wch: 26 }, // NIP
    { wch: 13 }, // Tanggal Lahir
    { wch: 28 }, // Email
    { wch: 18 }, // No. HP
    { wch: 16 }, // Kecamatan
    { wch: 20 }, // Nagari
    { wch: 40 }, // Alamat Detail
    { wch: 16 }, // Status Kepegawaian
    { wch: 20 }, // Pengawas
    { wch: 26 }, // Keterangan
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Daftar Petugas");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="daftar_petugas_master.xlsx"`,
      "Content-Length": String(buf.length),
    },
  });
}
