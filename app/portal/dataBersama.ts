"use client";

// app/portal/dataBersama.ts
//
// (10 Okt 2026) Simpanan data bersama di HP untuk semua layer (Beranda -> tahapan -> tahap -> halaman kerja) -- permintaan user:
// "proses loading dari satu layer ke layer berikut sangat lama". Prinsip (aplikasi ini lebih banyak MENGIRIM daripada menerima, isinya jarang berubah):
//  - data terakhir SELALU langsung tampil (stale-while-revalidate), lalu diperbarui diam-diam di belakang bila sudah lebih tua dari `segarMs`;
//  - data disimpan di localStorage, jadi bertahan saat aplikasi ditutup / HP dimatikan: buka aplikasi = langsung tampil, bahkan tanpa sinyal;
//  - tiap jenis data punya umur "segar" sendiri (PROFIL di bawah). Data tampil tetap instan berapa pun umurnya; `segarMs` hanya mengatur
//    seberapa sering diminta ulang ke server. Info yang perlu cepat (tugas terlewat dll) boleh tertunda ±10 menit -- jawaban user;
//  - permintaan yang sama yang sedang berjalan dibagi (tidak ganda); semua API satu halaman dipanggil BERSAMAAN;
//  - penulisan lewat apiPortal menandai kedaluwarsa HANYA data yang berkaitan (ATURAN_TULIS), bukan semuanya; hasil yang baru disimpan bisa
//    langsung ditulis ke simpanan (ubahCache) tanpa menunggu server;
//  - deploy TIDAK membuang simpanan. Tiap jenis data punya nomor `skema`: naikkan HANYA bila bentuk/arti jawaban API-nya berubah, maka hanya
//    jenis itu yang diambil ulang -- permintaan user (banyak deploy kecil: perbarui area yang berkaitan saja);
//  - milik satu akun: ganti akun -> simpanan akun lain tidak dipakai; keluar -> dibuang (sesi.ts).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { apiPortal, bacaSesi, KUNCI_SIMPAN_DATA, pemilikSesi, pendengarTulis } from "./sesi";

const MENIT = 60_000;
const HARI = 24 * 60 * MENIT;

export type Profil = {
  /** data lebih muda dari ini tidak diminta ulang saat halaman dibuka */
  segarMs: number;
  /** muat ulang berkala saat layar terlihat (0 = mati) */
  interval: number;
  /** data lebih tua dari ini dibuang (tidak ditampilkan lagi) */
  umurMaksMs: number;
  /** dianggap basi bila tanggal (WIB) sudah berganti sejak diambil -- untuk data yang bergantung pada "hari ini" */
  hariBaru: boolean;
  /** NAIKKAN bila bentuk/arti jawaban API ini berubah di sebuah deploy; simpanan lama jenis ini otomatis diabaikan */
  skema: number;
};

const dasar = { umurMaksMs: 14 * HARI, hariBaru: false, skema: 1 };
/** Cocok awalan terpanjang. Tanpa kecocokan -> bawaan. */
const PROFIL: [string, Profil][] = [
  // berubah menit ke menit (presensi, jendela tes, kuis live) -> sering diminta ulang; tampil tetap instan
  ["/api/sigap/pelatihan", { ...dasar, segarMs: 1 * MENIT, interval: 1 * MENIT }],
  // tugas/tahapan terlewat boleh tertunda ±10 menit; status "mendesak" bergantung hari -> ikut basi saat ganti hari
  ["/api/portal/induk", { ...dasar, segarMs: 10 * MENIT, interval: 10 * MENIT, hariBaru: true }],
  ["/api/portal/kegiatan", { ...dasar, segarMs: 10 * MENIT, interval: 10 * MENIT, hariBaru: true }],
  // kartu menurut peran & periode: jarang berubah
  // (11 Okt 2026) skema 2: jawaban menambah peran_chip (chip peran = nama ubin tujuan) -> simpanan lama diambil ulang
  ["/api/portal/beranda", { ...dasar, segarMs: 30 * MENIT, interval: 30 * MENIT, skema: 2 }],
  // daftar Sub SLS/KK praktis tetap; status identifikasi & laporan boleh tertunda ±10 menit
  ["/api/portal/wilayah-tim", { ...dasar, segarMs: 10 * MENIT, interval: 10 * MENIT }],
  ["/api/portal/identifikasi", { ...dasar, segarMs: 10 * MENIT, interval: 10 * MENIT }],
];
const PROFIL_BAWAAN: Profil = { ...dasar, segarMs: 1 * MENIT, interval: 2 * MENIT };

export function profilDari(path: string): Profil {
  const jalur = path.split("?")[0];
  let terbaik: [string, Profil] | null = null;
  for (const p of PROFIL) if (jalur.startsWith(p[0]) && (!terbaik || p[0].length > terbaik[0].length)) terbaik = p;
  return terbaik ? terbaik[1] : PROFIL_BAWAAN;
}

/** Penulisan ke path (kiri) membuat data di daftar (kanan) ditandai kedaluwarsa. Path tak dikenal -> semua data bergantung-aksi (lihat tandaBasi). */
const ATURAN_TULIS: [string, string[]][] = [
  ["/api/portal/identifikasi", ["/api/portal/identifikasi", "/api/portal/induk", "/api/portal/wilayah-tim"]],
  ["/api/sigap/pelatihan", ["/api/sigap/pelatihan"]],
  ["/api/portal/sso", []],
];

type Entri = { data: unknown; at: number; tiba: number; sk: number; basi?: boolean };
type Simpanan = { f: 1; pemilik: number; e: Record<string, Entri> };

const memori = new Map<string, Entri>();
const terbang = new Map<string, Promise<unknown>>();
const pendengar = new Map<string, Set<() => void>>();
const tumpukan = new Map<string, (data: unknown) => unknown>();
let pemilikMemori: number | null | undefined;
let jadwalSimpan: ReturnType<typeof setTimeout> | null = null;
const MAKS_SIMPAN_KARAKTER = 2_500_000;

const useTataLetak = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const hariWib = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);

/** Pastikan isi memori milik akun yang sedang masuk; muat dari localStorage bila baru. */
function pastikanPemilik() {
  if (typeof window === "undefined") return;
  const p = pemilikSesi();
  if (p === pemilikMemori) return;
  pemilikMemori = p;
  memori.clear();
  if (!p) return;
  try {
    const raw = localStorage.getItem(KUNCI_SIMPAN_DATA);
    if (!raw) return;
    const obj = JSON.parse(raw) as Simpanan;
    if (obj.f !== 1 || obj.pemilik !== p) return; // milik akun lain / format lain -> abaikan
    const kini = Date.now();
    for (const [k, v] of Object.entries(obj.e)) {
      const pr = profilDari(k);
      if (v && typeof v.at === "number" && typeof v.tiba === "number" && v.sk === pr.skema && kini - v.tiba <= pr.umurMaksMs) memori.set(k, v);
    }
  } catch {
    /* abaikan: tanpa simpanan tetap jalan */
  }
}

function tulisSekarang() {
  jadwalSimpan = null;
  try {
    // (11 Okt 2026) Perbaikan audit: label pemilik = pemilik isi memori, BUKAN sesi saat menulis. Bila sesi sudah berganti (ganti akun lalu halaman
    // ditutup/pagehide), isi memori milik akun lama tidak boleh ditulis atas nama akun baru.
    const p = pemilikMemori;
    if (!p || p !== pemilikSesi()) return;
    const urut = Array.from(memori.entries()).sort((a, b) => b[1].tiba - a[1].tiba);
    const obj: Simpanan = { f: 1, pemilik: p, e: {} };
    let teks = "";
    // muat sebanyak mungkin dari yang terbaru; bila terlalu besar, yang paling lama dilepas
    while (urut.length) {
      obj.e = Object.fromEntries(urut);
      teks = JSON.stringify(obj);
      if (teks.length <= MAKS_SIMPAN_KARAKTER) break;
      urut.pop();
    }
    localStorage.setItem(KUNCI_SIMPAN_DATA, teks || JSON.stringify({ f: 1, pemilik: p, e: {} }));
  } catch {
    /* penyimpanan penuh / diblokir: abaikan */
  }
}

function jadwalkanSimpan() {
  if (typeof window === "undefined" || jadwalSimpan) return;
  jadwalSimpan = setTimeout(tulisSekarang, 800);
}
if (typeof window !== "undefined") {
  // jangan hilang bila aplikasi ditutup tiba-tiba
  window.addEventListener("pagehide", () => {
    if (jadwalSimpan) {
      clearTimeout(jadwalSimpan);
      tulisSekarang();
    }
  });
}

function beritahu(path: string) {
  pendengar.get(path)?.forEach((f) => f());
}

export type IsiCache<T> = { data: T; at: number; tiba: number };

/** Data tersimpan untuk akun yang sedang masuk (null bila tidak ada). */
export function bacaCache<T>(path: string): IsiCache<T> | null {
  pastikanPemilik();
  const e = memori.get(path);
  if (!e) return null;
  return { data: e.data as T, at: e.at, tiba: e.tiba };
}

/** Basi = lebih tua dari `segarMs`, ditandai kedaluwarsa oleh penulisan terkait, atau (untuk data bergantung-hari) tanggal sudah berganti. */
export function basi(path: string, segarMs?: number): boolean {
  pastikanPemilik();
  const e = memori.get(path);
  if (!e) return true;
  const pr = profilDari(path);
  if (e.basi) return true;
  if (Date.now() - e.tiba > (segarMs ?? pr.segarMs)) return true;
  if (pr.hariBaru && hariWib(e.tiba) !== hariWib(Date.now())) return true;
  return false;
}

/** Ambil dari server (berbagi permintaan yang sedang berjalan). Selalu memperbarui simpanan. */
export function muatData<T>(path: string): Promise<T> {
  const sesi = bacaSesi();
  if (!sesi) return Promise.reject(new Error("SESI_BERAKHIR"));
  pastikanPemilik();
  const kunci = `${sesi}|${path}`;
  const ada = terbang.get(kunci);
  if (ada) return ada as Promise<T>;
  const mulai = Date.now();
  const pemilikAwal = pemilikMemori;
  const janji = apiPortal<T>(path)
    .then((data) => {
      // (11 Okt 2026) jawaban tiba setelah akun berganti -> jangan masuk simpanan akun yang baru
      if (pemilikAwal !== pemilikSesi()) return data;
      // tumpuk perubahan lokal yang belum terkirim (antreanKirim.ts) supaya tidak "mundur" ke data server yang lama
      const jadi = (tumpukan.get(path.split("?")[0])?.(data) ?? data) as T;
      memori.set(path, { data: jadi, at: mulai, tiba: Date.now(), sk: profilDari(path).skema });
      jadwalkanSimpan();
      beritahu(path);
      return jadi;
    })
    .finally(() => {
      terbang.delete(kunci);
    });
  terbang.set(kunci, janji);
  return janji;
}

/** Ambil bila belum ada / sudah basi; selain itu pakai simpanan. Dipakai prefetch. */
export async function siapkanData<T>(path: string, segarMs?: number): Promise<T> {
  const c = bacaCache<T>(path);
  if (c && !basi(path, segarMs)) return c.data;
  return muatData<T>(path);
}

/** Ubah data tersimpan di tempat (mis. hasil yang baru disimpan) tanpa menunggu server; tanda "segar" tidak berubah. */
export function ubahCache<T>(path: string, f: (data: T) => T): boolean {
  pastikanPemilik();
  const e = memori.get(path);
  if (!e) return false;
  try {
    memori.set(path, { ...e, data: f(e.data as T) });
  } catch {
    return false;
  }
  jadwalkanSimpan();
  beritahu(path);
  return true;
}

/** Tandai kedaluwarsa semua simpanan berawalan `awalan` (dimuat ulang di belakang saat dibuka; tampilannya tetap ada). */
export function tandaBasi(awalan: string) {
  pastikanPemilik();
  for (const [k, v] of memori) if (k.startsWith(awalan)) memori.set(k, { ...v, basi: true });
  jadwalkanSimpan();
}

/** Daftarkan penumpuk perubahan lokal untuk satu path (dipakai antreanKirim.ts). */
export function daftarkanTumpuk(path: string, f: (data: unknown) => unknown) {
  tumpukan.set(path, f);
}

// penulisan berhasil -> hanya data yang berkaitan ditandai kedaluwarsa
pendengarTulis.add((jalur) => {
  const aturan = ATURAN_TULIS.find(([w]) => jalur.startsWith(w));
  if (aturan) {
    for (const t of aturan[1]) tandaBasi(t);
    return;
  }
  // tak dikenal: tandai semua kecuali yang tidak bergantung aksi (hanya kedaluwarsa; tampilan tidak berubah)
  tandaBasi("/api/");
});

function langganan(path: string, f: () => void): () => void {
  let s = pendengar.get(path);
  if (!s) pendengar.set(path, (s = new Set()));
  s.add(f);
  return () => {
    s!.delete(f);
  };
}

export type OpsiData = {
  /** menimpa profil: data lebih muda dari ini tidak diminta ulang saat halaman dibuka */
  segarMs?: number;
  /** menimpa profil: muat ulang berkala saat layar terlihat (0 = mati) */
  interval?: number;
  /** false = jangan memuat dari server (simpanan tetap dibaca) */
  aktif?: boolean;
};

export type HasilData<T> = {
  data: T | null;
  /** pesan galat dari muat terakhir (null bila berhasil). "SESI_BERAKHIR" = sesi habis -> pemanggil mengarahkan ke login */
  galat: string | null;
  /** true selama belum ada data sama sekali */
  memuat: boolean;
  /** waktu HP (ms) saat data ini selesai diterima -- untuk menghitung selisih jam server */
  tiba: number;
  /** paksa muat ulang sekarang */
  muat: () => Promise<void>;
};

/** Hook: tampilkan data tersimpan seketika, perbarui di belakang. */
export function useData<T>(path: string, opsi: OpsiData = {}): HasilData<T> {
  const pr = profilDari(path);
  const segarMs = opsi.segarMs ?? pr.segarMs;
  const interval = opsi.interval ?? pr.interval;
  const aktif = opsi.aktif ?? true;
  const [isi, setIsi] = useState<IsiCache<T> | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const hidup = useRef(true);

  const salin = useCallback(() => {
    const c = bacaCache<T>(path);
    if (c) setIsi((lama) => (lama && lama.tiba === c.tiba && lama.data === c.data ? lama : c));
  }, [path]);

  const muat = useCallback(async () => {
    try {
      await muatData<T>(path);
      if (hidup.current) setGalat(null);
    } catch (e) {
      if (hidup.current) setGalat(e instanceof Error ? e.message : "Gagal memuat.");
    }
  }, [path]);

  // tampilkan simpanan SEBELUM digambar pertama kali (tanpa kerangka abu-abu kalau data sudah ada)
  useTataLetak(() => {
    hidup.current = true;
    setIsi(null);
    salin();
    return langganan(path, salin);
  }, [path, salin]);

  useEffect(() => {
    hidup.current = true;
    if (!aktif) return;
    if (basi(path, segarMs)) void muat();
    const kali = interval
      ? setInterval(() => {
          if (document.visibilityState === "visible" && basi(path, segarMs)) void muat();
        }, Math.max(interval, 30_000))
      : null;
    const c = () => {
      if (document.visibilityState === "visible" && basi(path, segarMs)) void muat();
    };
    document.addEventListener("visibilitychange", c);
    window.addEventListener("online", c);
    return () => {
      hidup.current = false;
      if (kali) clearInterval(kali);
      document.removeEventListener("visibilitychange", c);
      window.removeEventListener("online", c);
    };
  }, [path, aktif, segarMs, interval, muat]);

  return { data: isi?.data ?? null, galat, memuat: !isi && !galat, tiba: isi?.tiba ?? 0, muat };
}
