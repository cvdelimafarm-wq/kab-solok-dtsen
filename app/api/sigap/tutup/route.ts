// app/api/sigap/tutup/route.ts
//
// (10 Okt 2026) Penutupan sementara SIGAP -- permintaan user: "jika diakses petugas selain M. Iqbal Hadi (dengan masuk sebagai PPL)
// layarnya diblok dengan modal yang tidak dapat ditutup: 'Sedang menyiapkan lembar kerja identifikasi SLS', halaman SIGAP ditutup
// sampai pukul 13.00".
// GET (Authorization: Bearer <sesi> opsional) -> { tutup, sampai, judul, pesan, sekarang }
// Dikecualikan: akun super (sigap_akun.super = M. Iqbal Hadi), termasuk saat akun super "masuk sebagai" PPL/PML (aktor = akun super).
// Waktu memakai jam server. Setelah TUTUP_SAMPAI lewat, semua akun otomatis terbuka lagi tanpa deploy ulang.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sesiLengkapDariHeader } from "@/lib/sigapAkses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TUTUP_SAMPAI = "2026-10-10T13:00:00+07:00";
const JUDUL = "Sedang menyiapkan lembar kerja identifikasi SLS";
const PESAN = "Halaman SIGAP ditutup sementara sampai pukul 13.00 WIB. Silakan buka kembali setelah itu.";

export async function GET(req: NextRequest) {
  const sekarang = Date.now();
  const sampai = Date.parse(TUTUP_SAMPAI);
  const dasar = { sampai: TUTUP_SAMPAI, judul: JUDUL, pesan: PESAN, sekarang: new Date(sekarang).toISOString() };
  if (sekarang >= sampai) return NextResponse.json({ ...dasar, tutup: false }, { headers: { "Cache-Control": "no-store" } });

  const sesi = sesiLengkapDariHeader(req.headers);
  let kecuali = false;
  if (sesi) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (key) {
      const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
      const ids = [sesi.akunId, sesi.aktorId].filter((x): x is number => typeof x === "number");
      const { data } = await db.from("sigap_akun").select("id").in("id", ids).eq("super", true);
      kecuali = (data ?? []).length > 0;
    }
  }
  return NextResponse.json({ ...dasar, tutup: !kecuali, masuk: !!sesi }, { headers: { "Cache-Control": "no-store" } });
}
