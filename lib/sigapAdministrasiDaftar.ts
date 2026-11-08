// lib/sigapAdministrasiDaftar.ts  (khusus server)
//
// (8 Nov 2026) Daftar orang di Administrasi pelatihan: peserta, panitia, instruktur. Dipisah dari lib/sigapAdministrasi.ts (yang menarik pembuat PDF) supaya ringan dan mudah diuji.
// Panitia mengikuti dokumen yang sama dengan peserta dan digabung dalam satu daftar; instruktur memakai dokumen yang sama tetapi daftarnya terpisah.

import type { Db } from "@/lib/sigap";
import { SUMBER_ADMINISTRASI, undanganUntuk } from "@/lib/sigapTesDb";

export const PERAN_PESERTA = ["ppl", "pml", "korwil"] as const;
/** (8 Nov 2026) Panitia mengikuti dokumen yang sama dengan peserta (satu daftar); instruktur dokumennya sama tetapi daftarnya TERPISAH. */
export const PERAN_TAMBAHAN = ["panitia", "instruktur"] as const;
export const PERAN_ADMINISTRASI = [...PERAN_PESERTA, ...PERAN_TAMBAHAN] as readonly string[];
export type Kelompok = "peserta" | "instruktur";
export const kelompokDari = (v: unknown): Kelompok => (v === "instruktur" ? "instruktur" : "peserta");

// ----------------------------------------------------------------------------------------------
// (8 Nov 2026) Tambah / keluarkan orang di daftar administrasi (peserta manual, panitia, instruktur)
// ----------------------------------------------------------------------------------------------
type HasilAdm = { ok: true; penugasan_id: number; nama: string } | { ok: false; pesan: string; status: number };
const gagalAdm = (pesan: string, status = 400): HasilAdm => ({ ok: false, pesan, status });

/**
 * Masukkan satu akun ke daftar administrasi kelas (sigap_penugasan sumber 'administrasi' + hari kerja pada tanggal pelatihan), supaya Transport Lokal-nya bisa diisi dan
 * SPJ-nya dicetak. Peran: ppl / pml / korwil (peserta), panitia (digabung dengan peserta), instruktur (daftar terpisah). Tarif peran itu harus sudah ada di kegiatan.
 */
export async function tambahPesertaAdministrasi(db: Db, kegiatanId: number, p: { akunId: number; peran: string; kelas: number | null }): Promise<HasilAdm> {
  const peran = String(p.peran ?? "").toLowerCase();
  if (!Number.isInteger(p.akunId) || p.akunId <= 0) return gagalAdm("Akun tidak valid.");
  if (!PERAN_ADMINISTRASI.includes(peran)) return gagalAdm("Peran harus PPL, PML, Korwil, Panitia, atau Instruktur.");
  const { data: a } = await db.from("sigap_akun").select("id, nama, aktif").eq("id", p.akunId).maybeSingle();
  if (!a || !a.aktif) return gagalAdm("Akun tidak ditemukan atau tidak aktif.", 404);
  const { data: tarif } = await db.from("sigap_kegiatan_tarif").select("peran").eq("kegiatan_id", kegiatanId).eq("peran", peran).maybeSingle();
  if (!tarif) return gagalAdm(`Tarif untuk peran ${peran.toUpperCase()} belum diatur pada kegiatan ini (menu Kegiatan & Tarif).`);
  if (p.kelas === null || !Number.isInteger(p.kelas)) return gagalAdm("Kelas belum dipilih.");

  const { data: ada } = await db.from("sigap_penugasan").select("id, aktif, peran").eq("kegiatan_id", kegiatanId).eq("akun_id", p.akunId).maybeSingle();
  if (ada?.aktif) return gagalAdm(`${a.nama} sudah ada di daftar pelatihan ini sebagai ${String(ada.peran).toUpperCase()}. Satu orang hanya satu penugasan per pelatihan.`, 409);
  let penugasanId: number;
  if (ada) {
    const { error } = await db.from("sigap_penugasan").update({ aktif: true, peran, kelas: p.kelas, sumber: SUMBER_ADMINISTRASI }).eq("id", ada.id);
    if (error) return gagalAdm(error.message, 500);
    penugasanId = ada.id as number;
  } else {
    const { data: baru, error } = await db.from("sigap_penugasan").insert({ kegiatan_id: kegiatanId, akun_id: p.akunId, peran, kelas: p.kelas, aktif: true, sumber: SUMBER_ADMINISTRASI }).select("id").single();
    if (error || !baru) return gagalAdm(error?.message ?? "Gagal menambah ke daftar administrasi.", 500);
    penugasanId = baru.id as number;
  }
  const { error: eHk } = await db.from("sigap_hari_kerja").upsert({ penugasan_id: penugasanId, akun_id: p.akunId, tanggal: (await undanganUntuk(db, kegiatanId)).tanggal_iso }, { onConflict: "penugasan_id,tanggal", ignoreDuplicates: true });
  if (eHk) {
    const bentrok = eHk.code === "23505";
    return gagalAdm(bentrok ? "Orang ini sudah punya hari kerja Transport Lokal pada tanggal pelatihan di kegiatan lain, sehingga tidak bisa ditambahkan." : eHk.message, bentrok ? 409 : 500);
  }
  return { ok: true, penugasan_id: penugasanId, nama: String(a.nama) };
}

/** Nonaktifkan baris administrasi (sumber 'administrasi') milik akun pada peran tertentu; tidak menghapus data. Mengembalikan jumlah baris yang dinonaktifkan. */
export async function lepasAdministrasiAkun(db: Db, kegiatanId: number, akunId: number, peran: "panitia" | "instruktur"): Promise<number> {
  const { data } = await db.from("sigap_penugasan").select("id").eq("kegiatan_id", kegiatanId).eq("akun_id", akunId).eq("peran", peran).eq("sumber", SUMBER_ADMINISTRASI).eq("aktif", true);
  const ids = ((data ?? []) as { id: number }[]).map((x) => x.id);
  if (ids.length === 0) return 0;
  await db.from("sigap_penugasan").update({ aktif: false }).in("id", ids);
  return ids.length;
}

