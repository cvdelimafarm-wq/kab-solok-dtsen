// lib/alurPelatihan.ts  (murni; dipakai klien. Tanpa React/DB supaya mudah diuji)
//
// (2 Nov 2026) ALUR LANGKAH PELATIHAN DI HP -- permintaan user: "bagaimana dengan tahapan pelatihan di HP?". Halaman Langkah sudah punya daftar bernomor,
// tetapi halaman yang dibuka dari langkah (Undangan, Instrumen, Pretest, Posttest) tidak menunjukkan sedang di langkah ke berapa dan tidak ada
// tombol Sebelumnya/Berikutnya. Berkas ini SATU-SATUNYA tempat yang menentukan urutan dan status langkah (selesai / terlewat / bisa dikerjakan),
// dipakai oleh halaman Langkah (page.tsx) dan oleh Kerangka halaman-halaman lain, supaya status di semua halaman selalu sama.
//
// Urutan: 1 undangan · 2 instrumen · 3 pretest · 4 presensi · (Adu Sigap, tambahan, bila admin membuat kuis) · (foto sebelum posttest, bila kelas perlu foto)
//         · posttest · (foto sesudah posttest). Aturan status disalin dari page.tsx lama tanpa perubahan arti.

import { bagiFoto, keadaanHari, type PengaturanPresensi, type RingkasHari } from "./sigapPresensi";
import { posisiAlur, type PosisiAlur, type TahapAlur } from "./alurKelola";

export type KodeLangkah = "undangan" | "instrumen" | "pretest" | "hadir" | "sesi" | "kuis" | "foto_awal" | "posttest" | "foto_akhir";

export type StatusLangkah = "selesai" | "terlewat" | "sekarang" | "menyusul";

export type LangkahPelatihan = {
  kode: KodeLangkah;
  /** Judul panjang di daftar Langkah ("Kerjakan Pretest"). */
  judul: string;
  /** Nama pendek untuk lajur ikon dan tombol ("Pretest"). */
  singkat: string;
  selesai: boolean;
  terlewat: boolean;
  /** Bisa dikerjakan sekarang (tes dibuka, presensi dibuka, hari pelatihan untuk foto, dst.). */
  bisaSekarang: boolean;
  /** Langkah tambahan: tidak dihitung dalam progres dan "semua selesai". */
  tambahan: boolean;
  /** Halaman sendiri (true) atau bagian dari halaman Langkah (false: presensi, Adu Sigap, foto). */
  halaman: boolean;
  /** Tujuan tautan: halaman sendiri, atau halaman Langkah dengan ?langkah=<kode> (digulirkan ke kartunya). */
  href: string;
  /** (2 Nov 2026) Terhalang tahapan sebelumnya (blokir tahapan): tidak "bisaSekarang" sampai tahapan itu tuntas atau kunci dibuka. */
  terkunci?: boolean;
};

export type MasukanLangkah = {
  langkah: { undangan_dibuka: boolean; instrumen_diunduh: boolean; foto_total: number; slot: number[] } | null;
  tes: { jenis: string; status: string; /** (2 Nov 2026) terisi bila tes ini terkunci oleh blokir tahapan. */ terkunci?: unknown | null }[];
  presensi: { sudah: boolean; hari: RingkasHari; pengaturan: Partial<Pick<PengaturanPresensi, "susulan_sampai">> } | null;
  kuis: { pernah_ikut: boolean; ada_ruang_selesai: boolean; ada_ruang_aktif: boolean } | null;
  /**
   * (3 Nov 2026) Absen sesi (tab Hari ini): ringkasan sesi hari ini. Diisi HANYA pada tampilan lima tab; null/tidak diisi = langkah "Absen sesi" tidak ada.
   * `total` = sesi hari ini untuk kelas peserta, `hadir` = yang tercatat hadir, `terbukaBelum` = sesi yang sedang dibuka dan belum diisi.
   */
  absenSesi?: { total: number; hadir: number; terbukaBelum: number } | null;
  /** Kelas luring/hybrid/belum tertaut = true; kelas Daring = false (tanpa foto Transport Lokal). */
  fotoTranslok: boolean;
  /** Jam mulai pelatihan (ms epoch); langkah foto "menyala" sejak saat ini. */
  mulaiMs: number;
  now: number;
};

export const ALAMAT_LANGKAH = "/sigap/pelatihan";

/** (3 Nov 2026) Ringkasan kuis "belum ada ruang": tampilan lima tab tetap memunculkan langkah Adu Sigap (status Menyusul) walau panitia belum membuat kuis. */
export const KUIS_BELUM_ADA = { pernah_ikut: false, ada_ruang_selesai: false, ada_ruang_aktif: false } as const;
const alamatDalamLangkah = (kode: KodeLangkah) => `${ALAMAT_LANGKAH}?langkah=${kode}`;

/** Jam mulai & selesai pelatihan (ms epoch) dari tanggal_iso + "pukul" undangan, mis. "08.00–16.00 WIB". Bawaan 08.00-16.00. */
export function jendelaPelatihan(u: { pukul: unknown; tanggal_iso: string }): { mulai: number; selesai: number } {
  const m = String(u.pukul).match(/(\d{1,2})[.:](\d{2})\s*[–-]\s*(\d{1,2})[.:](\d{2})/);
  const [h1, m1, h2, m2] = m ? [m[1], m[2], m[3], m[4]] : ["8", "00", "16", "00"];
  const at = (h: string, mm: string) => new Date(`${u.tanggal_iso}T${h.padStart(2, "0")}:${mm}:00+07:00`).getTime();
  return { mulai: at(h1, m1), selesai: at(h2, m2) };
}

export function hitungLangkahPelatihan(m: MasukanLangkah): LangkahPelatihan[] {
  const L = m.langkah;
  const tes = (jenis: "pretest" | "posttest") => m.tes.find((t) => t.jenis === jenis);
  const dasar = (kode: KodeLangkah, judul: string, singkat: string, halaman: boolean, href: string): LangkahPelatihan => ({
    kode,
    judul,
    singkat,
    selesai: false,
    terlewat: false,
    bisaSekarang: false,
    tambahan: false,
    halaman,
    href,
  });
  const langkahTes = (jenis: "pretest" | "posttest", judul: string, singkat: string): LangkahPelatihan => {
    const t = tes(jenis);
    const terkunci = !!t?.terkunci;
    return {
      ...dasar(jenis, judul, singkat, true, `${ALAMAT_LANGKAH}/tes/${jenis}`),
      selesai: t?.status === "selesai",
      terlewat: t?.status === "terlewat",
      bisaSekarang: (t?.status === "buka" || t?.status === "mengerjakan") && !terkunci,
      ...(terkunci ? { terkunci: true } : {}),
    };
  };
  const hasil: LangkahPelatihan[] = [
    { ...dasar("undangan", "Baca undangan", "Undangan", true, `${ALAMAT_LANGKAH}/undangan`), selesai: !!L?.undangan_dibuka, bisaSekarang: true },
    { ...dasar("instrumen", "Pelajari instrumen", "Instrumen", true, `${ALAMAT_LANGKAH}/instrumen`), selesai: !!L?.instrumen_diunduh, bisaSekarang: true },
    langkahTes("pretest", "Kerjakan Pretest", "Pretest"),
  ];

  // presensi: terlewat = ada sesi hari ini yang lewat tanpa tercatat dan tidak ada sesi lain yang masih bisa; sekarang = ada sesi dibuka atau susulan terbuka
  const p = m.presensi;
  const kh = p ? keadaanHari(p.hari, m.now) : null;
  hasil.push({
    ...dasar("hadir", "Presensi di lokasi pelatihan", "Presensi", false, alamatDalamLangkah("hadir")),
    selesai: !!p?.sudah,
    terlewat: !!p && !!kh && !kh.lengkap && !kh.aktif && !kh.berikutnya,
    bisaSekarang: !!p && !!kh && (!!kh.aktif || keadaanHari(p.hari, m.now, p.pengaturan.susulan_sampai).susulan.length > 0),
  });

  // (3 Nov 2026) Absen sesi: tambahan (tidak dihitung dalam progres); selalu tampil di tampilan lima tab walau panitia belum membuka sesi apa pun.
  if (m.absenSesi) {
    const a = m.absenSesi;
    hasil.push({
      ...dasar("sesi", "Absen sesi pelatihan", "Absen sesi", true, `${ALAMAT_LANGKAH}/hari-ini?langkah=sesi`),
      selesai: a.total > 0 && a.hadir >= a.total && a.terbukaBelum === 0,
      bisaSekarang: a.terbukaBelum > 0,
      tambahan: true,
    });
  }

  if (m.kuis) {
    hasil.push({
      ...dasar("kuis", "Ikuti Adu Sigap", "Adu Sigap", false, alamatDalamLangkah("kuis")),
      selesai: m.kuis.pernah_ikut,
      terlewat: !m.kuis.pernah_ikut && m.kuis.ada_ruang_selesai && !m.kuis.ada_ruang_aktif,
      bisaSekarang: m.kuis.ada_ruang_aktif,
      tambahan: true,
    });
  }

  const fotoTotal = L?.foto_total ?? 5;
  const { awal, akhir } = bagiFoto(fotoTotal);
  const langkahFoto = (kode: "foto_awal" | "foto_akhir", slotIni: number[], judul: string, singkat: string): LangkahPelatihan => {
    const ada = slotIni.filter((sl) => L?.slot.includes(sl)).length;
    return { ...dasar(kode, judul, singkat, false, alamatDalamLangkah(kode)), selesai: slotIni.length > 0 && ada >= slotIni.length, bisaSekarang: m.now >= m.mulaiMs };
  };
  if (m.fotoTranslok && awal.length) hasil.push(langkahFoto("foto_awal", awal, `Unggah ${awal.length} foto sebelum Posttest`, "Foto awal"));
  hasil.push(langkahTes("posttest", "Kerjakan Posttest", "Posttest"));
  if (m.fotoTranslok && akhir.length) hasil.push(langkahFoto("foto_akhir", akhir, `Unggah ${akhir.length} foto sesudah Posttest`, "Foto akhir"));
  return hasil;
}

/**
 * Status tampilan tiap langkah (urutan sama dengan `daftar`): selesai / terlewat / sekarang (bisa dikerjakan, atau langkah wajib pertama
 * yang belum selesai = "Berikutnya") / menyusul. Aturan persis halaman Langkah.
 */
export function statusLangkah(daftar: readonly LangkahPelatihan[]): StatusLangkah[] {
  const pertama = daftar.findIndex((l) => !l.selesai && !l.terlewat && !l.tambahan);
  return daftar.map((l, i) => {
    if (l.selesai) return "selesai";
    if (l.terlewat) return "terlewat";
    if (l.bisaSekarang) return "sekarang";
    if (i === pertama) return "sekarang";
    return "menyusul";
  });
}

/** Ringkasan progres: langkah wajib saja (tambahan tidak dihitung). */
export function progresLangkah(daftar: readonly LangkahPelatihan[]): { selesai: number; wajib: number; semua: boolean } {
  const wajib = daftar.filter((l) => !l.tambahan);
  const selesai = wajib.filter((l) => l.selesai).length;
  return { selesai, wajib: wajib.length, semua: wajib.length > 0 && selesai === wajib.length };
}

/** Langkah dibuat sebagai alur umum (label "n · Nama") supaya memakai posisiAlur dan tombol Sebelumnya/Berikutnya yang sama dengan halaman Kelola. */
export function alurDariLangkah(daftar: readonly LangkahPelatihan[]): TahapAlur[] {
  return daftar.map((l, i) => ({ kode: l.kode, label: `${i + 1} · ${l.singkat}`, href: l.href, ikon: l.kode }));
}

export function posisiLangkah(daftar: readonly LangkahPelatihan[], aktif: string): PosisiAlur | null {
  return posisiAlur(alurDariLangkah(daftar), aktif);
}

/** "Langkah 3 dari 8 · Pretest". */
export const teksLangkah = (p: PosisiAlur): string => `Langkah ${p.no ?? p.indeks + 1} dari ${p.total} · ${p.nama}`;

const TEKS_STATUS: Record<StatusLangkah, string> = { selesai: "Selesai", terlewat: "Terlewat", sekarang: "Sekarang", menyusul: "Menyusul" };
export const teksStatusLangkah = (s: StatusLangkah): string => TEKS_STATUS[s];

/**
 * Catatan kuning di atas tombol Berikutnya bila langkah berikutnya belum saatnya ("Pretest belum bisa dikerjakan sekarang. Buka saja untuk melihat jadwalnya.").
 * Tidak memblokir: tombol tetap bisa dipakai. null bila tidak perlu.
 */
export function catatanBerikutnya(daftar: readonly LangkahPelatihan[], aktif: string): string | null {
  const i = daftar.findIndex((l) => l.kode === aktif);
  if (i < 0 || i >= daftar.length - 1) return null;
  const st = statusLangkah(daftar);
  const b = daftar[i + 1];
  if (st[i + 1] !== "menyusul") return null;
  return `${b.singkat} belum bisa dikerjakan sekarang. Buka saja untuk melihat jadwal atau syaratnya.`;
}

const KODE_VALID: readonly string[] = ["undangan", "instrumen", "pretest", "hadir", "sesi", "kuis", "foto_awal", "posttest", "foto_akhir"];
/** Nilai ?langkah= dari alamat -> kode yang dikenal, selain itu null (alamat sembarangan tidak boleh dipakai mencari elemen). */
export function bacaLangkahDariAlamat(q: string | null | undefined): KodeLangkah | null {
  return q && KODE_VALID.includes(q) ? (q as KodeLangkah) : null;
}
