// app/api/bencana/pml/[token]/route.ts
//
// (4 Okt 2026) Halaman konfirmasi PML -- TANPA LOGIN, lewat token bencana_petugas
// (sama dgn /bencana/konfirmasi/[token]). PML tidak memegang Sub SLS sendiri;
// ia membawahi sejumlah PPL (bencana_petugas.atasan_id). Halaman menampilkan
// daftar PPL binaan + wilayah kerja tiap PPL, lalu PML menjawab bersedia/tidak,
// memilih tanggal pelatihan, membuat PIN, dan bergabung ke grup WA.
//
// Memakai ulang kolom kesediaan yg sama dgn PPL:
//   pendaftaran_bencana_konfirmasi, status_kontak_pendaftaran_bencana,
//   catatan_penolakan_pendaftaran_bencana, dikontak_pendaftaran_bencana_at,
//   jadwal_pelatihan_dipilih ('7 Oktober 2026, 8 Oktober 2026').
//
// GET  -> { nama, status, jadwal, punya_akun, wa_group_url, ppl: [...] }
// POST -> { bersedia: boolean, jadwal_pelatihan?: string[], alasan?: string }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { WA_GROUP_URL, punyaAkun } from "@/lib/undangan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JADWAL_VALID = ["7 Oktober 2026", "8 Oktober 2026"] as const;

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET(_req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const { data: pml, error } = await db
    .from("bencana_petugas")
    .select(
      "id, nama, peran, aktif, status_kontak_pendaftaran_bencana, catatan_penolakan_pendaftaran_bencana, jadwal_pelatihan_dipilih, alamat_nagari, alamat_kecamatan"
    )
    .eq("token", token)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!pml || pml.peran !== "pml") return NextResponse.json({ error: "Link tidak ditemukan / tidak valid." }, { status: 404 });

  const { data: bawahan, error: errB } = await db
    .from("bencana_petugas")
    .select("id, nama, no_hp, alamat_nagari, alamat_kecamatan")
    .eq("atasan_id", pml.id)
    .order("nama");
  if (errB) return NextResponse.json({ error: errB.message }, { status: 500 });

  const ids = (bawahan ?? []).map((b) => b.id as number);
  const wilayahPerPpl = new Map<number, { idsubsls: string }[]>();
  const info = new Map<string, { kecamatan: string; nagari: string; sls: string; sub_sls: string }>();
  if (ids.length > 0) {
    const { data: alok } = await db.from("bencana_alokasi_subsls").select("idsubsls, ppl_id").in("ppl_id", ids);
    const idsubsls = Array.from(new Set((alok ?? []).map((a) => a.idsubsls as string)));
    for (let i = 0; i < idsubsls.length; i += 200) {
      const { data: w } = await db.from("bencana_wilayah").select("idsubsls, kecamatan, nagari, sls, sub_sls").in("idsubsls", idsubsls.slice(i, i + 200));
      for (const r of (w ?? []) as { idsubsls: string; kecamatan: string; nagari: string; sls: string; sub_sls: string }[]) info.set(r.idsubsls, r);
    }
    for (const a of (alok ?? []) as { idsubsls: string; ppl_id: number }[]) {
      const arr = wilayahPerPpl.get(a.ppl_id) ?? [];
      arr.push({ idsubsls: a.idsubsls });
      wilayahPerPpl.set(a.ppl_id, arr);
    }
  }

  const ppl = (bawahan ?? []).map((b) => ({
    nama: b.nama as string,
    no_hp: (b.no_hp as string | null) ?? null,
    domisili: [b.alamat_nagari, b.alamat_kecamatan].filter(Boolean).join(", ") || null,
    wilayah: (wilayahPerPpl.get(b.id as number) ?? [])
      .map((x) => info.get(x.idsubsls))
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.kecamatan.localeCompare(b.kecamatan, "id") || a.nagari.localeCompare(b.nagari, "id") || a.sls.localeCompare(b.sls, "id") || a.sub_sls.localeCompare(b.sub_sls)),
  }));

  const sudahAkun = await punyaAkun(db, pml.id as number);
  return NextResponse.json({
    data: {
      nama: pml.nama,
      status_kontak: pml.status_kontak_pendaftaran_bencana,
      catatan_penolakan: pml.catatan_penolakan_pendaftaran_bencana,
      jadwal_pelatihan_dipilih: pml.jadwal_pelatihan_dipilih,
      punya_akun: sudahAkun,
      wa_group_url: pml.status_kontak_pendaftaran_bencana === "diterima" && sudahAkun ? WA_GROUP_URL : null,
      ppl,
    },
  });
}

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const body = await req.json().catch(() => null);
  if (typeof body?.bersedia !== "boolean") return NextResponse.json({ error: "Jawaban kesediaan wajib diisi." }, { status: 400 });

  const { data: pml } = await db.from("bencana_petugas").select("id, peran").eq("token", token).maybeSingle();
  if (!pml || pml.peran !== "pml") return NextResponse.json({ error: "Link tidak ditemukan / tidak valid." }, { status: 404 });

  const update: Record<string, unknown> = {
    pendaftaran_bencana_konfirmasi: body.bersedia,
    status_kontak_pendaftaran_bencana: body.bersedia ? "diterima" : "menolak",
    dikontak_pendaftaran_bencana_at: new Date().toISOString(),
  };
  if (body.bersedia) {
    const raw: unknown[] = Array.isArray(body.jadwal_pelatihan) ? body.jadwal_pelatihan : [];
    const jadwal = JADWAL_VALID.filter((j) => raw.includes(j));
    if (jadwal.length === 0 || raw.some((j) => !(JADWAL_VALID as readonly string[]).includes(j as string))) {
      return NextResponse.json({ error: "Pilih minimal 1 tanggal pelatihan (7 dan/atau 8 Oktober 2026)." }, { status: 400 });
    }
    update.jadwal_pelatihan_dipilih = jadwal.join(", ");
    update.catatan_penolakan_pendaftaran_bencana = null;
  } else {
    const alasan = typeof body.alasan === "string" ? body.alasan.trim() : "";
    if (!alasan) return NextResponse.json({ error: "Alasan tidak bersedia wajib diisi." }, { status: 400 });
    update.catatan_penolakan_pendaftaran_bencana = alasan;
    update.jadwal_pelatihan_dipilih = null;
  }

  const { error } = await db.from("bencana_petugas").update(update).eq("id", pml.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
