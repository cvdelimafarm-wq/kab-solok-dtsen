// app/api/sigap/tutup/route.ts
//
// (10 Okt 2026) Penutupan sementara SIGAP -- permintaan user: "jika diakses petugas selain M. Iqbal Hadi (dengan masuk sebagai PPL)
// layarnya diblok dengan modal yang tidak dapat ditutup: 'Sedang menyiapkan lembar kerja identifikasi SLS', halaman SIGAP ditutup
// sampai pukul 13.00".
// GET (Authorization: Bearer <sesi> opsional) -> { tutup, sampai, judul, pesan, sekarang }
// Dikecualikan: akun super (sigap_akun.super = M. Iqbal Hadi) saat masuk dengan akunnya sendiri.
// (10 Okt 2026) Saat akun super "masuk sebagai" PPL/PML, modal TETAP tampil -- permintaan user: "saat mencoba login sebagai Ayu
// Sepriani maka tampil persis seperti Ayu Sepriani saat ini". Spanduk "Melihat sebagai" (z-index lebih tinggi) tetap di atas modal,
// jadi tombol "Kembali ke akun saya" masih bisa ditekan.
// (10 Okt 2026) PENGECUALIAN khusus -- permintaan user: bila akun super "masuk sebagai" Irawita (akun 302), modal TIDAK tampil
// supaya bisa diakses. Irawita yang login sendiri, dan "masuk sebagai" akun lain, tetap diblokir.
// Waktu memakai jam server. Setelah TUTUP_SAMPAI lewat, semua akun otomatis terbuka lagi tanpa deploy ulang.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sesiLengkapDariHeader } from "@/lib/sigapAkses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TUTUP_SAMPAI = "2026-10-10T13:00:00+07:00";
/** Akun yang TIDAK diblokir hanya saat dibuka akun super lewat "masuk sebagai" (302 = Irawita). */
const AKUN_BEBAS_SAAT_SEBAGAI = [302];
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
      const superIds = new Set((data ?? []).map((x) => Number(x.id)));
      const akunSuper = superIds.has(sesi.akunId); // akun super masuk dengan akunnya sendiri
      const superSebagaiBebas = sesi.aktorId != null && superIds.has(sesi.aktorId) && AKUN_BEBAS_SAAT_SEBAGAI.includes(sesi.akunId);
      kecuali = akunSuper || superSebagaiBebas;
    }
  }
  return NextResponse.json({ ...dasar, tutup: !kecuali, masuk: !!sesi }, { headers: { "Cache-Control": "no-store" } });
}
