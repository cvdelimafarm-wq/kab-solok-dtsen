"use client";

// app/sigap/pelatihan/absenSaya.ts
//
// (3 Nov 2026) Data absen peserta (GET /api/sigap/pelatihan/absen?sebagai=peserta) yang DIBAGI antara kartu Presensi sesi (tab Hari ini) dan lajur ikon langkah
// ("Absen sesi" di Hari ini / Pelatihan / Instrumen / ...). Sengaja BUKAN simpanan data bersama: sesi dibuka dan ditutup menit ke menit (jendela 30 menit),
// jadi selalu diambil langsung dari server: satu permintaan dibagi semua pemakai, diperbarui tiap 10 detik selama layar terlihat.
// Bukan peserta / fitur belum aktif (SQL belum dijalankan) -> `ada=false` dan tidak ada yang digambar.

import { useCallback, useEffect, useState } from "react";
import { fetchJson, urlPelatihan } from "../admin/api";
import type { MetodeAbsen } from "@/lib/sigapAbsen";

export type SesiTerbuka = { id: number; no: number; label: string; metode: MetodeAbsen[]; tutup_at: string; sisa_detik: number; radius_m: number; sudah_hadir: boolean; di_luar_radar: boolean };
export type SesiHari = { id: number; no: number; label: string; jam: string | null; keadaan: "dibuka" | "habis" | "ditutup"; tutup_at: string; sudah_hadir: boolean };
export type DataAbsenSaya = {
  kedatangan: { berlaku: boolean; sudah: boolean; at: string | null; manual: boolean; terlambat: boolean };
  sesi_terbuka: SesiTerbuka[];
  /** Semua sesi hari ini untuk kelas peserta. Server lama tanpa kolom ini -> undefined (kartu memakai sesi_terbuka saja). */
  sesi_hari?: SesiHari[];
  sekarang: number;
};

type Keadaan = { data: DataAbsenSaya | null; tiba: number; ada: boolean };

const INTERVAL_MS = 10_000;
const MINIMAL_ANTAR_PERMINTAAN_MS = 3_000;
const keadaan = new Map<string, Keadaan>();
const pendengar = new Map<string, Set<() => void>>();
const terbang = new Map<string, Promise<void>>();
const terakhir = new Map<string, number>();

const baca = (url: string): Keadaan => keadaan.get(url) ?? { data: null, tiba: 0, ada: true };
const beritahu = (url: string) => pendengar.get(url)?.forEach((f) => f());

/** Ambil dari server (permintaan yang sedang berjalan dibagi; tidak lebih sering dari 3 detik kecuali `paksa`). */
function muatDari(url: string, paksa = false): Promise<void> {
  const ada = terbang.get(url);
  if (ada) return ada;
  if (!paksa && Date.now() - (terakhir.get(url) ?? 0) < MINIMAL_ANTAR_PERMINTAAN_MS) return Promise.resolve();
  terakhir.set(url, Date.now());
  const p = fetchJson<DataAbsenSaya>(url)
    .then((r) => {
      keadaan.set(url, { data: r, tiba: Date.now(), ada: true });
    })
    .catch(() => {
      // bukan peserta atau fitur belum aktif: diam (data lama, bila ada, tidak dibuang oleh galat sesaat)
      const lama = baca(url);
      keadaan.set(url, lama.data ? lama : { data: null, tiba: 0, ada: false });
    })
    .finally(() => {
      terbang.delete(url);
      beritahu(url);
    });
  terbang.set(url, p);
  return p;
}

/**
 * `aktif=false`: tidak memuat dan tidak berlangganan (dipakai halaman yang bukan tampilan lima tab).
 * `selisih` = server - HP (ms) saat data diterima, untuk menghitung sisa waktu jendela.
 */
export function useAbsenSaya(aktif = true): { data: DataAbsenSaya | null; ada: boolean; selisih: number; muat: () => Promise<void> } {
  const url = urlPelatihan("/api/sigap/pelatihan/absen?sebagai=peserta");
  const [, ketuk] = useState(0);
  useEffect(() => {
    if (!aktif) return;
    const f = () => ketuk((x) => x + 1);
    let s = pendengar.get(url);
    if (!s) pendengar.set(url, (s = new Set()));
    s.add(f);
    void muatDari(url);
    const a = setInterval(() => document.visibilityState === "visible" && void muatDari(url), INTERVAL_MS);
    const lihat = () => document.visibilityState === "visible" && void muatDari(url);
    document.addEventListener("visibilitychange", lihat);
    f(); // data yang sudah ada dari halaman sebelumnya langsung dipakai
    return () => {
      s!.delete(f);
      clearInterval(a);
      document.removeEventListener("visibilitychange", lihat);
    };
  }, [aktif, url]);
  const muat = useCallback(() => muatDari(url, true), [url]);
  const k = aktif ? baca(url) : { data: null, tiba: 0, ada: true };
  return { data: k.data, ada: k.ada, selisih: k.data ? k.data.sekarang - (k.tiba || Date.now()) : 0, muat };
}

/** Ringkasan untuk lajur ikon langkah: null = tidak ada (bukan peserta / fitur belum aktif / belum termuat). */
export function ringkasAbsenSaya(d: DataAbsenSaya | null, nowMs: number): { total: number; hadir: number; terbukaBelum: number } | null {
  if (!d) return null;
  const sesi = d.sesi_hari;
  if (sesi) {
    const terbuka = sesi.filter((s) => s.keadaan === "dibuka" && Date.parse(s.tutup_at) > nowMs);
    return { total: sesi.length, hadir: sesi.filter((s) => s.sudah_hadir).length, terbukaBelum: terbuka.filter((s) => !s.sudah_hadir).length };
  }
  const terbuka = d.sesi_terbuka.filter((s) => Date.parse(s.tutup_at) > nowMs);
  return { total: terbuka.length, hadir: terbuka.filter((s) => s.sudah_hadir).length, terbukaBelum: terbuka.filter((s) => !s.sudah_hadir).length };
}

/** Untuk pengujian. */
export function lupakanAbsenSaya() {
  keadaan.clear();
  terakhir.clear();
}
