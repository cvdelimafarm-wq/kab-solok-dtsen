// app/api/portal/pendataan/fitur/route.ts
//
// (30 Okt 2026) Profil fitur kegiatan untuk Kelola Pendataan (lib/sigapFitur.ts).
// GET ?k=<id kegiatan> (Authorization: Bearer <sesi>) -> ProfilFitur. Izin: bencana.admin (lihat) pada kegiatan itu.
// PUT {kegiatan_id, strategi, fitur: {kode: boolean}} -> ProfilFitur tersimpan. Izin: bencana.admin (kelola) pada kegiatan itu.
// Jejak perubahan masuk sigap_audit. Menyimpan hanya selisih terhadap paket bawaan strategi.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { boleh, catatAudit, izinAkun, type Level } from "@/lib/sigapAkses";
import { GalatFitur, muatProfilFitur, simpanProfilFitur } from "@/lib/portal/fitur";
import { strategiSah } from "@/lib/sigapFitur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MENU = "bencana.admin";
const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const idSah = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

async function masuk(req: NextRequest, kegiatanId: number, level: Level) {
  const db = dbPortal();
  if (!db) return { res: galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500) };
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return { res: galat("Sesi berakhir. Silakan masuk kembali.", 401) };
  const { izin } = await izinAkun(db, akun.id);
  if (!boleh(izin, MENU, level, kegiatanId)) return { res: galat(level === "kelola" ? "Anda tidak boleh mengubah fitur kegiatan ini." : "Anda tidak punya akses ke kegiatan ini.", 403) };
  return { db, akun };
}

export async function GET(req: NextRequest) {
  const k = idSah(req.nextUrl.searchParams.get("k"));
  if (!k) return galat("Pilih kegiatan.");
  try {
    const m = await masuk(req, k, "lihat");
    if ("res" in m) return m.res;
    return NextResponse.json(await muatProfilFitur(m.db, k));
  } catch (e) {
    return e instanceof GalatFitur ? galat(e.message, e.status) : galat(e instanceof Error ? e.message : "Gagal memuat profil fitur.", 500);
  }
}

export async function PUT(req: NextRequest) {
  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return galat("Isian tidak terbaca.");
  }
  const k = idSah(b.kegiatan_id);
  if (!k) return galat("Pilih kegiatan.");
  if (!strategiSah(b.strategi)) return galat("Strategi tidak dikenal.");
  const fitur = typeof b.fitur === "object" && b.fitur !== null && !Array.isArray(b.fitur) ? (b.fitur as Record<string, unknown>) : {};
  try {
    const m = await masuk(req, k, "kelola");
    if ("res" in m) return m.res;
    const lama = await muatProfilFitur(m.db, k);
    const baru = await simpanProfilFitur(m.db, k, b.strategi, fitur, m.akun.nama);
    await catatAudit(m.db, m.akun.id, "kegiatan_fitur", { kegiatan_id: k, strategi_lama: lama.strategi, strategi_baru: baru.strategi, centang_lama: lama.centang, centang_baru: baru.centang });
    return NextResponse.json(baru);
  } catch (e) {
    return e instanceof GalatFitur ? galat(e.message, e.status) : galat(e instanceof Error ? e.message : "Gagal menyimpan profil fitur.", 500);
  }
}
