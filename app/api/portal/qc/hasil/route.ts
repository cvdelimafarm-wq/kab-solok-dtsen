// app/api/portal/qc/hasil/route.ts
//
// (27 Okt 2026) Lembar Supervisi > Hasil QC Pemahaman. HANYA-BACA. Akses sama dengan Lembar Supervisi lainnya: kortim (korwil) melihat KELOMPOKNYA;
// pemegang bencana.admin (lihat) boleh memilih kelompok mana pun.
// GET [?kelompok=n] -> { kelompok, sekarang, anggota[], percobaan[], soal[], pilihan[] }

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { izinAkun, bolehPsp } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { GalatQc } from "@/lib/portal/qc";
import { daftarKelompok, daftarKelompokKortim } from "@/lib/portal/korwilMonitor";
import { pilihanKelompokUntuk, tentukanKelompok } from "@/lib/korwilMonitor";
import { dataHasilQc } from "@/lib/portal/qcHasilKorwil";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const TOLAK = "Halaman ini untuk korwil (kortim) kelompok pendataan.";

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  try {
    const [saya, { izin }] = await Promise.all([daftarKelompokKortim(db, akun.id), izinAkun(db, akun.id)]);
    const admin = bolehPsp(izin, "lihat");
    if (saya.length === 0 && !admin) return galat(TOLAK, 403);
    const semua = admin || saya.length > 1 ? await daftarKelompok(db) : [];
    const pilihan = pilihanKelompokUntuk({ admin, saya, semua });
    const kelompok = tentukanKelompok({ admin, saya, semua: semua.map((x) => x.kelompok), minta: Number(req.nextUrl.searchParams.get("kelompok")) });
    if (kelompok == null) return galat(TOLAK, 403);
    const d = await dataHasilQc(db, kelompok);
    if (!d) return galat(`Kelompok ${kelompok} tidak ditemukan.`, 404);
    return NextResponse.json({ ...d, pilihan });
  } catch (e) {
    if (e instanceof GalatQc) return galat(e.message, e.status);
    return galatServer("[api/portal/qc/hasil GET]", e);
  }
}
