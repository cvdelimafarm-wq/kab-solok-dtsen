// app/api/sigap/pelatihan/roleplay/route.ts
//
// (8 Nov 2026) Kelola Pelatihan > Persiapan > Vanguard: centang "Roleplay bareng kelas". Roleplay hanya aktif bila dicentang (bawaan MATI) dan Vanguard menyala.
// Izin menu `pelatihan.kelola` (lihat = baca, kelola = ubah).
//   GET            -> { kegiatan_id, aktif, vanguard_menyala, boleh_kelola, jumlah_roleplay }
//   POST {aktif}   -> menyimpan centang -> sama seperti GET

import { NextRequest, NextResponse } from "next/server";
import type { Db } from "@/lib/sigap";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan } from "@/lib/sigapTesDb";
import { keadaanVanguard } from "@/lib/vanguardAkses";
import { roleplayDicentang, simpanCentangRoleplay } from "@/lib/vanguardRoleplayDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

async function siapkan(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return { err: galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500) } as const;
  const akun = await akunDariRequest(req, db);
  if (!akun) return { err: galat("Sesi berakhir. Silakan masuk kembali.", 401) } as const;
  const kegiatanId = await idKegiatanPelatihan(db, req);
  if (!kegiatanId) return { err: galat("Pelatihan tidak ditemukan.", 404) } as const;
  const { izin } = await izinAkun(db, akun.id);
  if (!boleh(izin, "pelatihan.kelola", "lihat", kegiatanId)) return { err: galat("Tidak punya izin membuka menu ini.", 403) } as const;
  return { db: db as Db, akun, kegiatanId, bisaKelola: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId) } as const;
}

async function keadaan(db: Db, kegiatanId: number, bisaKelola: boolean) {
  const [aktif, vg, { count }] = await Promise.all([
    roleplayDicentang(db, kegiatanId),
    keadaanVanguard(db, kegiatanId),
    db.from("sigap_vanguard_roleplay").select("id", { count: "exact", head: true }).eq("kegiatan_id", kegiatanId),
  ]);
  return { kegiatan_id: kegiatanId, aktif, vanguard_menyala: vg.menyala, boleh_kelola: bisaKelola, jumlah_roleplay: count ?? 0 };
}

export async function GET(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    return NextResponse.json(await keadaan(p.db, p.kegiatanId, p.bisaKelola));
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    if (!p.bisaKelola) return galat("Tidak punya izin mengubah roleplay pelatihan ini.", 403);
    const body = (await req.json().catch(() => null)) as { aktif?: unknown } | null;
    if (!body || typeof body.aktif !== "boolean") return galat("Pilihan tidak valid.");
    if (!(await simpanCentangRoleplay(p.db, p.kegiatanId, body.aktif, p.akun.nama))) return galat("Gagal menyimpan pilihan roleplay.", 500);
    await catatAudit(p.db, p.akun.id, "pelatihan_roleplay", { kegiatan_id: p.kegiatanId, aktif: body.aktif });
    return NextResponse.json(await keadaan(p.db, p.kegiatanId, p.bisaKelola));
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
