// app/api/bencana/alokasi/kontak-mitra/route.ts
//
// "Kartu Mitra Perlu Dihubungi" di tab Alokasi Petugas -- daftar MITRA aktif
// yang (a) BELUM konfirmasi ikut pendataan bencana
// (pendaftaran_bencana_konfirmasi = false, SAMA dgn kolom "Mengajukan Diri" di
// tab Kegiatan Petugas) DAN (b) SUDAH di-plot ke minimal 1 Sub SLS kegiatan
// bencana (ada baris di bencana_alokasi_subsls dgn ppl_id = id-nya). Kalau
// mitra belum di-plot sama sekali, belum perlu dihubungi -- baru relevan
// begitu dia di-plot tapi belum tercatat bersedia secara resmi.
//
// GET  -> daftar mitra tsb (nama, no_hp, kecamatan, status kontak terakhir).
// POST { petugas_id, status: "diterima" | "menolak" | null, catatan? }
//      -> catat hasil kontak SATU mitra:
//         - "diterima": mitra bersedia -> pendaftaran_bencana_konfirmasi
//           otomatis di-set true (baris ini lalu hilang dari daftar).
//         - "menolak": mitra menolak -> WAJIB isi `catatan` (alasan), dicatat
//           di catatan_penolakan_pendaftaran_bencana (baris tetap tampil,
//           supaya admin tidak perlu menghubungi ulang tanpa sengaja).
//         - null: batalkan/reset status kontak -- karena baris ini HANYA bisa
//           berstatus diterima lewat endpoint ini (nama yg sudah confirm
//           dari self-report tidak pernah muncul di daftar), reset juga
//           mengembalikan pendaftaran_bencana_konfirmasi ke false.
//
// Publik, tanpa login -- konsisten dgn pola endpoint bencana_* lainnya.

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

export async function GET() {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("bencana_petugas")
    .select(
      "id, nama, no_hp, alamat_kecamatan, status_kontak_pendaftaran_bencana, catatan_penolakan_pendaftaran_bencana, dikontak_pendaftaran_bencana_at"
    )
    .eq("status_kepegawaian", "mitra")
    .eq("aktif", true)
    .eq("pendaftaran_bencana_konfirmasi", false)
    .order("nama");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Saring lagi: hanya yang SUDAH di-plot ke minimal 1 Sub SLS (ppl_id di
  // bencana_alokasi_subsls) -- lihat komentar di atas.
  const kandidat = data ?? [];
  if (kandidat.length === 0) return NextResponse.json({ data: [] });

  const idList = kandidat.map((p) => p.id);
  const { data: plotRows, error: errPlot } = await supabase
    .from("bencana_alokasi_subsls")
    .select("ppl_id")
    .in("ppl_id", idList);
  if (errPlot) return NextResponse.json({ error: errPlot.message }, { status: 500 });

  const sudahDiplot = new Set((plotRows ?? []).map((r) => r.ppl_id as number));
  const hasil = kandidat.filter((p) => sudahDiplot.has(p.id));

  return NextResponse.json({ data: hasil });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);

  try {
    const petugasId = Number(body?.petugas_id);
    if (!Number.isFinite(petugasId) || petugasId <= 0) {
      return NextResponse.json({ error: "petugas_id wajib diisi." }, { status: 400 });
    }

    const statusRaw = body?.status;
    if (statusRaw !== null && statusRaw !== "diterima" && statusRaw !== "menolak") {
      return NextResponse.json({ error: "status harus 'diterima', 'menolak', atau null." }, { status: 400 });
    }

    let catatan: string | null = null;
    if (statusRaw === "menolak") {
      const c = typeof body?.catatan === "string" ? body.catatan.trim() : "";
      if (!c) {
        return NextResponse.json(
          { error: "Catatan alasan penolakan wajib diisi kalau statusnya menolak." },
          { status: 400 }
        );
      }
      catatan = c;
    }

    const update: Record<string, unknown> = {
      status_kontak_pendaftaran_bencana: statusRaw,
      catatan_penolakan_pendaftaran_bencana: catatan,
      dikontak_pendaftaran_bencana_at: statusRaw === null ? null : new Date().toISOString(),
    };
    if (statusRaw === "diterima") update.pendaftaran_bencana_konfirmasi = true;
    if (statusRaw === null) update.pendaftaran_bencana_konfirmasi = false;

    const { error } = await supabase.from("bencana_petugas").update(update).eq("id", petugasId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
