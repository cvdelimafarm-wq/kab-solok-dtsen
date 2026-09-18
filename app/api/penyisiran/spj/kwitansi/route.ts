// app/api/penyisiran/spj/kwitansi/route.ts
//
// GET  -> daftar Surat Tugas milik petugas yg login, disertai Kwitansi-nya
//         kalau sudah pernah diisi (satu Kwitansi per ST, sesuai unique
//         constraint di spj_kwitansi).
// POST -> buat/perbarui (upsert) Kwitansi utk SATU ST miliknya sendiri.
//         Nominal WAJIB diinput manual (dikonfirmasi user: "diinput
//         manual tiap kali oleh petugas/pengelola") -- sistem cuma
//         menyarankan `terbilang` otomatis dari nominal (lib/spjFormat.ts
//         terbilangRupiah), tapi boleh ditimpa manual kalau client
//         mengirim `terbilang` sendiri.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractBearer } from "@/lib/penyisiranAuth";
import { verifySpjSession, tabelAkun } from "@/lib/spjAuth";
import { terbilangRupiah } from "@/lib/spjFormat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const { data: tautan, error: errTautan } = await supabase
    .from("spj_surat_tugas_petugas")
    .select("surat_tugas_id")
    .eq("petugas_jenis", session.jenis)
    .eq("petugas_id", session.petugasId);
  if (errTautan) return NextResponse.json({ error: errTautan.message }, { status: 500 });

  const ids = (tautan ?? []).map((t: { surat_tugas_id: number }) => t.surat_tugas_id);
  if (ids.length === 0) return NextResponse.json({ daftar: [] });

  const [{ data: stList, error: errSt }, { data: kwitansiList, error: errKwitansi }] = await Promise.all([
    supabase
      .from("spj_surat_tugas")
      .select("id, nomor_st, tanggal_mulai, tanggal_selesai")
      .in("id", ids)
      .order("tanggal_mulai", { ascending: false }),
    supabase
      .from("spj_kwitansi")
      .select("*")
      .eq("petugas_jenis", session.jenis)
      .eq("petugas_id", session.petugasId)
      .in("surat_tugas_id", ids),
  ]);
  if (errSt) return NextResponse.json({ error: errSt.message }, { status: 500 });
  if (errKwitansi) return NextResponse.json({ error: errKwitansi.message }, { status: 500 });

  const petaKwitansi = new Map((kwitansiList ?? []).map((k: { surat_tugas_id: number }) => [k.surat_tugas_id, k]));
  const daftar = (stList ?? []).map((st: { id: number; nomor_st: string; tanggal_mulai: string; tanggal_selesai: string }) => ({
    surat_tugas_id: st.id,
    nomor_st: st.nomor_st,
    tanggal_mulai: st.tanggal_mulai,
    tanggal_selesai: st.tanggal_selesai,
    kwitansi: petaKwitansi.get(st.id) ?? null,
  }));

  return NextResponse.json({ daftar });
}

export async function POST(req: NextRequest) {
  const session = verifySpjSession(extractBearer(req));
  if (!session) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  const supabase = supabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const body = await req.json().catch(() => null);
  const suratTugasId = Number(body?.surat_tugas_id);
  const nominal = Number(body?.nominal);
  const untukPerjalananDinasPada = String(body?.untuk_perjalanan_dinas_pada || "").trim();
  const tanggalSpd = String(body?.tanggal_spd || "").trim();
  const tanggalKwitansi = String(body?.tanggal_kwitansi || "").trim() || new Date().toISOString().slice(0, 10);
  const terbilangInput = typeof body?.terbilang === "string" ? body.terbilang.trim() : "";

  if (!Number.isFinite(suratTugasId)) return NextResponse.json({ error: "Surat Tugas tidak valid." }, { status: 400 });
  if (!Number.isFinite(nominal) || nominal < 0) return NextResponse.json({ error: "Nominal tidak valid." }, { status: 400 });
  if (!untukPerjalananDinasPada) {
    return NextResponse.json({ error: "Tujuan perjalanan dinas dalam kota wajib diisi." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalSpd)) return NextResponse.json({ error: "Tanggal SPD wajib diisi." }, { status: 400 });

  const { data: taut, error: errTaut } = await supabase
    .from("spj_surat_tugas_petugas")
    .select("id")
    .eq("surat_tugas_id", suratTugasId)
    .eq("petugas_jenis", session.jenis)
    .eq("petugas_id", session.petugasId)
    .maybeSingle();
  if (errTaut) return NextResponse.json({ error: errTaut.message }, { status: 500 });
  if (!taut) return NextResponse.json({ error: "Surat Tugas ini bukan milik Anda." }, { status: 403 });

  const terbilang = terbilangInput || terbilangRupiah(nominal);
  const { data: akun } = await supabase.from(tabelAkun(session.jenis)).select("nama").eq("id", session.petugasId).maybeSingle();

  const { data: upserted, error: errUpsert } = await supabase
    .from("spj_kwitansi")
    .upsert(
      {
        surat_tugas_id: suratTugasId,
        petugas_jenis: session.jenis,
        petugas_id: session.petugasId,
        nominal,
        terbilang,
        untuk_perjalanan_dinas_pada: untukPerjalananDinasPada,
        tanggal_spd: tanggalSpd,
        tanggal_kwitansi: tanggalKwitansi,
        created_by: akun?.nama ?? null,
      },
      { onConflict: "surat_tugas_id,petugas_jenis,petugas_id" }
    )
    .select("id")
    .single();
  if (errUpsert || !upserted) {
    return NextResponse.json({ error: errUpsert?.message || "Gagal menyimpan Kwitansi." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: upserted.id });
}
