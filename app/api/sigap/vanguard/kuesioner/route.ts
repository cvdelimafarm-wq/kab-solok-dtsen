// app/api/sigap/vanguard/kuesioner/route.ts
//
// (1 Nov 2026) VANGUARD V6d: penilaian Mode Kuesioner Penuh (kasus K, Blok IV.1) di SERVER. Kunci tidak pernah dikirim ke perangkat kecuali petugas minta "Lihat kunci".
// Tahap ini LATIHAN saja: tidak dicatat, tidak masuk bintang atau dasbor (pencatatan menyusul).
//   GET  ?kode=K01&petunjuk=2 -> { petunjuk: string[2], total }   (petunjuk berurutan; 401 sesi berakhir; 400 kode tidak sah; 404 kasus tidak ada)
//   POST { kode, isian: IsianK[], lihat?: boolean } -> { benar, kesalahan[], sesuai, total, rekapSesuai, pembahasan?, rujukan?, kunci? }
//        pembahasan dan rujukan menyertai hasil benar atau permintaan "lihat"; kunci hanya menyertai "lihat".

import { NextRequest, NextResponse } from "next/server";
import { sesiDariHeader } from "@/lib/sigapAkses";
import { cariKasusK, nilaiKasusK } from "@/lib/vanguard/kuesioner/nilaiK";
import { bersihkanIsian } from "@/lib/vanguard/kuesioner/validasi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const KODE = /^[A-Z][0-9]{2}$/;

export async function GET(req: NextRequest) {
  try {
    if (!sesiDariHeader(req.headers)) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kode = req.nextUrl.searchParams.get("kode") ?? "";
    if (!KODE.test(kode)) return galat("Kode kasus tidak sah.");
    const kasus = cariKasusK(kode);
    if (!kasus) return galat("Kasus tidak ditemukan.", 404);
    const n = Math.max(0, Math.min(kasus.petunjuk.length, Number.parseInt(req.nextUrl.searchParams.get("petunjuk") ?? "0", 10) || 0));
    return NextResponse.json({ kode, petunjuk: kasus.petunjuk.slice(0, n), total: kasus.petunjuk.length });
  } catch {
    return galat("Gagal memuat petunjuk.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!sesiDariHeader(req.headers)) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    let badan: { kode?: unknown; isian?: unknown; lihat?: unknown };
    try { badan = await req.json(); } catch { return galat("Permintaan tidak sah."); }
    const kode = typeof badan.kode === "string" ? badan.kode : "";
    if (!KODE.test(kode)) return galat("Kode kasus tidak sah.");
    const kasus = cariKasusK(kode);
    if (!kasus) return galat("Kasus tidak ditemukan.", 404);
    const { isian, galat: g } = bersihkanIsian(badan.isian);
    if (g) return galat(g);
    const hasil = nilaiKasusK(kasus, isian);
    const lihat = badan.lihat === true;
    return NextResponse.json({
      ...hasil,
      ...(hasil.benar || lihat ? { pembahasan: kasus.pembahasan, rujukan: kasus.rujukan } : {}),
      ...(lihat ? { kunci: kasus.kunci } : {}),
    });
  } catch {
    return galat("Gagal menilai isian.", 500);
  }
}
