// app/api/bencana/menginap/[token]/route.ts
//
// Halaman publik "Konfirmasi Kesediaan Menginap" -- TANPA LOGIN, lewat token
// UNIK PER KANDIDAT PER TAWARAN (bencana_tawaran_menginap_kandidat.token,
// BUKAN bencana_petugas.token -- 1 petugas bisa saja ditawari lebih dari 1
// tawaran menginap pada waktu yg berbeda, masing2 butuh link & status
// jawaban sendiri). Dikirim admin ke beberapa kandidat sekaligus utk 1
// kebutuhan/klaster yg kekurangan petugas dekat (lihat kartu "Tawaran
// Menginap" di tab Alokasi Petugas, dan
// app/api/bencana/alokasi/tawaran-menginap/route.ts utk pembuatan tawaran).
//
// GET  -> info kandidat (nama) + info tawaran (kecamatan/nagari/keterangan)
//         + status jawaban SAAT INI (kalau sudah pernah jawab).
// POST -> submit jawaban { bersedia: boolean, alasan?: string (wajib kalau
//         tidak bersedia) }. TIDAK mengubah bencana_alokasi_subsls / plot
//         resmi apa pun -- murni mencatat kesediaan, admin yg memplot
//         manual sesudah melihat siapa yg bersedia (tab Alokasi Petugas).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { WA_GROUP_URL, punyaAkun } from "@/lib/undangan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET(_req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const { data: kandidat, error } = await supabase
    .from("bencana_tawaran_menginap_kandidat")
    .select(
      "id, petugas_id, status, catatan, dijawab_pada, bencana_petugas(nama), bencana_tawaran_menginap(kecamatan, nagari, keterangan)"
    )
    .eq("token", token)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!kandidat) return NextResponse.json({ error: "Link tidak ditemukan / tidak valid." }, { status: 404 });

  const petugas = kandidat.bencana_petugas as unknown as { nama: string } | null;
  const tawaran = kandidat.bencana_tawaran_menginap as unknown as {
    kecamatan: string;
    nagari: string | null;
    keterangan: string;
  } | null;

  // (4 Okt 2026) WA grup baru tampil setelah bersedia & membuat akun (PIN).
  const sudahAkun = await punyaAkun(supabase, kandidat.petugas_id as number);

  return NextResponse.json({
    data: {
      nama: petugas?.nama ?? "",
      punya_akun: sudahAkun,
      wa_group_url: kandidat.status === "bersedia" && sudahAkun ? WA_GROUP_URL : null,
      kecamatan: tawaran?.kecamatan ?? "",
      nagari: tawaran?.nagari ?? null,
      keterangan: tawaran?.keterangan ?? "",
      status: kandidat.status,
      catatan: kandidat.catatan,
      dijawab_pada: kandidat.dijawab_pada,
    },
  });
}

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.bersedia !== "boolean") {
    return NextResponse.json({ error: "Jawaban kesediaan wajib diisi." }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    status: body.bersedia ? "bersedia" : "tidak_bersedia",
    dijawab_pada: new Date().toISOString(),
  };
  if (body.bersedia) {
    update.catatan = null;
  } else {
    const alasan = typeof body.alasan === "string" ? body.alasan.trim() : "";
    if (!alasan) {
      return NextResponse.json({ error: "Alasan tidak bersedia wajib diisi." }, { status: 400 });
    }
    update.catatan = alasan;
  }

  const { data, error } = await supabase
    .from("bencana_tawaran_menginap_kandidat")
    .update(update)
    .eq("token", token)
    .select("id, bencana_petugas(nama)")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Link tidak ditemukan / tidak valid." }, { status: 404 });

  // (4 Okt 2026) Petugas yg SUDAH diplot lalu menolak menginap -> plotnya jadi kosong
  // karena penolakan: tandai juga di status kesediaan umum supaya peringatan
  // "menolak" di Langkah 4 (Alokasi Petugas) muncul. Kalau kemudian berubah
  // pikiran (bersedia), penanda otomatis itu dibersihkan lagi.
  const { data: kand } = await supabase
    .from("bencana_tawaran_menginap_kandidat")
    .select("petugas_id")
    .eq("token", token)
    .maybeSingle();
  const pid = kand?.petugas_id as number | undefined;
  if (pid) {
    const { count } = await supabase.from("bencana_alokasi_subsls").select("id", { count: "exact", head: true }).eq("ppl_id", pid);
    if (body.bersedia === false && count && count > 0) {
      await supabase
        .from("bencana_petugas")
        .update({
          status_kontak_pendaftaran_bencana: "menolak",
          catatan_penolakan_pendaftaran_bencana: `Tidak bersedia menginap: ${update.catatan as string}`,
          dikontak_pendaftaran_bencana_at: new Date().toISOString(),
        })
        .eq("id", pid);
    } else if (body.bersedia === true) {
      await supabase
        .from("bencana_petugas")
        .update({ status_kontak_pendaftaran_bencana: null, catatan_penolakan_pendaftaran_bencana: null })
        .eq("id", pid)
        .eq("status_kontak_pendaftaran_bencana", "menolak")
        .like("catatan_penolakan_pendaftaran_bencana", "Tidak bersedia menginap%");
    }
  }

  const petugas = data.bencana_petugas as unknown as { nama: string } | null;
  return NextResponse.json({ ok: true, nama: petugas?.nama ?? "" });
}
