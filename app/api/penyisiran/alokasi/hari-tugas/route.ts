// app/api/penyisiran/alokasi/hari-tugas/route.ts
//
// Checklist "Identifikasi Hari Tugas" -- hari DALAM SEMINGGU (Senin s.d.
// Minggu, BUKAN tanggal kalender spesifik -- dikonfirmasi user) yang
// ditandai petugas sbg BISA turun bertugas lapangan. Tiap baris (petugas,
// hari) di tabel penyisiran_alokasi_hari_tugas = 1 OH (Orang-Hari) dari
// kuota translok kabupaten (lihat KUOTA_OH_TRANSLOK di
// .../oh-monitoring/route.ts & migrasi
// supabase/migrations/20260918_hari_tugas_oh_translok.sql).
//
// GET  -- muat checklist milik petugas yg login SENDIRI (termasuk baris
//         yg SUDAH dibatalkan super user -- supaya UI bisa menampilkan
//         badge "Dibatalkan oleh ...").
// PATCH -- kirim ULANG SELURUH set hari yang ingin AKTIF (bukan cuma
//         tambahan) -- baris aktif yg tidak ikut dikirim akan DIHAPUS
//         (petugas menghilangkan centang), hari baru yg belum ada akan
//         DIBUAT. Baris yang SUDAH dibatalkan super user (dibatalkan_oleh
//         terisi) TIDAK BISA diaktifkan lagi lewat endpoint ini -- diabaikan
//         diam-diam kalau ikut terkirim di body (defense in depth; UI
//         checkbox-nya sendiri sudah dikunci/disabled utk kasus ini).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const HARI_VALID = ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"] as const;

function ambilSesi(req: NextRequest): { token: string; petugasId: number } | null {
  const token = extractBearer(req);
  if (!token || !verifySession(token, "penyisiran_petugas")) return null;
  const subjectId = getSessionSubject(token);
  const petugasId = Number(subjectId);
  if (!subjectId || !Number.isFinite(petugasId) || petugasId <= 0) return null;
  return { token, petugasId };
}

export async function GET(req: NextRequest) {
  const sesi = ambilSesi(req);
  if (!sesi) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase
    .from("penyisiran_alokasi_hari_tugas")
    .select("hari, dibatalkan_oleh, dibatalkan_at")
    .eq("petugas_id", sesi.petugasId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ hari: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const sesi = ambilSesi(req);
  if (!sesi) return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const hariRaw = Array.isArray(body?.hari) ? body.hari : null;
  if (!hariRaw) return NextResponse.json({ error: "Data hari tidak valid." }, { status: 400 });

  const hariDiminta = new Set(
    hariRaw.filter((h: unknown): h is string => typeof h === "string" && (HARI_VALID as readonly string[]).includes(h))
  );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: existing, error: existingErr } = await supabase
    .from("penyisiran_alokasi_hari_tugas")
    .select("hari, dibatalkan_oleh")
    .eq("petugas_id", sesi.petugasId);
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });

  const existingAktif = new Set((existing ?? []).filter((r) => !r.dibatalkan_oleh).map((r) => r.hari));
  const existingDibatalkan = new Set((existing ?? []).filter((r) => r.dibatalkan_oleh).map((r) => r.hari));

  // Hari yg sudah dibatalkan super user TIDAK BOLEH diaktifkan lg dari sini.
  const hariBoleh = new Set(Array.from(hariDiminta).filter((h) => !existingDibatalkan.has(h)));

  const hapus = Array.from(existingAktif).filter((h) => !hariBoleh.has(h));
  const tambah = Array.from(hariBoleh).filter((h) => !existingAktif.has(h));

  if (hapus.length > 0) {
    const { error: delErr } = await supabase
      .from("penyisiran_alokasi_hari_tugas")
      .delete()
      .eq("petugas_id", sesi.petugasId)
      .in("hari", hapus);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  }
  if (tambah.length > 0) {
    const { error: insErr } = await supabase
      .from("penyisiran_alokasi_hari_tugas")
      .insert(tambah.map((h) => ({ petugas_id: sesi.petugasId, hari: h })));
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const { data: hasil, error: hasilErr } = await supabase
    .from("penyisiran_alokasi_hari_tugas")
    .select("hari, dibatalkan_oleh, dibatalkan_at")
    .eq("petugas_id", sesi.petugasId);
  if (hasilErr) return NextResponse.json({ error: hasilErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, hari: hasil ?? [] });
}
