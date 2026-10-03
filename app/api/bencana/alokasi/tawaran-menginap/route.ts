// app/api/bencana/alokasi/tawaran-menginap/route.ts
//
// "Tawaran Menginap" -- admin tandai 1 kebutuhan/klaster (kecamatan/nagari +
// keterangan, mis. "Kekurangan petugas dekat di Jorong X -- tawarkan skema
// menginap") lalu pilih BEBERAPA kandidat sekaligus (bukan 1 wilayah kerja =
// 1 petugas spt /bencana/konfirmasi/[token]) -- tiap kandidat dapat link
// publik sendiri (/bencana/menginap/[token]) utk menjawab bersedia/tidak
// menginap di kecamatan itu, INDEPENDEN dari kandidat lain. Admin lihat
// semua status jawaban di satu tempat (termasuk no HP, utk dihubungi manual
// kalau mau menawarkan "barengan teman").
//
// SENGAJA 2 tabel baru (bencana_tawaran_menginap +
// bencana_tawaran_menginap_kandidat), BUKAN memakai ulang kolom
// bencana_petugas spt /bencana/konfirmasi -- krn di sini 1 kebutuhan bisa
// ditawarkan ke banyak orang & tiap kandidat butuh token+status SENDIRI,
// beda dgn pola "1 petugas = 1 status kesediaan resmi" yg sudah ada.
//
// GET  -> daftar semua tawaran (terbaru dulu), masing2 lengkap daftar
//         kandidat + status jawaban + no_hp (utk dihubungi manual).
// POST { kecamatan, nagari?, keterangan, petugas_ids: number[] }
//      -> buat 1 tawaran baru + kandidat sekaligus (token di-generate
//         otomatis per kandidat oleh default kolom di database).
//
// Publik ADMIN-ONLY secara konvensi (tanpa login, spt endpoint lain di app
// ini) -- link PUBLIK yg dibagikan ke kandidat ada di
// app/api/bencana/menginap/[token]/route.ts, BUKAN di sini.

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

  const { data: tawaranRows, error: errTawaran } = await supabase
    .from("bencana_tawaran_menginap")
    .select("id, kecamatan, nagari, keterangan, dibuat_pada")
    .order("dibuat_pada", { ascending: false });
  if (errTawaran) return NextResponse.json({ error: errTawaran.message }, { status: 500 });

  const tawaranIds = (tawaranRows ?? []).map((t) => t.id);
  let kandidatRows: Record<string, unknown>[] = [];
  if (tawaranIds.length > 0) {
    const { data, error: errKandidat } = await supabase
      .from("bencana_tawaran_menginap_kandidat")
      .select(
        "id, tawaran_id, petugas_id, token, status, catatan, dijawab_pada, dibuat_pada, bencana_petugas(nama, no_hp, nilai_kinerja, alamat_kecamatan, alamat_nagari)"
      )
      .in("tawaran_id", tawaranIds)
      .order("dibuat_pada", { ascending: true });
    if (errKandidat) return NextResponse.json({ error: errKandidat.message }, { status: 500 });
    kandidatRows = data ?? [];
  }

  const kandidatByTawaran = new Map<number, unknown[]>();
  for (const k of kandidatRows) {
    const tid = k.tawaran_id as number;
    const arr = kandidatByTawaran.get(tid) ?? [];
    const petugas = k.bencana_petugas as { nama: string; no_hp: string | null; nilai_kinerja: number | null; alamat_kecamatan: string | null; alamat_nagari: string | null } | null;
    arr.push({
      id: k.id,
      petugas_id: k.petugas_id,
      nama: petugas?.nama ?? "(petugas tidak ditemukan)",
      no_hp: petugas?.no_hp ?? null,
      nilai_kinerja: petugas?.nilai_kinerja ?? null,
      alamat_kecamatan: petugas?.alamat_kecamatan ?? null,
      alamat_nagari: petugas?.alamat_nagari ?? null,
      token: k.token,
      status: k.status,
      catatan: k.catatan,
      dijawab_pada: k.dijawab_pada,
    });
    kandidatByTawaran.set(tid, arr);
  }

  const data = (tawaranRows ?? []).map((t) => ({
    id: t.id,
    kecamatan: t.kecamatan,
    nagari: t.nagari,
    keterangan: t.keterangan,
    dibuat_pada: t.dibuat_pada,
    kandidat: kandidatByTawaran.get(t.id) ?? [],
  }));

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const supabase = supabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const kecamatan = typeof body?.kecamatan === "string" ? body.kecamatan.trim() : "";
  const nagari = typeof body?.nagari === "string" && body.nagari.trim() ? body.nagari.trim() : null;
  const keterangan = typeof body?.keterangan === "string" ? body.keterangan.trim() : "";
  const petugasIds: number[] = Array.isArray(body?.petugas_ids)
    ? body.petugas_ids.filter((v: unknown): v is number => typeof v === "number" && Number.isFinite(v))
    : [];

  if (!kecamatan) return NextResponse.json({ error: "Kecamatan wajib diisi." }, { status: 400 });
  if (!keterangan) return NextResponse.json({ error: "Keterangan kebutuhan wajib diisi." }, { status: 400 });
  if (petugasIds.length === 0) {
    return NextResponse.json({ error: "Pilih minimal 1 kandidat utk ditawari." }, { status: 400 });
  }

  const { data: tawaran, error: errInsertTawaran } = await supabase
    .from("bencana_tawaran_menginap")
    .insert({ kecamatan, nagari, keterangan })
    .select("id")
    .single();
  if (errInsertTawaran) return NextResponse.json({ error: errInsertTawaran.message }, { status: 500 });

  const kandidatPayload = Array.from(new Set(petugasIds)).map((petugas_id: number) => ({
    tawaran_id: tawaran.id,
    petugas_id,
  }));
  const { error: errInsertKandidat } = await supabase.from("bencana_tawaran_menginap_kandidat").insert(kandidatPayload);
  if (errInsertKandidat) {
    // Rollback manual -- tawaran tanpa kandidat tidak berguna.
    await supabase.from("bencana_tawaran_menginap").delete().eq("id", tawaran.id);
    return NextResponse.json({ error: errInsertKandidat.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tawaran_id: tawaran.id });
}
