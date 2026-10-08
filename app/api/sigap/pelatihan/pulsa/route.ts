// app/api/sigap/pelatihan/pulsa/route.ts
//
// (8 Okt 2026) Pop-up nomor HP pengisian pulsa untuk peserta pelatihan (Authorization: Bearer <sesi>).
// GET  -> { peserta, asli, pulsa, diubah, dikonfirmasi_at }   (asli/pulsa dalam bentuk baku 08xx; null bila tidak ada)
// POST { aksi: "konfirmasi" }                -> pakai nomor HP asli sebagai nomor pulsa
// POST { aksi: "simpan", nomor: "08xx..." }  -> pakai nomor lain (khusus pulsa; nomor HP asli di data sumber tidak berubah)

import { NextRequest, NextResponse } from "next/server";
import { catatAudit } from "@/lib/sigapAkses";
import { normalisasiHp, nomorAsli, simpanPulsa, statusPulsa } from "@/lib/sigapPulsa";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan, pesertaPelatihan } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    if (!(await pesertaPelatihan(db, akun.id, kegiatanId))) return NextResponse.json({ peserta: false });
    return NextResponse.json({ peserta: true, ...(await statusPulsa(db, kegiatanId, akun.id)) });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    if (!(await pesertaPelatihan(db, akun.id, kegiatanId))) return galat("Hanya peserta pelatihan yang mengisi nomor pulsa.", 403);
    const body = await req.json().catch(() => null);
    const asli = await nomorAsli(db, akun.id);
    let nomor: string | null;
    if (body?.aksi === "konfirmasi") {
      if (!asli) return galat("Nomor HP Anda belum tercatat. Isi nomor yang aktif.");
      nomor = asli;
    } else if (body?.aksi === "simpan") {
      nomor = normalisasiHp(body?.nomor);
      if (!nomor) return galat("Nomor HP tidak valid. Contoh: 081234567890 (10–14 digit, diawali 08 atau +62).");
    } else {
      return galat("Aksi tidak dikenal.");
    }
    await simpanPulsa(db, kegiatanId, akun.id, nomor, asli);
    await catatAudit(db, akun.id, "pelatihan_pulsa_simpan", { diubah: asli !== nomor });
    return NextResponse.json({ ok: true, ...(await statusPulsa(db, kegiatanId, akun.id)) });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
