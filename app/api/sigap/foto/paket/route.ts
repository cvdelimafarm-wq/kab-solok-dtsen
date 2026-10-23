// app/api/sigap/foto/paket/route.ts
//
// (23 Okt 2026) PAKET TOKEN untuk Kamera SIGAP tanpa sinyal.
// Diminta HP saat masih ada sinyal (mis. pagi hari di kantor/rumah). Isinya beberapa token sekali pakai yang semuanya bercap waktu server
// `t`. Di lapangan tanpa sinyal, waktu foto = t + lama berjalan menurut jam HP sejak paket diterima (lihat lib/sigapFoto.waktuResmi,
// cabang `paket`). Foto semacam itu SELALU kuning ("waktu_offline"), tidak pernah hijau, dan dikirim otomatis saat sinyal kembali.
// Token paket bernonce berawalan "P~" dan hanya sah dipakai selama UMUR_PAKET_MS (48 jam) sejak t.
// GET -> { t, tokens: string[], berlaku_ms }.  Tidak menyimpan apa pun di database.

import { NextRequest, NextResponse } from "next/server";
import { JUMLAH_TOKEN_PAKET, UMUR_PAKET_MS } from "@/lib/sigapFoto";
import { buatPaketToken } from "@/lib/sigapFotoServer";
import { masukFoto } from "@/lib/sigapFotoRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { t, tokens } = buatPaketToken(m.akunId, JUMLAH_TOKEN_PAKET);
  return NextResponse.json({ t, tokens, berlaku_ms: UMUR_PAKET_MS }, { headers: { "Cache-Control": "no-store" } });
}
