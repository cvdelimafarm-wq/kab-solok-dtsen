// lib/sigapIzinPush.ts  (hanya server)
//
// (2 Nov 2026) Tahap G: pengirim notifikasi alur buka kunci. Pelengkap: kegagalan di sini TIDAK PERNAH menggagalkan aksi utama
// (minta / putuskan / buka) -- selalu mengembalikan jumlah terkirim (0 bila gagal atau push belum disiapkan).

import type { Db } from "@/lib/sigap";
import { kirimKeAkun } from "@/lib/sigapPush";
import { gabungPenerimaIzin, pesanIzinDibuka, pesanIzinDiminta, pesanIzinDiputuskan, type PesanIzin } from "@/lib/sigapIzinPesan";

/** Akun aktif yang memegang izin menu Kelola Pelatihan (panitia) atau peran admin_aplikasi. */
export async function akunPanitiaPelatihan(db: Db): Promise<number[]> {
  try {
    const [{ data: iz }, { data: pr }] = await Promise.all([
      db.from("sigap_peran_izin").select("peran_id").eq("menu_kode", "pelatihan.kelola"),
      db.from("sigap_peran").select("id").eq("kode", "admin_aplikasi"),
    ]);
    const peranIds = [...new Set([...(iz ?? []).map((x) => x.peran_id as number), ...(pr ?? []).map((x) => x.id as number)])];
    if (!peranIds.length) return [];
    const { data: ap } = await db.from("sigap_akun_peran").select("akun_id").in("peran_id", peranIds);
    const akunIds = [...new Set((ap ?? []).map((x) => x.akun_id as number))];
    if (!akunIds.length) return [];
    const { data: ak } = await db.from("sigap_akun").select("id").in("id", akunIds).eq("aktif", true);
    return (ak ?? []).map((a) => a.id as number);
  } catch {
    return [];
  }
}

/** Instruktur yang berwenang atas `kelas` (kelas null pada instruktur = semua kelas). */
export async function akunInstrukturKelas(db: Db, kegiatanId: number, kelas: number | null): Promise<number[]> {
  try {
    const { data } = await db.from("sigap_kuis_instruktur_kelas").select("akun_id, kelas").eq("kegiatan_id", kegiatanId).limit(500);
    return ((data ?? []) as { akun_id: number; kelas: number | null }[])
      .filter((r) => r.kelas === null || r.kelas === undefined || kelas === null || Number(r.kelas) === kelas)
      .map((r) => r.akun_id);
  } catch {
    return [];
  }
}

async function kirim(db: Db, penerima: number[], pesan: PesanIzin): Promise<number> {
  if (!penerima.length) return 0;
  try {
    return (await kirimKeAkun(db, penerima, pesan)).terkirim;
  } catch (e) {
    console.error("[izin push]", e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Peserta mengajukan -> panitia + instruktur kelasnya (kecuali peserta sendiri). */
export async function beritahuIzinDiminta(db: Db, kegiatanId: number, peserta: { id: number; nama: string; kelas: number | null }, tahap: string, alasan: string, izinId?: number | null): Promise<number> {
  try {
    const [panitia, instruktur] = await Promise.all([akunPanitiaPelatihan(db), akunInstrukturKelas(db, kegiatanId, peserta.kelas)]);
    return await kirim(db, gabungPenerimaIzin([panitia, instruktur], peserta.id), pesanIzinDiminta(peserta.nama, tahap, alasan, izinId));
  } catch {
    return 0;
  }
}

/** Keputusan -> peserta yang mengajukan. */
export async function beritahuIzinDiputuskan(db: Db, akunId: number, setuju: boolean, tahap: string, oleh: string, izinId?: number | null): Promise<number> {
  return kirim(db, [akunId], pesanIzinDiputuskan(setuju, tahap, oleh, izinId));
}

/** Buka langsung -> peserta bersangkutan. */
export async function beritahuIzinDibuka(db: Db, akunId: number, tahap: string, oleh: string): Promise<number> {
  return kirim(db, [akunId], pesanIzinDibuka(tahap, oleh, akunId));
}
