// lib/vanguard/rekam.ts  (murni: tanpa DB/React)
//
// (1 Nov 2026) VANGUARD V2a: aturan rekaman percobaan. Membaca muatan dari klien (tidak dipercaya), menilai ulang di server dengan engine yang sama,
// dan menyusun baris untuk tabel sigap_vanguard_percobaan dan sigap_vanguard_kesalahan. Skor dari klien TIDAK pernah dipakai.
//
// Dua mode masuk (keputusan Iqbal 1 Nov):
//   "bebas"    = lewat kartu promosi di Beranda: tidak ada kegiatan, tidak ada rekaman, penilaian di perangkat (kunci lokal);
//   "tercatat" = lewat kartu di tab Hari Ini kegiatan yang menyalakan Vanguard: dinilai dan dicatat di server.

import { kasusBenar, hitungBintang } from "./engine";
import { cariKasus } from "./kasus";
import { MAKS_DURASI_DTK, MAKS_KALKULATOR, MAKS_NILAI, MAKS_PERCOBAAN_PER_KASUS, MAKS_PETUNJUK, MAKS_SEL, VERSI_KASUS } from "./konstanta";

export { MAKS_DURASI_DTK, MAKS_KALKULATOR, MAKS_NILAI, MAKS_PERCOBAAN_PER_KASUS, MAKS_PETUNJUK, MAKS_SEL, VERSI_KASUS };
import { selDikenal } from "./sel";
import type { JenisKesalahan, Kasus, Nilai, Tingkat } from "./tipe";

export type ModeMasuk = "bebas" | "tercatat";
/** Versi aturan penilaian kasus; naik bila kunci diperbaiki (dicatat di tiap percobaan agar hasil lama bisa ditelusuri). */

/** Mode ditentukan CARA MASUK (ada kegiatan atau tidak), bukan pilihan petugas. */
export const modeMasuk = (kegiatanId: number | null | undefined): ModeMasuk => (Number.isInteger(kegiatanId) && (kegiatanId as number) > 0 ? "tercatat" : "bebas");

export type Muatan = {
  kegiatan: number;
  kasus: string;
  isian: Nilai;
  petunjuk: number;
  lihatJawaban: boolean;
  durasiDtk: number;
  /** Berapa kali kalkulator (ekspresi) dipakai sejak kiriman sebelumnya; hanya cacahan. */
  kalkulator: number;
};

export type HasilBaca = { ok: true; muatan: Muatan; kasus: Kasus } | { ok: false; pesan: string };

const adalahObjek = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const bulat = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && Number.isInteger(x) ? x : null);

/** Membaca dan membersihkan muatan dari JSON tak tepercaya. Sel tidak dikenal ditolak; nilai nol dibuang (sel kosong = tidak ada di peta). */
export function bacaMuatan(x: unknown): HasilBaca {
  if (!adalahObjek(x)) return { ok: false, pesan: "Muatan tidak sah." };
  const kegiatan = bulat(x.kegiatan);
  if (kegiatan === null || kegiatan < 1) return { ok: false, pesan: "Kegiatan tidak sah. Simulasi bebas tidak dicatat; periksa di perangkat." };
  const kode = typeof x.kasus === "string" ? x.kasus.trim().toUpperCase() : "";
  const kasus = cariKasus(kode);
  if (!kasus) return { ok: false, pesan: "Kasus tidak dikenal." };
  const mentah = x.isian;
  if (!adalahObjek(mentah)) return { ok: false, pesan: "Isian tidak sah." };
  const kunci = Object.keys(mentah);
  if (kunci.length > MAKS_SEL) return { ok: false, pesan: "Isian terlalu banyak." };
  const isian: Nilai = {};
  for (const k of kunci) {
    if (!selDikenal(k)) return { ok: false, pesan: `Kotak tidak dikenal: ${k.slice(0, 40)}.` };
    const v = mentah[k];
    if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > MAKS_NILAI) return { ok: false, pesan: "Nilai isian harus bilangan bulat nol atau lebih." };
    if (v !== 0) isian[k] = v;
  }
  const petunjuk = bulat(x.petunjuk ?? 0);
  if (petunjuk === null || petunjuk < 0 || petunjuk > MAKS_PETUNJUK) return { ok: false, pesan: "Jumlah petunjuk tidak sah." };
  const durasi = bulat(x.durasiDtk ?? 0);
  if (durasi === null || durasi < 0 || durasi > MAKS_DURASI_DTK) return { ok: false, pesan: "Durasi tidak sah." };
  if (x.lihatJawaban !== undefined && typeof x.lihatJawaban !== "boolean") return { ok: false, pesan: "Isian tidak sah." };
  const kalk = bulat(x.kalkulator ?? 0);
  if (kalk === null || kalk < 0 || kalk > MAKS_KALKULATOR) return { ok: false, pesan: "Cacahan kalkulator tidak sah." };
  return { ok: true, kasus, muatan: { kegiatan, kasus: kasus.kode, isian, petunjuk, lihatJawaban: x.lihatJawaban === true, durasiDtk: durasi, kalkulator: kalk } };
}

export type BarisKesalahan = { sel: string | null; jenis: JenisKesalahan; tingkat: Tingkat; nilai_petugas: number | null; nilai_benar: number | null };

export type RingkasanPercobaan = {
  benar: boolean;
  bintang: number;
  kesalahan: BarisKesalahan[];
  jmlSalah: number;
  jmlFatal: number;
  /** Pesan koreksi untuk petugas (urutan seperti evaluasi). */
  koreksi: { k: string | null; m: string; jenis: JenisKesalahan; tingkat: Tingkat }[];
  pemeriksaan: { ok: boolean; info?: boolean; t: string }[];
};

/**
 * Menilai ulang satu percobaan di server. `nomor` = urutan percobaan petugas pada kasus ini (1 = pertama).
 * "Lihat jawaban" tidak pernah dihitung benar dan bernilai 0 bintang.
 */
export function ringkasPercobaan(kasus: Kasus, m: Pick<Muatan, "isian" | "petunjuk" | "lihatJawaban">, nomor: number): RingkasanPercobaan {
  const { benar: benarMurni, evaluasi, pemeriksaan } = kasusBenar(kasus, m.isian);
  const benar = benarMurni && !m.lihatJawaban;
  const baris = new Map(evaluasi.rows.map((r) => [r.k, r]));
  const kesalahan: BarisKesalahan[] = evaluasi.fb.map((f) => {
    const r = f.k ? baris.get(f.k) : undefined;
    return { sel: f.k, jenis: f.jenis, tingkat: f.tingkat, nilai_petugas: r ? r.u : null, nilai_benar: r ? r.e : null };
  });
  // Pemeriksaan engine yang gagal (kontrol VII, diskrepansi) ikut dicatat sebagai kesalahan tanpa kotak tertentu.
  for (const p of pemeriksaan) if (!p.ok && !p.info && p.jenis) kesalahan.push({ sel: null, jenis: p.jenis, tingkat: p.tingkat ?? "fatal", nilai_petugas: null, nilai_benar: null });
  const bintang = benar ? hitungBintang({ petunjuk: m.petunjuk, percobaan: nomor, lihatJawaban: false }) : 0;
  return {
    benar,
    bintang,
    kesalahan,
    jmlSalah: kesalahan.length,
    jmlFatal: kesalahan.filter((x) => x.tingkat === "fatal").length,
    koreksi: evaluasi.fb.map((f) => ({ k: f.k, m: f.m, jenis: f.jenis, tingkat: f.tingkat })),
    pemeriksaan: pemeriksaan.map((p) => ({ ok: p.ok, info: p.info, t: p.t })),
  };
}

export type BarisPercobaan = {
  kegiatan_id: number;
  akun_id: number;
  kasus: string;
  versi: number;
  mode: "latihan" | "uji";
  nomor: number;
  petunjuk: number;
  lihat_jawaban: boolean;
  benar: boolean;
  bintang: number;
  jml_salah: number;
  jml_fatal: number;
  durasi_dtk: number;
  isian: Nilai;
};

/** Baris siap simpan. `mode` default "latihan": mode "uji" menyusul bersama pengaturan kegiatan (V3). */
export function barisPercobaan(akunId: number, m: Muatan, r: RingkasanPercobaan, nomor: number, mode: "latihan" | "uji" = "latihan"): BarisPercobaan {
  return {
    kegiatan_id: m.kegiatan, akun_id: akunId, kasus: m.kasus, versi: VERSI_KASUS, mode, nomor, petunjuk: m.petunjuk, lihat_jawaban: m.lihatJawaban,
    benar: r.benar, bintang: r.bintang, jml_salah: r.jmlSalah, jml_fatal: r.jmlFatal, durasi_dtk: m.durasiDtk, isian: m.isian,
  };
}

export const barisKesalahan = (percobaanId: number, akunId: number, m: Muatan, r: RingkasanPercobaan) =>
  r.kesalahan.map((k) => ({ percobaan_id: percobaanId, kegiatan_id: m.kegiatan, akun_id: akunId, kasus: m.kasus, ...k }));

/** Jumlah kesalahan per jenis (urut terbanyak; seri menurut nama jenis) dari baris kesalahan seorang petugas. Dipakai saran Latihan kesalahan saya. */
export function ringkasLemah(baris: { jenis: string }[]): { jenis: JenisKesalahan; jumlah: number }[] {
  const n = new Map<string, number>();
  for (const b of baris) n.set(b.jenis, (n.get(b.jenis) ?? 0) + 1);
  return [...n].map(([jenis, jumlah]) => ({ jenis: jenis as JenisKesalahan, jumlah })).sort((a, b) => b.jumlah - a.jumlah || a.jenis.localeCompare(b.jenis));
}

/** Ringkasan riwayat per kasus dari baris percobaan (urutan bebas): jumlah percobaan, sudah benar, bintang terbaik. */
export type RiwayatKasus = { kasus: string; percobaan: number; benar: boolean; bintang: number };
export function ringkasRiwayat(baris: { kasus: string; benar: boolean; bintang: number }[]): RiwayatKasus[] {
  const peta = new Map<string, RiwayatKasus>();
  for (const b of baris) {
    const r = peta.get(b.kasus) ?? { kasus: b.kasus, percobaan: 0, benar: false, bintang: 0 };
    r.percobaan += 1;
    if (b.benar) r.benar = true;
    r.bintang = Math.max(r.bintang, b.bintang);
    peta.set(b.kasus, r);
  }
  return [...peta.values()].sort((a, b) => a.kasus.localeCompare(b.kasus));
}
