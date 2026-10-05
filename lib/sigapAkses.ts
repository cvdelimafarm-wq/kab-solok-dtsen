// lib/sigapAkses.ts
//
// (5 Okt 2026) SIGAP -- sesi & hak akses (Kelola Peran & Akses), permintaan user:
//  - Satu pintu masuk /sigap/masuk (nama + PIN). Sesudah masuk, browser memegang "sesi" bertanda tangan
//    HMAC (akunId.kedaluwarsa.tanda) yg berlaku 12 jam -- dipakai semua endpoint admin.
//  - Izin TIDAK di-hardcode: dibaca dari sigap_akun_peran -> sigap_peran_izin (level 'lihat' | 'kelola',
//    'kelola' sudah termasuk 'lihat'), dgn lingkup kegiatan (null = semua kegiatan).
//  - Menu petugas Transport Lokal tidak lewat izin: otomatis bila akun punya penugasan aktif.

import crypto from "crypto";
import type { Db } from "@/lib/sigap";

const SESI_JAM = 12;

function kunciRahasia(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diset.");
  return `sigap-sesi:${k}`;
}

function tanda(isi: string): string {
  return crypto.createHmac("sha256", kunciRahasia()).update(isi).digest("base64url");
}

/** Buat sesi bertanda tangan utk akun (berlaku 12 jam). */
export function buatSesi(akunId: number): { sesi: string; sampai: string } {
  const exp = Date.now() + SESI_JAM * 3_600_000;
  const isi = `${akunId}.${exp}`;
  return { sesi: `${isi}.${tanda(isi)}`, sampai: new Date(exp).toISOString() };
}

/** Akun id dari sesi yg sah & belum kedaluwarsa, atau null. */
export function bacaSesi(sesi: string | null | undefined): number | null {
  if (!sesi) return null;
  const [id, exp, sig] = sesi.split(".");
  if (!id || !exp || !sig) return null;
  const harus = tanda(`${id}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(harus);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Sesi dari header Authorization: Bearer <sesi>. */
export function sesiDariHeader(h: Headers): number | null {
  const v = h.get("authorization") ?? "";
  return bacaSesi(v.startsWith("Bearer ") ? v.slice(7).trim() : null);
}

export type Level = "lihat" | "kelola";
/** menu -> { level tertinggi, lingkup: "semua" | daftar kegiatan_id } */
export type PetaIzin = Record<string, { level: Level; semua: boolean; kegiatan: number[] }>;
export type PeranAkun = { peran_id: number; kode: string; nama: string; kegiatan_id: number | null };

export async function izinAkun(db: Db, akunId: number): Promise<{ peran: PeranAkun[]; izin: PetaIzin }> {
  const { data: ap } = await db.from("sigap_akun_peran").select("peran_id, kegiatan_id").eq("akun_id", akunId);
  const peranIds = Array.from(new Set((ap ?? []).map((x) => x.peran_id as number)));
  if (peranIds.length === 0) return { peran: [], izin: {} };
  const [{ data: pr }, { data: iz }] = await Promise.all([
    db.from("sigap_peran").select("id, kode, nama").in("id", peranIds),
    db.from("sigap_peran_izin").select("peran_id, menu_kode, level").in("peran_id", peranIds),
  ]);
  const peran: PeranAkun[] = (ap ?? []).map((x) => {
    const p = (pr ?? []).find((y) => y.id === x.peran_id);
    return { peran_id: x.peran_id as number, kode: (p?.kode as string) ?? "?", nama: (p?.nama as string) ?? "?", kegiatan_id: (x.kegiatan_id as number | null) ?? null };
  });
  const izin: PetaIzin = {};
  for (const x of ap ?? []) {
    for (const i of (iz ?? []).filter((y) => y.peran_id === x.peran_id)) {
      const kode = i.menu_kode as string;
      const lv = i.level as Level;
      const cur = izin[kode] ?? { level: "lihat" as Level, semua: false, kegiatan: [] };
      if (lv === "kelola") cur.level = "kelola";
      if (x.kegiatan_id == null) cur.semua = true;
      else if (!cur.kegiatan.includes(x.kegiatan_id as number)) cur.kegiatan.push(x.kegiatan_id as number);
      izin[kode] = cur;
    }
  }
  return { peran, izin };
}

/** Boleh melakukan `level` pada `menu` (untuk kegiatan tertentu bila diberikan)? */
export function boleh(izin: PetaIzin, menu: string, level: Level, kegiatanId?: number | null): boolean {
  const x = izin[menu];
  if (!x) return false;
  if (level === "kelola" && x.level !== "kelola") return false;
  if (kegiatanId == null) return true;
  return x.semua || x.kegiatan.includes(kegiatanId);
}

/** Kegiatan yg boleh dilihat lewat menu tsb: "semua" atau daftar id. */
export function lingkup(izin: PetaIzin, menu: string): "semua" | number[] {
  const x = izin[menu];
  if (!x) return [];
  return x.semua ? "semua" : x.kegiatan;
}

/** Ada akses admin apa pun (utk kartu portal)? */
export function punyaAksesAdmin(izin: PetaIzin): boolean {
  return Object.keys(izin).some((k) => k.startsWith("translok."));
}

export async function catatAudit(db: Db, akunId: number | null, aksi: string, detail: Record<string, unknown>) {
  await db.from("sigap_audit").insert({ akun_id: akunId, aksi, detail });
}
