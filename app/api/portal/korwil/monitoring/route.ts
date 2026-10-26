// app/api/portal/korwil/monitoring/route.ts
//
// (19 Okt 2026) Monitoring Korwil di HP. HANYA-BACA.
// Akses: kortim (korwil) pada bencana_kelompok_tim melihat KELOMPOKNYA sendiri (bila memegang >1 kelompok: boleh memilih di antaranya, bawaan = urutan terkecil);
// pemegang izin bencana.admin (lihat) boleh memilih kelompok mana pun.
// GET (Authorization: Bearer <sesi>)[?kelompok=n][&segar=1] -> DataKorwil

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import { daftarKelompok, daftarKelompokKortim, monitoringKorwil } from "@/lib/portal/korwilMonitor";
import { pilihanKelompokUntuk, tentukanKelompok } from "@/lib/korwilMonitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    const [saya, { izin }] = await Promise.all([daftarKelompokKortim(db, akun.id), izinAkun(db, akun.id)]);
    const admin = boleh(izin, "bencana.admin", "lihat");
    if (saya.length === 0 && !admin) return NextResponse.json({ error: "Halaman ini untuk korwil (kortim) kelompok pendataan." }, { status: 403 });

    const semua = admin || saya.length > 1 ? await daftarKelompok(db) : [];
    const pilihan = pilihanKelompokUntuk({ admin, saya, semua });
    const kelompok = tentukanKelompok({ admin, saya, semua: semua.map((x) => x.kelompok), minta: Number(req.nextUrl.searchParams.get("kelompok")) });
    if (kelompok == null) return NextResponse.json({ error: "Halaman ini untuk korwil (kortim) kelompok pendataan." }, { status: 403 });

    const d = await monitoringKorwil(db, kelompok, req.nextUrl.searchParams.get("segar") === "1");
    if (!d) return NextResponse.json({ error: `Kelompok ${kelompok} tidak ditemukan.` }, { status: 404 });
    return NextResponse.json({ ...d, pilihan });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Gagal memuat monitoring korwil." }, { status: 500 });
  }
}
