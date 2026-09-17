// app/api/penyisiran/update/route.ts
//
// Simpan hasil checklist petugas lapangan (status kunjungan + catatan +
// info PPL/Jorong/Tetangga + prioritas_pasti) untuk satu keluarga. Butuh
// token sesi valid dgn role "penyisiran" (PIN admin, jarang dipakai
// langsung utk ini sekarang) ATAU "penyisiran_petugas" (login personal
// nama+tanggal lahir -- lihat /api/penyisiran/penyisiran-login, cara
// akses UTAMA tab Penyisiran Usaha sekarang).
//
// `petugas_id`/`petugas_nama` (opsional) dikirim client -- diambil dari
// respons login personal (subject token "penyisiran_petugas"), BUKAN
// dropdown manual lagi -- disimpan ke penyisiran_oleh_id/penyisiran_oleh
// supaya tab "Monitoring Petugas Penyisiran" bisa menghitung "Jumlah
// Dikunjungi"/"Jumlah Didata" per petugas. Kalau tidak dikirim (mis. masih
// pakai PIN admin lama tanpa login personal), kolom itu dibiarkan seperti
// semula (tidak ditimpa null) supaya atribusi kunjungan sebelumnya tidak
// hilang.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_VALID = new Set(["belum", "ditemukan", "tidak_ditemukan", "tidak_bisa"]);

export async function PATCH(req: NextRequest) {
  if (!verifySession(extractBearer(req), ["penyisiran", "penyisiran_petugas"])) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const status = typeof body?.status_kunjungan === "string" ? body.status_kunjungan : "";
  const catatan = typeof body?.catatan_petugas === "string" ? body.catatan_petugas : null;
  const infoPpl = Boolean(body?.info_ppl);
  const infoJorong = Boolean(body?.info_jorong);
  const infoTetangga = Boolean(body?.info_tetangga);
  const prioritasPasti = Boolean(body?.prioritas_pasti);
  const petugasId = typeof body?.petugas_id === "number" ? body.petugas_id : null;
  const petugasNama = typeof body?.petugas_nama === "string" && body.petugas_nama.trim() ? body.petugas_nama.trim() : null;

  if (!id || !STATUS_VALID.has(status)) {
    return NextResponse.json({ error: "Data tidak lengkap / status tidak valid." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const patch: Record<string, unknown> = {
    status_kunjungan: status,
    catatan_petugas: catatan,
    info_ppl: infoPpl,
    info_jorong: infoJorong,
    info_tetangga: infoTetangga,
    prioritas_pasti: prioritasPasti,
    updated_at: new Date().toISOString(),
  };
  if (petugasId && petugasNama) {
    patch.penyisiran_oleh_id = petugasId;
    patch.penyisiran_oleh = petugasNama;
  }

  const { error } = await supabase.from("penyisiran_usaha").update(patch).eq("kode_identitas", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
