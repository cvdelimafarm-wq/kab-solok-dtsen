// app/api/sigap/foto/orientasi/route.ts
//
// (26 Okt 2026) Diagnosa orientasi foto Kamera SIGAP. Sesudah foto terkirim, HP melaporkan keadaan saat memotret (arah HP, sudut layar, ukuran bingkai kamera,
// putaran otomatis yang dipakai) dan berapa kali petugas memutar fotonya sebelum Kirim. Putaran manual 180 derajat = putaran otomatis salah.
// Hanya catatan audit `foto.orientasi` (tanpa foto dan tanpa koordinat); dipakai untuk memastikan arah putar di tiap merek HP.
// POST { foto_id, diag: { ... } } -> { ok }

import { NextRequest, NextResponse } from "next/server";
import { catatAudit } from "@/lib/sigapAkses";
import { galat, masukFoto } from "@/lib/sigapFotoRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KUNCI_DIAG = ["kunci", "miring", "layar_lebar", "sudut_layar", "tipe_layar", "bingkai", "hadap", "sensor", "sumber", "kuartal_dasar", "kuartal_dipakai", "balik", "kuartal_manual"] as const;

export async function POST(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { db, akunId } = m;
  const b = (await req.json().catch(() => null)) as { foto_id?: unknown; diag?: unknown } | null;
  const fotoId = Number(b?.foto_id);
  if (!Number.isInteger(fotoId) || !b?.diag || typeof b.diag !== "object") return galat("foto_id dan diag wajib.");
  const { data: foto } = await db.from("sigap_foto").select("id, akun_pengambil").eq("id", fotoId).maybeSingle();
  if (!foto || foto.akun_pengambil !== akunId) return galat("Foto tidak ditemukan.", 404);
  const sumber = b.diag as Record<string, unknown>;
  const detail: Record<string, unknown> = { foto_id: fotoId };
  for (const k of KUNCI_DIAG) {
    const v = sumber[k];
    // hanya nilai kecil (angka, teks pendek, boolean, daftar angka); selain itu dibuang
    if (typeof v === "number" || typeof v === "boolean" || v === null) detail[k] = v;
    else if (typeof v === "string") detail[k] = v.slice(0, 40);
    else if (Array.isArray(v) && v.length <= 4 && v.every((x) => typeof x === "number")) detail[k] = v;
  }
  await catatAudit(db, akunId, "foto.orientasi", detail);
  return NextResponse.json({ ok: true });
}
