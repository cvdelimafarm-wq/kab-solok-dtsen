// app/api/penyisiran/update/route.ts
//
// Simpan hasil checklist petugas lapangan (status kunjungan + catatan +
// info PPL/Jorong/Tetangga + prioritas_pasti) untuk satu keluarga. Butuh
// token sesi valid dgn role "penyisiran".
//
// `petugas_id` (opsional, id baris petugas_penyisiran_akun) dikirim client
// dari dropdown "Nama Anda" di tab Penyisiran Usaha -- BUKAN bagian dari
// token sesi (role "penyisiran" tetap PIN bersama, tidak diubah jadi login
// personal), cuma label atribusi biasa yg disimpan ke penyisiran_oleh_id/
// penyisiran_oleh supaya tab "Monitoring Petugas Penyisiran" bisa menghitung
// "Jumlah Dikunjungi"/"Jumlah Didata" per petugas. Kalau tidak dikirim (mis.
// pengguna lama yg belum pilih nama), kolom itu dibiarkan seperti semula
// (tidak ditimpa null) supaya atribusi kunjungan sebelumnya tidak hilang.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_VALID = new Set(["belum", "ditemukan", "tidak_ditemukan", "tidak_bisa"]);

export async function PATCH(req: NextRequest) {
  if (!verifySession(extractBearer(req), "penyisiran")) {
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
