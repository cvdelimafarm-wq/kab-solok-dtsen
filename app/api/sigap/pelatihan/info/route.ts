// app/api/sigap/pelatihan/info/route.ts
//
// (1 Nov 2026) Info ringkas pelatihan yang sedang dilayani untuk akun ini: nama kegiatan dan kegiatan induknya (untuk judul layar peserta dan tombol kembali).
// Pelatihan ditentukan sama seperti rute peserta lain (?kegiatan=ID, atau pilihan otomatis lib/sigapPelatihanPilih.ts). Hanya baca; tahan galat (induk tidak ditemukan = null).
// GET -> { kegiatan_id, nama, kode, induk_kode }

import { NextRequest, NextResponse } from "next/server";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
    if (!kegiatanId) return NextResponse.json({ kegiatan_id: null, nama: "", kode: "", induk_kode: null });
    const { data: k } = await db.from("sigap_kegiatan").select("nama, kode").eq("id", kegiatanId).maybeSingle();
    let indukKode: string | null = null;
    try {
      const { data: induk } = await db.from("sigap_induk").select("kode").eq("aktif", true).contains("kegiatan_ids", [kegiatanId]).order("urutan").limit(1);
      indukKode = ((induk ?? []) as { kode: string }[])[0]?.kode ?? null;
    } catch {
      indukKode = null;
    }
    return NextResponse.json({ kegiatan_id: kegiatanId, nama: (k?.nama as string | undefined) ?? "", kode: (k?.kode as string | undefined) ?? "", induk_kode: indukKode });
  } catch {
    return NextResponse.json({ kegiatan_id: null, nama: "", kode: "", induk_kode: null });
  }
}
