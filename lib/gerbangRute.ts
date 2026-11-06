// lib/gerbangRute.ts  (hanya server)
//
// (6 Nov 2026) Pembungkus penjaga rute API -- hasil audit Kelola K04a-A1/A2 dan sapuan API: 33 rute `app/api/bencana/**` dulu
// TIDAK memeriksa sesi maupun izin, padahal memakai kunci service role. Keputusan Iqbal (6 Nov): rute admin diberi sesi + izin
// `bencana.admin` berlingkup PSP, PIN statis dihentikan, jejak audit dicatat pada setiap penulisan.
//
// Pemakaian di rute admin (letakkan di baris pertama tiap handler):
//   const gerbang = await gerbangBencanaAdmin(req);
//   if (!gerbang.ok) return gerbang.res;
//
// Aturan:
//  - Sesi: header `Authorization: Bearer <sesi>` (sama dengan seluruh rute /api/portal). Tanpa sesi sah -> 401.
//  - Level: GET/HEAD = "lihat"; metode lain = "kelola". Izin diperiksa lewat `bolehPsp` (izin `bencana.admin`, lingkup kegiatan 1 atau semua).
//  - Penulisan lewat sesi "masuk sebagai" ditolak (403), sama dengan rute portal lain.
//  - Penulisan dicatat ke `sigap_audit` (akun, metode, jalur). Gagal mencatat TIDAK menggagalkan permintaan.
//
// Rute yang SENGAJA publik (halaman mitra/petugas berbasis tautan atau isian umum) tidak memakai gerbang ini; daftarnya dijaga oleh
// lib/__tests__/gerbangRute.test.ts supaya rute baru di folder bencana tidak terlupa.

import { NextResponse } from "next/server";
import { akunDariSesi, dbPortal, type AkunPortal } from "@/lib/portal/server";
import type { Db } from "@/lib/sigap";
import { aktorDariHeader, bolehPsp, catatAudit, izinAkun, type Level, type PetaIzin } from "@/lib/sigapAkses";

export type HasilGerbang = { ok: true; akun: AkunPortal; izin: PetaIzin; db: Db; level: Level } | { ok: false; res: NextResponse };

export const PESAN_PERLU_MASUK = "Perlu masuk SIGAP. Buka halaman masuk SIGAP, masuk dengan akun Anda, lalu muat ulang halaman ini.";
export const PESAN_TANPA_IZIN = "Akun Anda tidak berizin untuk bagian ini (perlu izin Pendataan Pascabencana).";
export const PESAN_MASUK_SEBAGAI = "Sesi \"masuk sebagai\" tidak boleh mengubah data.";

/** GET/HEAD/OPTIONS = lihat; selain itu kelola. */
export function levelUntukMetode(metode: string): Level {
  const m = metode.toUpperCase();
  return m === "GET" || m === "HEAD" || m === "OPTIONS" ? "lihat" : "kelola";
}

function tolak(status: number, error: string): HasilGerbang {
  return { ok: false, res: NextResponse.json({ error }, { status }) };
}

/**
 * Gerbang rute admin Pendataan Pascabencana (PSP). `opsi.level` menimpa level bawaan menurut metode; `opsi.tanpaAudit` mematikan
 * pencatatan audit (untuk rute yang metodenya POST tetapi hanya membaca).
 */
export async function gerbangBencanaAdmin(req: Request, opsi: { level?: Level; tanpaAudit?: boolean } = {}): Promise<HasilGerbang> {
  const db = dbPortal();
  if (!db) return tolak(500, "SUPABASE_SERVICE_ROLE_KEY belum diset.");

  const level = opsi.level ?? levelUntukMetode(req.method);

  let akun: AkunPortal | null;
  try {
    akun = await akunDariSesi(db, req.headers);
  } catch {
    // Galat basis data bukan "sesi tidak sah": jangan 401 (klien akan membuang sesi).
    return tolak(500, "Gagal memeriksa sesi. Coba lagi sebentar.");
  }
  if (!akun) return tolak(401, PESAN_PERLU_MASUK);

  if (level === "kelola" && aktorDariHeader(req.headers) !== null) return tolak(403, PESAN_MASUK_SEBAGAI);

  let izin: PetaIzin;
  try {
    izin = (await izinAkun(db, akun.id)).izin;
  } catch {
    return tolak(500, "Gagal memeriksa izin. Coba lagi sebentar.");
  }
  if (!bolehPsp(izin, level)) return tolak(403, PESAN_TANPA_IZIN);

  if (level === "kelola" && !opsi.tanpaAudit) {
    let jalur = "";
    try {
      jalur = new URL(req.url).pathname;
    } catch {
      jalur = "";
    }
    try {
      await catatAudit(db, akun.id, "bencana_admin_tulis", { metode: req.method.toUpperCase(), jalur });
    } catch {
      /* jejak audit gagal tidak boleh menggagalkan pekerjaan admin */
    }
  }

  return { ok: true, akun, izin, db, level };
}

/** Pemegang izin lihat PSP yang bersesi sah? Tanpa respons galat -- untuk rute publik yang menyembunyikan data pribadi bagi umum. */
export async function pemegangIzinPsp(req: Request): Promise<boolean> {
  const db = dbPortal();
  if (!db) return false;
  try {
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return false;
    return bolehPsp((await izinAkun(db, akun.id)).izin, "lihat");
  } catch {
    return false;
  }
}

/** Menyamarkan nomor telepon untuk tampilan umum: empat angka pertama dan dua terakhir tetap, sisanya bintang. */
export function samarkanTelp(no: string | null | undefined): string | null {
  if (!no) return null;
  const s = String(no).trim();
  if (s.length <= 6) return "*".repeat(s.length);
  return `${s.slice(0, 4)}${"*".repeat(s.length - 6)}${s.slice(-2)}`;
}
