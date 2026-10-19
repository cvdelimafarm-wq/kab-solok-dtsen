// app/api/portal/korwil/monitoring/route.ts
//
// (19 Okt 2026) Monitoring Korwil di HP. HANYA-BACA.
// Akses: kortim (korwil) pada bencana_kelompok_tim melihat KELOMPOKNYA sendiri; pemegang izin bencana.admin (lihat) boleh memilih kelompok mana pun.
// GET (Authorization: Bearer <sesi>)[?kelompok=n][&segar=1] -> DataKorwil

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import { daftarKelompok, kelompokKortim, monitoringKorwil } from "@/lib/portal/korwilMonitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    const [saya, { izin }] = await Promise.all([kelompokKortim(db, akun.id), izinAkun(db, akun.id)]);
    const admin = boleh(izin, "bencana.admin", "lihat");
    if (saya == null && !admin) return NextResponse.json({ error: "Halaman ini untuk korwil (kortim) kelompok pendataan." }, { status: 403 });

    const minta = Number(req.nextUrl.searchParams.get("kelompok"));
    const pilihan = admin ? await daftarKelompok(db) : [];
    let kelompok: number;
    if (admin && Number.isInteger(minta) && minta > 0) kelompok = minta;
    else if (saya != null) kelompok = saya;
    else kelompok = pilihan[0]?.kelompok ?? 1;

    const d = await monitoringKorwil(db, kelompok, req.nextUrl.searchParams.get("segar") === "1");
    if (!d) return NextResponse.json({ error: `Kelompok ${kelompok} tidak ditemukan.` }, { status: 404 });
    return NextResponse.json({ ...d, pilihan });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memuat monitoring korwil." }, { status: 500 });
  }
}
