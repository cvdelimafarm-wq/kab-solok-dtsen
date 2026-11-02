// app/api/sigap/pelatihan/vanguard/route.ts
//
// (2 Nov 2026) Kelola Pelatihan > Persiapan > Vanguard: menyalakan / mematikan Vanguard (simulasi pengisian kuesioner) untuk pelatihan ini. Dulu penyalaan hanya lewat SQL,
// centang "Fitur kegiatan" di Kelola Pendataan (izin bencana.admin), atau Identifikasi survei; pelatihan tidak punya tempat sehingga kotak pintasan dasbor tidak pernah muncul.
// Izin menu `pelatihan.kelola` (lihat = baca, kelola = ubah).
//
// GET                          -> { kegiatan_id, menyala, sumber:"centang"|"identifikasi"|"mati", centang:true|false|null, percobaan, boleh_kelola }
// POST {menyala:true|false|null} -> true/false = centang manual (menang atas Identifikasi survei); null = hapus centang (ikuti Identifikasi survei) -> sama seperti GET

import { NextRequest, NextResponse } from "next/server";
import type { Db } from "@/lib/sigap";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan } from "@/lib/sigapTesDb";
import { KODE_FITUR_VANGUARD, keadaanVanguard } from "@/lib/vanguardAkses";

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
  const [kd, { data: c }, { count }] = await Promise.all([
    keadaanVanguard(db, kegiatanId),
    db.from("sigap_kegiatan_fitur").select("aktif").eq("kegiatan_id", kegiatanId).eq("fitur", KODE_FITUR_VANGUARD).maybeSingle(),
    db.from("sigap_vanguard_percobaan").select("id", { count: "exact", head: true }).eq("kegiatan_id", kegiatanId),
  ]);
  const aktif = (c as { aktif?: unknown } | null)?.aktif;
  return { kegiatan_id: kegiatanId, menyala: kd.menyala, sumber: kd.sumber, centang: typeof aktif === "boolean" ? aktif : null, percobaan: count ?? 0, boleh_kelola: bisaKelola };
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
    if (!p.bisaKelola) return galat("Tidak punya izin mengubah Vanguard pelatihan ini.", 403);
    const body = (await req.json().catch(() => null)) as { menyala?: unknown } | null;
    if (!body || !(body.menyala === true || body.menyala === false || body.menyala === null)) return galat("Pilihan tidak valid.");
    if (body.menyala === null) {
      const { error } = await p.db.from("sigap_kegiatan_fitur").delete().eq("kegiatan_id", p.kegiatanId).eq("fitur", KODE_FITUR_VANGUARD);
      if (error) return galat("Gagal menyimpan pilihan Vanguard.", 500);
    } else {
      const { error } = await p.db.from("sigap_kegiatan_fitur").upsert({ kegiatan_id: p.kegiatanId, fitur: KODE_FITUR_VANGUARD, aktif: body.menyala, diubah_oleh: p.akun.nama, diubah_at: new Date().toISOString() }, { onConflict: "kegiatan_id,fitur" });
      if (error) return galat("Gagal menyimpan pilihan Vanguard.", 500);
    }
    await catatAudit(p.db, p.akun.id, "pelatihan_vanguard", { kegiatan_id: p.kegiatanId, menyala: body.menyala });
    return NextResponse.json(await keadaan(p.db, p.kegiatanId, p.bisaKelola));
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
