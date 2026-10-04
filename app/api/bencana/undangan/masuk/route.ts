// app/api/bencana/undangan/masuk/route.ts
//
// (4 Okt 2026) "Masuk" petugas yg SUDAH punya akun (nama + PIN 4 digit, dibuat
// sesudah menyatakan bersedia -- lihat ../akun/route.ts). Dipakai di halaman
// /bencana/undangan tab "Sudah punya akun". Hasilnya = halaman tujuan yg SAMA
// dgn verifikasi: tawaran menginap utk yg ditawari menginap, konfirmasi biasa
// utk yg diplot dekat.
//
// POST { nama, pin }
//   -> { ok:true, nama, tipe, path }
//   -> { ok:false, error, sisa_percobaan } / 429 kalau terkunci

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { MAKS_GAGAL, cariPetugasByNama, catatGagal, cekKunci, cekPin, normNama, pinValid, resetGagal, tentukanTujuan } from "@/lib/undangan";

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
  const namaInput = typeof body?.nama === "string" ? body.nama.trim() : "";
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
  if (!namaInput) return NextResponse.json({ error: "Nama wajib diisi." }, { status: 400 });
  if (!pinValid(pin)) return NextResponse.json({ error: "PIN harus 4 digit angka." }, { status: 400 });

  try {
    const kunci = `pin:${normNama(namaInput)}`;
    const kondisi = await cekKunci(db, kunci);
    if (kondisi.terkunci) {
      return NextResponse.json(
        { error: "Terlalu banyak percobaan yang salah. Coba lagi nanti atau hubungi admin.", terkunci_sampai: kondisi.sampai },
        { status: 429 }
      );
    }

    const cocok = await cariPetugasByNama(db, namaInput);
    let berhasil = false;
    if (cocok.length === 1) {
      const { data: akun } = await db.from("bencana_undangan").select("pin_hash, pin_salt").eq("petugas_id", cocok[0].id).maybeSingle();
      berhasil = !!akun?.pin_hash && !!akun?.pin_salt && cekPin(pin, akun.pin_hash as string, akun.pin_salt as string);
    }
    if (!berhasil) {
      const g = await catatGagal(db, kunci);
      return NextResponse.json(
        { ok: false, error: "Nama atau PIN salah, atau akun belum dibuat.", sisa_percobaan: g.sisa, maks_percobaan: MAKS_GAGAL, terkunci_sampai: g.sampai },
        { status: g.terkunci ? 429 : 200 }
      );
    }

    await resetGagal(db, kunci);
    const petugas = cocok[0];
    await db.from("bencana_undangan").update({ terakhir_masuk_at: new Date().toISOString() }).eq("petugas_id", petugas.id);
    const tujuan = await tentukanTujuan(db, petugas);
    return NextResponse.json({ ok: true, nama: petugas.nama, tipe: tujuan.tipe, path: tujuan.path });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan tak terduga";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
