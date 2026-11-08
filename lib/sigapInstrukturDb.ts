// lib/sigapInstrukturDb.ts
//
// (3 Nov 2026) Instruktur kelas per pelatihan (tabel sigap_kuis_instruktur_kelas, kunci utama kegiatan_id + akun_id: satu kelas per akun per kegiatan).
// Dulu hanya bisa diisi lewat SQL; kini lewat Kelola Pelatihan > Tim & Peserta > Instruktur (/api/sigap/pelatihan/instruktur).

import type { Db as SupabaseDb } from "@/lib/sigap";
import { muatKelasKegiatan } from "@/lib/sigapKelasKegiatan";

type Db = SupabaseDb;

export type BarisInstruktur = { akun_id: number; nama: string; kelas: number };
export type KandidatInstruktur = { akun_id: number; nama: string; jenis: string | null };

export const KELAS_MAKS = 20;

export const kelasSah = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= KELAS_MAKS;

/** Daftar instruktur kegiatan ini (urut kelas, nama). */
export async function muatInstruktur(db: Db, kegiatanId: number): Promise<BarisInstruktur[]> {
  const { data } = await db.from("sigap_kuis_instruktur_kelas").select("akun_id, kelas").eq("kegiatan_id", kegiatanId).limit(500);
  const baris = ((data ?? []) as { akun_id: number; kelas: number }[]).map((b) => ({ akun_id: Number(b.akun_id), kelas: Number(b.kelas) }));
  if (baris.length === 0) return [];
  const { data: akun } = await db.from("sigap_akun").select("id, nama").in("id", baris.map((b) => b.akun_id));
  const nama = new Map(((akun ?? []) as { id: number; nama: string }[]).map((a) => [Number(a.id), a.nama]));
  return baris.map((b) => ({ ...b, nama: nama.get(b.akun_id) ?? `Akun ${b.akun_id}` })).sort((a, b) => a.kelas - b.kelas || a.nama.localeCompare(b.nama));
}

/** Pilihan kelas = kelas milik pelatihan ini (tabel kelas + yang sudah terpakai peserta) ditambah kelas instruktur yang ada. */
export async function kelasTersedia(db: Db, kegiatanId: number, instruktur: readonly BarisInstruktur[]): Promise<number[]> {
  const set = new Set<number>((await muatKelasKegiatan(db, kegiatanId)).map((k) => k.nomor));
  for (const i of instruktur) set.add(i.kelas);
  return [...set].sort((a, b) => a - b);
}

/** Cari akun aktif menurut nama (minimal 2 huruf), maksimal 12 hasil. */
export async function cariAkun(db: Db, kata: string): Promise<KandidatInstruktur[]> {
  const q = kata.trim().replace(/[%_,()]/g, " ").trim();
  if (q.length < 2) return [];
  const { data } = await db.from("sigap_akun").select("id, nama, jenis").eq("aktif", true).ilike("nama", `%${q}%`).order("nama").limit(12);
  return ((data ?? []) as { id: number; nama: string; jenis: string | null }[]).map((a) => ({ akun_id: Number(a.id), nama: a.nama, jenis: a.jenis ?? null }));
}

export type HasilInstruktur = { ok: true } | { ok: false; pesan: string };

/** Menetapkan (atau memindahkan kelas) satu instruktur. Akun harus ada dan aktif. */
export async function tetapkanInstruktur(db: Db, kegiatanId: number, akunId: number, kelas: number): Promise<HasilInstruktur> {
  if (!kelasSah(kelas)) return { ok: false, pesan: `Kelas harus angka 1 sampai ${KELAS_MAKS}.` };
  if (!(await muatKelasKegiatan(db, kegiatanId)).some((k) => k.nomor === kelas)) return { ok: false, pesan: "Kelas itu tidak ada di pelatihan ini. Atur kelas di Pengaturan kelas." };
  const { data: akun } = await db.from("sigap_akun").select("id, aktif").eq("id", akunId).maybeSingle();
  if (!akun) return { ok: false, pesan: "Akun tidak ditemukan." };
  if ((akun as { aktif: boolean }).aktif === false) return { ok: false, pesan: "Akun itu tidak aktif." };
  const { error } = await db.from("sigap_kuis_instruktur_kelas").upsert({ kegiatan_id: kegiatanId, akun_id: akunId, kelas }, { onConflict: "kegiatan_id,akun_id" });
  if (error) return { ok: false, pesan: "Gagal menyimpan instruktur." };
  return { ok: true };
}

export async function lepasInstruktur(db: Db, kegiatanId: number, akunId: number): Promise<HasilInstruktur> {
  const { error } = await db.from("sigap_kuis_instruktur_kelas").delete().eq("kegiatan_id", kegiatanId).eq("akun_id", akunId);
  if (error) return { ok: false, pesan: "Gagal melepas instruktur." };
  return { ok: true };
}
