// app/api/bencana/undangan/akun/route.ts
//
// (4 Okt 2026) Pembuatan akun (nama + PIN 4 digit) SESUDAH petugas menyatakan
// bersedia -- dipanggil dari halaman konfirmasi biasa & tawaran menginap
// (komponen BuatAkunPanel). Identitas petugas = token halaman itu (token
// bencana_petugas utk konfirmasi biasa, token kandidat utk tawaran menginap),
// jadi tidak perlu login. Akun hanya bisa dibuat kalau SUDAH bersedia & BELUM
// punya akun (reset PIN lewat admin).
//
// POST { jenis: "biasa" | "menginap" | "pml", token, pin }   (pml = token bencana_petugas, sama dgn biasa)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hashPin, pinValid } from "@/lib/undangan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });

  const body = await req.json().catch(() => null);
  const jenis = body?.jenis === "menginap" ? "menginap" : body?.jenis === "biasa" || body?.jenis === "pml" ? "biasa" : null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
  if (!jenis || !token) return NextResponse.json({ error: "Permintaan tidak lengkap." }, { status: 400 });
  if (!pinValid(pin)) return NextResponse.json({ error: "PIN harus 4 digit angka." }, { status: 400 });

  try {
    let petugasId: number | null = null;
    let bersedia = false;
    if (jenis === "biasa") {
      const { data } = await db
        .from("bencana_petugas")
        .select("id, pendaftaran_bencana_konfirmasi")
        .eq("token", token)
        .maybeSingle();
      petugasId = (data?.id as number | undefined) ?? null;
      bersedia = data?.pendaftaran_bencana_konfirmasi === true;
    } else {
      const { data } = await db
        .from("bencana_tawaran_menginap_kandidat")
        .select("petugas_id, status")
        .eq("token", token)
        .maybeSingle();
      petugasId = (data?.petugas_id as number | undefined) ?? null;
      bersedia = data?.status === "bersedia";
    }
    if (!petugasId) return NextResponse.json({ error: "Link tidak ditemukan / tidak valid." }, { status: 404 });
    if (!bersedia) return NextResponse.json({ error: "Akun hanya bisa dibuat setelah menyatakan bersedia." }, { status: 400 });

    const { data: ada } = await db.from("bencana_undangan").select("pin_hash").eq("petugas_id", petugasId).maybeSingle();
    if (ada?.pin_hash) {
      return NextResponse.json({ error: "Akun sudah dibuat. Jika lupa PIN, hubungi admin." }, { status: 409 });
    }

    const { hash, salt } = hashPin(pin);
    const { error } = await db
      .from("bencana_undangan")
      .upsert({ petugas_id: petugasId, pin_hash: hash, pin_salt: salt, akun_dibuat_at: new Date().toISOString() }, { onConflict: "petugas_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
