// app/api/bencana/alokasi/susunan-tim/route.ts
//
// Panel "Susunan Tim": menetapkan siapa berperan PPL / PML / Korwil, dan
// siapa atasan masing-masing (PPL->PML, PML->Korwil) -- SEMUANYA manual
// lewat dropdown, tidak ada pengelompokan otomatis sama sekali (sesuai
// keputusan: "Manual juga", berlaku utk seluruh jenjang termasuk PML &
// Korwil, bukan cuma PPL->Sub SLS di reassign/route.ts).
//
// Aturan kepegawaian (dari spesifikasi awal user):
//   - Korwil WAJIB pegawai organik
//   - PML boleh organik atau mitra
//   - PPL WAJIB mitra
//
// POST { petugas_id, peran: "ppl" | "pml" | "korwil", atasan_id?: number | null }
//   -> tetapkan peran petugas (kalau belum) & atasan-nya:
//        - peran "ppl"    -> atasan_id wajib PML (dipakai jg utk memindah PPL
//          yg sudah diplot Sub SLS-nya lewat reassign/route.ts ke PML lain)
//        - peran "pml"    -> atasan_id wajib Korwil (boleh dikosongkan dulu)
//        - peran "korwil" -> tidak punya atasan, atasan_id selalu null
// POST { petugas_id, lepas: true }
//   -> lepas peran & atasan petugas ini (kembali jadi "belum diplot"),
//      supaya bisa dipilih ulang utk peran lain.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const petugasId = typeof body?.petugas_id === "number" ? body.petugas_id : null;
  if (!petugasId) {
    return NextResponse.json({ error: "petugas_id wajib diisi." }, { status: 400 });
  }

  try {
    const { data: petugas, error: errPetugas } = await supabase
      .from("bencana_petugas")
      .select("id, nama, peran, status_kepegawaian, aktif")
      .eq("id", petugasId)
      .maybeSingle();
    if (errPetugas) return NextResponse.json({ error: errPetugas.message }, { status: 500 });
    if (!petugas) return NextResponse.json({ error: "Petugas tidak ditemukan." }, { status: 404 });

    if (body?.lepas === true) {
      const { error } = await supabase
        .from("bencana_petugas")
        .update({ peran: null, atasan_id: null })
        .eq("id", petugasId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, dilepas: true });
    }

    const peran = body?.peran === "ppl" || body?.peran === "pml" || body?.peran === "korwil" ? body.peran : null;
    if (!peran) {
      return NextResponse.json({ error: 'peran wajib "ppl", "pml", atau "korwil".' }, { status: 400 });
    }
    if (!petugas.aktif) {
      return NextResponse.json({ error: `${petugas.nama} berstatus tidak aktif.` }, { status: 400 });
    }
    if (petugas.peran && petugas.peran !== peran) {
      return NextResponse.json(
        {
          error: `${petugas.nama} sudah berperan sebagai ${petugas.peran}. Lepas dulu perannya sebelum menugaskan peran baru.`,
        },
        { status: 400 }
      );
    }
    if (peran === "korwil" && petugas.status_kepegawaian !== "organik") {
      return NextResponse.json({ error: `${petugas.nama} bukan pegawai organik. Aturan: Korwil wajib organik.` }, { status: 400 });
    }
    if (peran === "ppl" && petugas.status_kepegawaian !== "mitra") {
      return NextResponse.json({ error: `${petugas.nama} bukan mitra. Aturan: PPL wajib mitra.` }, { status: 400 });
    }

    let atasanId: number | null = null;
    if (peran === "pml" || peran === "ppl") {
      atasanId = typeof body?.atasan_id === "number" ? body.atasan_id : null;
      if (atasanId) {
        const peranAtasanDiharapkan = peran === "pml" ? "korwil" : "pml";
        const { data: atasan, error: errAtasan } = await supabase
          .from("bencana_petugas")
          .select("id, nama, peran")
          .eq("id", atasanId)
          .maybeSingle();
        if (errAtasan) return NextResponse.json({ error: errAtasan.message }, { status: 500 });
        if (!atasan || atasan.peran !== peranAtasanDiharapkan) {
          return NextResponse.json(
            { error: `Atasan yang dipilih belum berperan sebagai ${peranAtasanDiharapkan.toUpperCase()}.` },
            { status: 400 }
          );
        }
      }
    }
    // Korwil tidak punya atasan sama sekali.

    const { error: errUpdate } = await supabase
      .from("bencana_petugas")
      .update({ peran, atasan_id: atasanId })
      .eq("id", petugasId);
    if (errUpdate) return NextResponse.json({ error: errUpdate.message }, { status: 500 });

    return NextResponse.json({ ok: true, nama: petugas.nama, peran });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
