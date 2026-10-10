"use client";

// app/portal/dataBersama.ts
//
// (10 Okt 2026) Simpanan data bersama di HP untuk semua layer (Beranda -> tahapan -> tahap -> halaman kerja) -- permintaan user:
// "proses loading dari satu layer ke layer berikut sangat lama". Sebelumnya tiap halaman memuat ulang semua API dari nol dan menampilkan
// kerangka abu-abu sampai selesai. Sekarang:
//  - data terakhir langsung tampil (stale-while-revalidate), lalu diperbarui diam-diam di belakang bila sudah lebih tua dari `segarMs`;
//  - permintaan yang sama yang sedang berjalan dibagi (tidak ganda), semua API di satu halaman dipanggil BERSAMAAN;
//  - disimpan juga di sessionStorage (bertahan saat muat ulang tab) dan terikat pada sesi: ganti akun / "masuk sebagai" otomatis tak memakai data lama;
//  - penulisan lewat apiPortal (POST/PUT/DELETE) menandai semua simpanan kedaluwarsa, jadi halaman yang dibuka setelah menyimpan memuat ulang di belakang.
// Hanya data baca-saja milik akun yang sedang masuk; dihapus saat keluar (sesi.ts: hapusSemuaSesi).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { apiPortal, bacaSesi, KUNCI_SIMPAN_DATA, waktuTulisTerakhir } from "./sesi";

type Entri = { sesi: string; data: unknown; at: number; tiba: number };

const memori = new Map<string, Entri>();
const terbang = new Map<string, Promise<unknown>>();
const pendengar = new Map<string, Set<() => void>>();
let sudahMuatSimpan = false;
let jadwalSimpan: ReturnType<typeof setTimeout> | null = null;

const MAKS_SIMPAN_KARAKTER = 600_000;
/** Data lebih muda dari ini dianggap segar: tidak diminta ulang saat pindah halaman. */
export const SEGAR_MS = 10_000;

const useTataLetak = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function muatSimpan() {
  if (sudahMuatSimpan || typeof window === "undefined") return;
  sudahMuatSimpan = true;
  try {
    const raw = sessionStorage.getItem(KUNCI_SIMPAN_DATA);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, Entri>;
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v.sesi === "string" && typeof v.at === "number" && typeof v.tiba === "number" && !memori.has(k)) memori.set(k, v);
    }
  } catch {
    /* abaikan: tanpa simpanan tetap jalan */
  }
}

function jadwalkanSimpan() {
  if (typeof window === "undefined" || jadwalSimpan) return;
  jadwalSimpan = setTimeout(() => {
    jadwalSimpan = null;
    try {
      const sesi = bacaSesi();
      const obj: Record<string, Entri> = {};
      for (const [k, v] of memori) if (v.sesi === sesi) obj[k] = v;
      const teks = JSON.stringify(obj);
      if (teks.length <= MAKS_SIMPAN_KARAKTER) sessionStorage.setItem(KUNCI_SIMPAN_DATA, teks);
    } catch {
      /* penyimpanan penuh / diblokir: abaikan */
    }
  }, 600);
}

function beritahu(path: string) {
  pendengar.get(path)?.forEach((f) => f());
}

export type IsiCache<T> = { data: T; at: number; tiba: number };

/** Data tersimpan untuk akun yang sedang masuk (null bila tidak ada). */
export function bacaCache<T>(path: string): IsiCache<T> | null {
  muatSimpan();
  const e = memori.get(path);
  if (!e || e.sesi !== bacaSesi()) return null;
  return { data: e.data as T, at: e.at, tiba: e.tiba };
}

/** Basi = lebih tua dari `segarMs`, atau sudah ada penulisan (simpan/ubah) sesudah data ini diambil. */
export function basi(path: string, segarMs = SEGAR_MS): boolean {
  const e = bacaCache(path);
  if (!e) return true;
  return Date.now() - e.tiba > segarMs || waktuTulisTerakhir() > e.at;
}

/** Ambil dari server (berbagi permintaan yang sedang berjalan). Selalu memperbarui simpanan. */
export function muatData<T>(path: string): Promise<T> {
  const sesi = bacaSesi();
  if (!sesi) return Promise.reject(new Error("SESI_BERAKHIR"));
  const kunci = `${sesi}|${path}`;
  const ada = terbang.get(kunci);
  if (ada) return ada as Promise<T>;
  const mulai = Date.now();
  const janji = apiPortal<T>(path)
    .then((data) => {
      memori.set(path, { sesi, data, at: mulai, tiba: Date.now() });
      jadwalkanSimpan();
      beritahu(path);
      return data;
    })
    .finally(() => {
      terbang.delete(kunci);
    });
  terbang.set(kunci, janji);
  return janji;
}

/** Ambil bila belum ada / sudah basi; selain itu pakai simpanan. Dipakai prefetch. */
export async function siapkanData<T>(path: string, segarMs = 30_000): Promise<T> {
  const c = bacaCache<T>(path);
  if (c && !basi(path, segarMs)) return c.data;
  return muatData<T>(path);
}

function langganan(path: string, f: () => void): () => void {
  let s = pendengar.get(path);
  if (!s) pendengar.set(path, (s = new Set()));
  s.add(f);
  return () => {
    s!.delete(f);
  };
}

export type OpsiData = {
  /** data lebih muda dari ini tidak diminta ulang saat halaman dibuka (default 10 detik) */
  segarMs?: number;
  /** muat ulang berkala saat layar terlihat (default 2 menit; 0 = mati) */
  interval?: number;
  /** false = jangan memuat (mis. menunggu syarat lain) */
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
  const { segarMs = SEGAR_MS, interval = 120_000, aktif = true } = opsi;
  const [isi, setIsi] = useState<IsiCache<T> | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const hidup = useRef(true);

  const salin = useCallback(() => {
    const c = bacaCache<T>(path);
    if (c) setIsi((lama) => (lama && lama.tiba === c.tiba ? lama : c));
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
          if (document.visibilityState === "visible" && basi(path, interval / 2)) void muat();
        }, interval)
      : null;
    const c = () => {
      if (document.visibilityState === "visible" && basi(path, 30_000)) void muat();
    };
    document.addEventListener("visibilitychange", c);
    return () => {
      hidup.current = false;
      if (kali) clearInterval(kali);
      document.removeEventListener("visibilitychange", c);
    };
  }, [path, aktif, segarMs, interval, muat]);

  return { data: isi?.data ?? null, galat, memuat: !isi && !galat, tiba: isi?.tiba ?? 0, muat };
}
