// app/api/bencana/alokasi/reset-semua/route.ts
//
// "Reset Semua Plotting": hapus SELURUH baris bencana_alokasi_subsls sekali
// jalan -- mengembalikan SEMUA Sub SLS (termasuk yg sudah dipecah) ke status
// belum terplot sama sekali. Dipakai kalau admin perlu mengulang dari nol
// (mis. setelah banyak eksperimen manual/Auto Plot/Pecah Sub SLS yg bikin
// bingung). TIDAK menyentuh Susunan Tim (peran PML/Korwil & atasan_id tetap
// -- hanya peran 'ppl' yg dilepas kalau org itu tidak lagi punya alokasi
// apa pun sesudah reset, sama seperti "buka_kunci"/"gabung_kembali").
//
// Sengaja TIDAK ada sistem login di app ini (lihat komentar endpoint
// bencana_* lain) -- jadi aksi destruktif ini digerbangi PIN statis (bukan
// autentikasi sungguhan, cuma extra friction spy tidak ketidaksengajaan
// klik) yg DIVALIDASI DI SINI JUGA (bukan cuma di UI) supaya tidak bisa
// dipanggil langsung lewat API tanpa PIN.
//
// POST { pin: string }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PIN_RESET = "1234";

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
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
  if (pin !== PIN_RESET) {
    return NextResponse.json({ error: "PIN salah." }, { status: 403 });
  }

  try {
    const { data: semua, error: errSemua } = await supabase.from("bencana_alokasi_subsls").select("ppl_id");
    if (errSemua) return NextResponse.json({ error: errSemua.message }, { status: 500 });
    const pplIdTerdampak = Array.from(new Set((semua ?? []).map((r) => r.ppl_id as number)));
    const jumlahDireset = (semua ?? []).length;

    const { error: errDel } = await supabase.from("bencana_alokasi_subsls").delete().neq("idsubsls", "");
    if (errDel) return NextResponse.json({ error: errDel.message }, { status: 500 });

    for (const id of pplIdTerdampak) {
      const { count } = await supabase
        .from("bencana_alokasi_subsls")
        .select("id", { count: "exact", head: true })
        .eq("ppl_id", id);
      if (!count) {
        await supabase.from("bencana_petugas").update({ peran: null }).eq("id", id);
      }
    }

    return NextResponse.json({ ok: true, jumlah_direset: jumlahDireset });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
