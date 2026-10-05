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
    .select("id, nama, no_hp, alamat_nagari, alamat_kecamatan, status_kontak_pendaftaran_bencana")
    .eq("atasan_id", pml.id)
    .order("nama");
  if (errB) return NextResponse.json({ error: errB.message }, { status: 500 });

  const ids = (bawahan ?? []).map((b) => b.id as number);

  // (5 Okt 2026) Status konfirmasi kesediaan tiap PPL: bersedia / pulang_pergi / menolak / belum.
  // Aturan SAMA dgn statusBaris() di kartu admin: kalau punya tawaran menginap, pakai jawaban tawaran terakhir;
  // selain itu pakai status_kontak_pendaftaran_bencana (diterima/menolak/null).
  const tawaranTerakhir = new Map<number, { status: string | null; pp: boolean | null }>();
  if (ids.length > 0) {
    const { data: kand } = await db
      .from("bencana_tawaran_menginap_kandidat")
      .select("petugas_id, status, bersedia_pulang_pergi, dibuat_pada")
      .in("petugas_id", ids)
      .order("dibuat_pada", { ascending: false });
    for (const k of (kand ?? []) as { petugas_id: number; status: string | null; bersedia_pulang_pergi: boolean | null }[]) {
      if (!tawaranTerakhir.has(k.petugas_id)) tawaranTerakhir.set(k.petugas_id, { status: k.status, pp: k.bersedia_pulang_pergi });
    }
  }
  function statusKonfirmasi(id: number, kontak: string | null): "bersedia" | "pulang_pergi" | "menolak" | "belum" {
    const t = tawaranTerakhir.get(id);
    if (t) {
      if (t.status === "bersedia") return "bersedia";
      if (t.status === "tidak_bersedia") return t.pp === true ? "pulang_pergi" : "menolak";
    } else {
      if (kontak === "menolak") return "menolak";
      if (kontak === "diterima") return "bersedia";
    }
    return "belum";
  }
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
    status_konfirmasi: statusKonfirmasi(b.id as number, (b.status_kontak_pendaftaran_bencana as string | null) ?? null),
    wilayah: (wilayahPerPpl.get(b.id as number) ?? [])
      .map((x) => info.get(x.idsubsls))
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.kecamatan.localeCompare(b.kecamatan, "id") || a.nagari.localeCompare(b.nagari, "id") || a.sls.localeCompare(b.sls, "id") || a.sub_sls.localeCompare(b.sub_sls)),
  }));

  // (5 Okt 2026) Pemberitahuan pembatalan plotting PPL di tim PML ini (mis. PPL NTP) -- permintaan user:
  // PML diberi tahu lewat undangannya, dan berhenti tampil setelah PML menekan "Oke" (pml_dibaca_at).
  // Sub SLS milik PPL yg dibatalkan sudah dialihkan ke anggota tim; nama pemegang barunya ikut ditampilkan.
  const { data: batalRows } = await db
    .from("bencana_pembatalan_plot")
    .select("petugas_id, alasan, data_lama")
    .eq("pml_id", pml.id)
    .is("pml_dibaca_at", null);
  const pemberitahuan: { nama: string; alasan: string; dialihkan_ke: string[] }[] = [];
  for (const b of (batalRows ?? []) as { petugas_id: number; alasan: string; data_lama: { alokasi?: { id: number }[] } | null }[]) {
    const { data: orang } = await db.from("bencana_petugas").select("nama").eq("id", b.petugas_id).maybeSingle();
    const idAlokasi = (b.data_lama?.alokasi ?? []).map((a) => a.id).filter((x) => typeof x === "number");
    let dialihkanKe: string[] = [];
    if (idAlokasi.length > 0) {
      const { data: kini } = await db.from("bencana_alokasi_subsls").select("ppl_id").in("id", idAlokasi);
      const idBaru = Array.from(new Set((kini ?? []).map((k) => k.ppl_id as number)));
      if (idBaru.length > 0) {
        const { data: nm } = await db.from("bencana_petugas").select("nama").in("id", idBaru);
        dialihkanKe = (nm ?? []).map((n) => n.nama as string).sort((x, y) => x.localeCompare(y, "id"));
      }
    }
    pemberitahuan.push({ nama: (orang?.nama as string) ?? "-", alasan: b.alasan, dialihkan_ke: dialihkanKe });
  }

  // (5 Okt 2026) Notifikasi perubahan alokasi tim (trigger DB bencana_notifikasi), hilang setelah "Oke".
  const { data: notifRows } = await db
    .from("bencana_notifikasi")
    .select("id, pesan, dibuat_at")
    .eq("petugas_id", pml.id)
    .eq("untuk", "pml")
    .is("dibaca_at", null)
    .order("dibuat_at", { ascending: true });

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
      pemberitahuan,
      notifikasi: (notifRows ?? []) as { id: number; pesan: string; dibuat_at: string }[],
    },
  });
}

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const body = await req.json().catch(() => null);

  // (5 Okt 2026) PML menekan "Oke" pada pemberitahuan pembatalan plotting -> tidak ditampilkan lagi.
  if (body?.aksi === "baca_pemberitahuan") {
    const { data: p } = await db.from("bencana_petugas").select("id, peran").eq("token", token).maybeSingle();
    if (!p || p.peran !== "pml") return NextResponse.json({ error: "Link tidak ditemukan / tidak valid." }, { status: 404 });
    const { error: e } = await db
      .from("bencana_pembatalan_plot")
      .update({ pml_dibaca_at: new Date().toISOString() })
      .eq("pml_id", p.id)
      .is("pml_dibaca_at", null);
    if (e) return NextResponse.json({ error: e.message }, { status: 500 });
    const { error: e2 } = await db
      .from("bencana_notifikasi")
      .update({ dibaca_at: new Date().toISOString() })
      .eq("petugas_id", p.id)
      .eq("untuk", "pml")
      .is("dibaca_at", null);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

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
