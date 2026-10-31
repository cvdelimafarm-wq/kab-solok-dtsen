// app/api/portal/spdt-qc/route.ts
//
// (29 Okt 2026) Hasil QC Pemahaman SPDT NTP untuk SUPERVISOR (tab "QC" di Lembar Pendataan SPDT NTP). Baca saja.
// Supervisor = pemegang izin menu spdt.supervisor (peran supervisor_spdt_ntp) pada kegiatan SPDT NTP -- sama dengan Monitoring.
//  GET [?tanggal=YYYY-MM-DD] -> HasilQcSpdt { hari, hari_ada[], rekap[ per PML ], peserta, ... }
//  GET ?dari=YYYY-MM-DD&sampai=YYYY-MM-DD -> { rentang } matriks petugas x hari; GET ?semua=1 -> { semua } rekap seluruh hari ber-soal
//  (31 Okt 2026) dua bentuk terakhir sama dengan yang dilihat admin di Kelola Pendataan (/api/portal/qc/admin), khusus kegiatan SPDT NTP.
// Mengubah pengaturan / bank soal tetap lewat Kelola Pendataan (izin bencana.admin); halaman ini tidak punya tombol ubah.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { peranSpdt } from "@/lib/portal/spdt";
import { GalatQc, hasilQcSupervisor, rentangAdmin, semuaAdmin } from "@/lib/portal/qc";
import { galatServer } from "@/lib/sigapGalat";
import { KEGIATAN_SPDT_ID } from "@/lib/spdtNtp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    if ((await peranSpdt(db, akun.id)) !== "supervisor") return NextResponse.json({ error: "Hasil QC khusus Supervisor SPDT NTP." }, { status: 403 });
    if (req.nextUrl.searchParams.get("semua") === "1") return NextResponse.json({ semua: await semuaAdmin(db, KEGIATAN_SPDT_ID) });
    const dari = req.nextUrl.searchParams.get("dari");
    const sampai = req.nextUrl.searchParams.get("sampai");
    if (dari || sampai) return NextResponse.json({ rentang: await rentangAdmin(db, KEGIATAN_SPDT_ID, dari, sampai) });
    const tgl = req.nextUrl.searchParams.get("tanggal");
    return NextResponse.json(await hasilQcSupervisor(db, KEGIATAN_SPDT_ID, tgl && /^\d{4}-\d{2}-\d{2}$/.test(tgl) ? tgl : null));
  } catch (err) {
    if (err instanceof GalatQc) return NextResponse.json({ error: err.message }, { status: err.status });
    return galatServer("spdt-qc", err);
  }
}
