// app/api/bencana/alokasi/reset-semua/route.ts
//
// "Reset Semua Plotting": hapus baris bencana_alokasi_subsls -- SELURUHNYA,
// atau cuma lingkup Kecamatan/Nagari tertentu (lewat dropdown di modal FE) --
// mengembalikan Sub SLS dlm lingkup itu (termasuk yg sudah dipecah) ke
// status belum terplot. Dipakai kalau admin perlu mengulang dari nol (mis.
// setelah banyak eksperimen manual/Auto Plot/Pecah Sub SLS yg bikin
// bingung), tanpa harus membongkar plotting Kecamatan/Nagari lain yg sudah
// benar. TIDAK menyentuh Susunan Tim (peran PML/Korwil & atasan_id tetap --
// hanya peran 'ppl' yg dilepas kalau org itu tidak lagi punya alokasi APA
// PUN di SELURUH wilayah sesudah reset, sama seperti "buka_kunci"/
// "gabung_kembali" -- jadi PPL yg masih punya plot di Kecamatan lain TIDAK
// ikut dilepas perannya walau sebagian plotnya kena reset).
//
// Sengaja TIDAK ada sistem login di app ini (lihat komentar endpoint
// bencana_* lain) -- jadi aksi destruktif ini digerbangi PIN statis (bukan
// autentikasi sungguhan, cuma extra friction spy tidak ketidaksengajaan
// klik) yg DIVALIDASI DI SINI JUGA (bukan cuma di UI) supaya tidak bisa
// dipanggil langsung lewat API tanpa PIN.
//
// POST { pin: string, kecamatan?: string | null, nagari?: string | null }
//   kecamatan & nagari kosong/null = SEMUA wilayah. nagari diisi tanpa
//   kecamatan diisi -> nagari diabaikan (nagari hanya valid sbg penyempit
//   DI DALAM kecamatan yg dipilih, konsisten dgn dropdown FE yg berjenjang).

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
  const kecamatan = typeof body?.kecamatan === "string" && body.kecamatan.trim() ? body.kecamatan.trim() : null;
  const nagari = kecamatan && typeof body?.nagari === "string" && body.nagari.trim() ? body.nagari.trim() : null;

  try {
    // Lingkup kosong (kecamatan null) -> SEMUA Sub SLS, tidak perlu query
    // bencana_wilayah sama sekali. Lingkup terisi -> ambil daftar idsubsls
    // yg cocok dulu (query ini sudah difilter kecamatan/nagari di server,
    // hasilnya jauh di bawah batas 1000 baris PostgREST -- beda dgn RPC
    // tanpa filter yg butuh rpcSemua, lihat lib/supabaseRpc.ts).
    let idsubslsLingkup: string[] | null = null;
    if (kecamatan) {
      let q = supabase.from("bencana_wilayah").select("idsubsls").eq("kecamatan", kecamatan);
      if (nagari) q = q.eq("nagari", nagari);
      const { data: wilRows, error: errWil } = await q;
      if (errWil) return NextResponse.json({ error: errWil.message }, { status: 500 });
      idsubslsLingkup = (wilRows ?? []).map((r) => r.idsubsls as string);
      if (idsubslsLingkup.length === 0) {
        return NextResponse.json({ ok: true, jumlah_direset: 0 });
      }
    }

    let qSelect = supabase.from("bencana_alokasi_subsls").select("ppl_id");
    if (idsubslsLingkup) qSelect = qSelect.in("idsubsls", idsubslsLingkup);
    const { data: semua, error: errSemua } = await qSelect;
    if (errSemua) return NextResponse.json({ error: errSemua.message }, { status: 500 });
    // (5 Okt 2026) ppl_id bisa NULL (Sub SLS milik tim tanpa PPL) -> disaring.
    const pplIdTerdampak = Array.from(new Set((semua ?? []).map((r) => r.ppl_id as number | null).filter((v): v is number => v != null)));
    const jumlahDireset = (semua ?? []).length;

    let qDel = supabase.from("bencana_alokasi_subsls").delete();
    qDel = idsubslsLingkup ? qDel.in("idsubsls", idsubslsLingkup) : qDel.neq("idsubsls", "");
    const { error: errDel } = await qDel;
    if (errDel) return NextResponse.json({ error: errDel.message }, { status: 500 });

    // Dicek di SELURUH tabel (tanpa filter lingkup) -- PPL yg masih punya
    // alokasi di Kecamatan/Nagari LAIN (di luar lingkup reset ini) tidak
    // boleh ikut dilepas perannya.
    for (const id of pplIdTerdampak) {
      const { count } = await supabase
        .from("bencana_alokasi_subsls")
        .select("id", { count: "exact", head: true })
        .eq("ppl_id", id);
      if (!count) {
        // (5 Okt 2026) anggota tim (atasan_id terisi) tetap PPL non-plot.
        await supabase.from("bencana_petugas").update({ peran: null }).eq("id", id).is("atasan_id", null);
      }
    }

    return NextResponse.json({ ok: true, jumlah_direset: jumlahDireset });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
