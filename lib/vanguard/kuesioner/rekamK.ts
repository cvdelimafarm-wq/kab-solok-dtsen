// lib/vanguard/kuesioner/rekamK.ts  (murni, HANYA server/tes: memakai nilaiK yang memuat kunci)
//
// (1 Nov 2026) VANGUARD V6g: rekaman percobaan kasus K (Mode Kuesioner Penuh) ke sigap_vanguard_percobaan dan sigap_vanguard_kesalahan.
// Skor dari klien TIDAK dipakai: isian dinilai ulang di server. Bintang memakai rumus yang sama dengan kasus biasa (hitungBintang).
// Kasus K tidak ikut bintang/kelulusan Mode Simulasi: pembaca rekaman lama menyaring kode kasus K (adalahKasusK).
// Tabel membatasi jenis kesalahan lewat CHECK; migrasi skema-sql/fase-b/20261101y_vanguard_kasus_k.sql sudah menambah 6 jenis kasus K.

import { hitungBintang } from "../engine";
import { VERSI_KASUS } from "../konstanta";
import type { HasilK, IsianK, KasusK } from "./nilaiK";
import { nilaiKasusK } from "./nilaiK";

export const MAKS_PETUNJUK_K = 3;
export const MAKS_DURASI_K = 86400;

export type MuatanK = { kegiatan: number; kasus: string; benih: number; isian: IsianK[]; petunjuk: number; lihatJawaban: boolean; durasiDtk: number };

const bulatDalam = (x: unknown, min: number, max: number): number => (typeof x === "number" && Number.isFinite(x) ? Math.min(max, Math.max(min, Math.round(x))) : min);

/** Petunjuk dan durasi dari klien dipangkas ke rentang sah (angka itu hanya cacahan, bukan skor). */
export const rapikanCacahanK = (petunjuk: unknown, durasi: unknown) => ({ petunjuk: bulatDalam(petunjuk, 0, MAKS_PETUNJUK_K), durasiDtk: bulatDalam(durasi, 0, MAKS_DURASI_K) });

const selK = (k: { r: number; art: number | null }): string => (k.art ? `R${k.r}A${k.art}` : `R${k.r}`);

export type RingkasanK = { hasil: HasilK; benar: boolean; bintang: number; jmlSalah: number; jmlFatal: number; kesalahan: { sel: string; jenis: string; tingkat: string; nilai_petugas: null; nilai_benar: null }[] };

export function ringkasPercobaanK(kasus: Pick<KasusK, "kunci" | "jebakan">, m: Pick<MuatanK, "isian" | "petunjuk" | "lihatJawaban">, nomor: number): RingkasanK {
  const hasil = nilaiKasusK(kasus, m.isian);
  const benar = hasil.benar && !m.lihatJawaban;
  const kesalahan = hasil.kesalahan.map((k) => ({ sel: selK(k), jenis: k.jenis, tingkat: k.tingkat, nilai_petugas: null, nilai_benar: null }));
  const bintang = benar ? hitungBintang({ petunjuk: m.petunjuk, percobaan: nomor, lihatJawaban: false }) : 0;
  return { hasil, benar, bintang, jmlSalah: kesalahan.length, jmlFatal: kesalahan.filter((x) => x.tingkat === "fatal").length, kesalahan: kesalahan as RingkasanK["kesalahan"] };
}

/** Isian disimpan sebagai objek {benih, entri:[...]} (benih = angka soal, supaya soal dan kunci bisa dibangun ulang) (kolom jsonb default objek; daftar entri tidak sama bentuknya dengan peta sel kasus biasa). */
export const barisPercobaanK = (akunId: number, m: MuatanK, r: RingkasanK, nomor: number) => ({
  kegiatan_id: m.kegiatan, akun_id: akunId, kasus: m.kasus, versi: VERSI_KASUS, mode: "latihan" as const, nomor, petunjuk: m.petunjuk, lihat_jawaban: m.lihatJawaban,
  benar: r.benar, bintang: r.bintang, jml_salah: r.jmlSalah, jml_fatal: r.jmlFatal, durasi_dtk: m.durasiDtk, isian: { benih: m.benih, entri: m.isian },
});

export const barisKesalahanK = (percobaanId: number, akunId: number, m: MuatanK, r: RingkasanK) =>
  r.kesalahan.map((k) => ({ percobaan_id: percobaanId, kegiatan_id: m.kegiatan, akun_id: akunId, kasus: m.kasus, ...k }));
