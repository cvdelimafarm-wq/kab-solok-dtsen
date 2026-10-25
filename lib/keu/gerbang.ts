// lib/keu/gerbang.ts
//
// (24 Okt 2026) Kertas Kerja Revisi POK -- satu-satunya jalan aplikasi menulis atau memanggil fungsi `keu_` di basis data.
//
// Mengapa: aplikasi memakai supabase-js (PostgREST), tiap panggilan = satu transaksi dan TIDAK bisa menyetel akun pelaku
// (`app.akun_id`) lebih dulu. Tanpa akun pelaku, penjaga tabel dan banyak fungsi alur tidak memeriksa hak sama sekali. Karena itu
// semua pemanggilan lewat dua fungsi basis data berkas l:
//   keu_jalankan(p_akun, p_fungsi, p_args)  -- memanggil fungsi keu_ dari daftar izin (daftar ada di basis data)
//   keu_tulis(p_akun, p_tabel, p_op, p_data, p_kunci) -- insert/update satu baris tabel keu_ (tanpa hapus)
// p_akun SELALU diambil dari sesi bertanda tangan di server, tidak pernah dari masukan klien.
//
// Murni terhadap `Db` (hanya memakai `.rpc`) sehingga bisa diuji dengan Db palsu.

import type { Db } from "@/lib/sigap";
import { petakanGalat, type GalatKeu } from "@/lib/keu/galat";

export type HasilKeu<T = unknown> = { ok: true; data: T } | { ok: false; galat: GalatKeu };

/** Fungsi yang hanya membaca/menghitung. Hanya inilah yang boleh dipanggil saat sesi "masuk sebagai" (akun super menyamar untuk uji tampilan). */
export const FUNGSI_BACA: readonly string[] = [
  "keu_boleh", "keu_peran_akun", "keu_adm_buka", "keu_adm_ro_terbuka", "keu_adm_lembar", "keu_jadwal_bulanan", "keu_kk_izin",
  "keu_kk_muat_ro", "keu_kelompok_akun", "keu_ro_kro", "keu_rab_bulan_cair", "keu_kekurangan_saran", "keu_ident_hak", "keu_kebijakan_hak", "keu_notifikasi_saya", "keu_usulan_penugasan", "keu_pelaksanaan_bahan",
];

const RE_FUNGSI = /^keu_[a-z0-9_]{1,60}$/;
const RE_TABEL = /^keu_[a-z0-9_]{1,60}$/;
const RE_ARG = /^[a-z][a-z0-9_]{0,40}$/;
const MAKS_ARG = 50;

const adalahObjek = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

export type MasukanPanggil = { fungsi: string; args: Record<string, unknown> };
export type MasukanTulis = { tabel: string; op: "insert" | "update"; data: Record<string, unknown>; kunci: Record<string, unknown> | null };

function periksaKunciObjek(o: Record<string, unknown>, nama: string): string | null {
  const k = Object.keys(o);
  if (k.length > MAKS_ARG) return `${nama} terlalu banyak isian`;
  for (const x of k) if (!RE_ARG.test(x)) return `${nama}: nama isian "${x.slice(0, 20)}" tidak sah`;
  return null;
}

/** Memeriksa badan permintaan panggil: `{ fungsi, args? }`. */
export function periksaMasukanPanggil(body: unknown): { ok: true; masukan: MasukanPanggil } | { ok: false; pesan: string } {
  if (!adalahObjek(body)) return { ok: false, pesan: "Badan permintaan harus objek JSON." };
  const fungsi = body.fungsi;
  if (typeof fungsi !== "string" || !RE_FUNGSI.test(fungsi)) return { ok: false, pesan: "Nama fungsi tidak sah." };
  const args = body.args === undefined ? {} : body.args;
  if (!adalahObjek(args)) return { ok: false, pesan: "args harus objek JSON." };
  if ("p_akun" in args) return { ok: false, pesan: "p_akun diisi server; jangan dikirim." };
  const salah = periksaKunciObjek(args, "args");
  if (salah) return { ok: false, pesan: salah };
  return { ok: true, masukan: { fungsi, args } };
}

/** Memeriksa badan permintaan tulis: `{ tabel, op, data, kunci? }`. */
export function periksaMasukanTulis(body: unknown): { ok: true; masukan: MasukanTulis } | { ok: false; pesan: string } {
  if (!adalahObjek(body)) return { ok: false, pesan: "Badan permintaan harus objek JSON." };
  const { tabel, op, data, kunci } = body;
  if (typeof tabel !== "string" || !RE_TABEL.test(tabel)) return { ok: false, pesan: "Nama tabel tidak sah." };
  if (op !== "insert" && op !== "update") return { ok: false, pesan: "op harus insert atau update (hapus tidak tersedia)." };
  if (!adalahObjek(data) || Object.keys(data).length === 0) return { ok: false, pesan: "data harus objek JSON yang tidak kosong." };
  const sd = periksaKunciObjek(data, "data");
  if (sd) return { ok: false, pesan: sd };
  if (op === "update") {
    if (!adalahObjek(kunci) || Object.keys(kunci).length === 0) return { ok: false, pesan: "update wajib menyertakan kunci (kolom kunci utama)." };
    const sk = periksaKunciObjek(kunci, "kunci");
    if (sk) return { ok: false, pesan: sk };
    return { ok: true, masukan: { tabel, op, data, kunci } };
  }
  if (kunci !== undefined && kunci !== null) return { ok: false, pesan: "insert tidak memakai kunci." };
  return { ok: true, masukan: { tabel, op, data, kunci: null } };
}

/** Memanggil fungsi keu_ atas nama akun. */
export async function panggilKeu<T = unknown>(db: Db, akunId: number, fungsi: string, args: Record<string, unknown> = {}): Promise<HasilKeu<T>> {
  const { data, error } = await db.rpc("keu_jalankan", { p_akun: akunId, p_fungsi: fungsi, p_args: args });
  if (error) return { ok: false, galat: petakanGalat(error) };
  return { ok: true, data: data as T };
}

/** Menulis (insert/update) satu baris tabel keu_ atas nama akun. Mengembalikan baris hasil. */
export async function tulisKeu<T = Record<string, unknown>>(
  db: Db, akunId: number, tabel: string, op: "insert" | "update", data: Record<string, unknown>, kunci: Record<string, unknown> | null = null,
): Promise<HasilKeu<T>> {
  const { data: hasil, error } = await db.rpc("keu_tulis", { p_akun: akunId, p_tabel: tabel, p_op: op, p_data: data, p_kunci: kunci });
  if (error) return { ok: false, galat: petakanGalat(error) };
  return { ok: true, data: hasil as T };
}

export type Sesi = { akunId: number; aktorId: number | null } | null;
export type Balasan = { status: number; json: Record<string, unknown> };

const galatBalasan = (g: GalatKeu): Balasan => ({ status: g.status, json: { error: g.pesan, kode: g.kode } });

/** Logika permintaan POST /api/sigap/keu/panggil (dipisah dari Next supaya bisa diuji). */
export async function tanganiPanggil(db: Db, sesi: Sesi, body: unknown): Promise<Balasan> {
  if (!sesi) return { status: 401, json: { error: "Sesi berakhir. Silakan masuk kembali." } };
  const p = periksaMasukanPanggil(body);
  if (!p.ok) return { status: 400, json: { error: p.pesan } };
  if (sesi.aktorId !== null && !FUNGSI_BACA.includes(p.masukan.fungsi)) {
    return { status: 403, json: { error: "Mode masuk-sebagai hanya untuk melihat tampilan; tindakan ini tidak dijalankan." } };
  }
  const h = await panggilKeu(db, sesi.akunId, p.masukan.fungsi, p.masukan.args);
  return h.ok ? { status: 200, json: { data: h.data } } : galatBalasan(h.galat);
}

/** Logika permintaan POST /api/sigap/keu/tulis. */
export async function tanganiTulis(db: Db, sesi: Sesi, body: unknown): Promise<Balasan> {
  if (!sesi) return { status: 401, json: { error: "Sesi berakhir. Silakan masuk kembali." } };
  const p = periksaMasukanTulis(body);
  if (!p.ok) return { status: 400, json: { error: p.pesan } };
  if (sesi.aktorId !== null) {
    return { status: 403, json: { error: "Mode masuk-sebagai hanya untuk melihat tampilan; tindakan ini tidak dijalankan." } };
  }
  const h = await tulisKeu(db, sesi.akunId, p.masukan.tabel, p.masukan.op, p.masukan.data, p.masukan.kunci);
  return h.ok ? { status: 200, json: { data: h.data } } : galatBalasan(h.galat);
}
