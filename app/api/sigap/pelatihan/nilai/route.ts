// app/api/sigap/pelatihan/nilai/route.ts
//
// (8 Okt 2026) Skema nilai akhir pelatihan (Pretest + Posttest + Kuis Adu Sigap) -- dipakai Soal & Jadwal, Monitoring, Administrasi.
// Izin: lihat = pelatihan.kelola ATAU pelatihan.administrasi (level lihat); ubah = pelatihan.kelola level kelola.
// GET  -> { skema, tersimpan, boleh_ubah, kuis: { "<akun_id>": KuisNilai } }
//         (nilai Pretest/Posttest sudah ada di data Monitoring; peramban menghitung nilai akhir dari skema + data ini)
// POST { aksi: "simpan_skema", skema: { pakai, bobot, dasar_kuis } } -> sama seperti GET

import { NextRequest, NextResponse } from "next/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { muatKuisNilai, muatSkema, simpanSkema } from "@/lib/sigapNilai";
import { ringkasSkema, validasiSkema } from "@/lib/sigapNilaiHitung";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

async function siapkan(req: NextRequest, tulis: boolean) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariRequest(req, db);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  const kegiatanId = await idKegiatanPelatihan(db);
  if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
  const { izin } = await izinAkun(db, akun.id);
  const bolehUbah = boleh(izin, "pelatihan.kelola", "kelola", kegiatanId);
  const bolehLihat = bolehUbah || boleh(izin, "pelatihan.kelola", "lihat", kegiatanId) || boleh(izin, "pelatihan.administrasi", "lihat", kegiatanId);
  if (!bolehLihat) return galat("Tidak punya izin melihat nilai pelatihan.", 403);
  if (tulis && !bolehUbah) return galat("Hanya pengelola pelatihan yang boleh mengubah skema nilai.", 403);
  return { db, akun, kegiatanId, bolehUbah };
}

async function muatSemua(k: Exclude<Awaited<ReturnType<typeof siapkan>>, NextResponse>) {
  const [{ skema, tersimpan }, kuis] = await Promise.all([muatSkema(k.db, k.kegiatanId), muatKuisNilai(k.db, k.kegiatanId)]);
  return { skema, tersimpan, boleh_ubah: k.bolehUbah, kuis: Object.fromEntries(kuis) };
}

export async function GET(req: NextRequest) {
  try {
    const k = await siapkan(req, false);
    if (k instanceof NextResponse) return k;
    return NextResponse.json(await muatSemua(k));
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  try {
    const k = await siapkan(req, true);
    if (k instanceof NextResponse) return k;
    if (body?.aksi !== "simpan_skema") return galat("Aksi tidak dikenal.");
    const v = validasiSkema(body?.skema);
    if (!v.ok) return galat(v.error);
    await simpanSkema(k.db, k.kegiatanId, v.skema, k.akun.id);
    await catatAudit(k.db, k.akun.id, "pelatihan_skema_nilai_simpan", { skema: ringkasSkema(v.skema), dasar_kuis: v.skema.dasar_kuis });
    return NextResponse.json({ ok: true, ...(await muatSemua(k)) });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
