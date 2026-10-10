"use client";

// app/portal/petaOffline.ts
//
// (10 Okt 2026) Peta wilayah kerja diunduh ke HP (Cache Storage) supaya terbuka seketika dan tetap bisa dibuka tanpa sinyal -- permintaan user:
// "prefetch seluruh peta wilayah kerjanya", dijalankan saat SINYAL BAGUS (bukan hanya Wi-Fi), ±17 MB per petugas (rata-rata 1,1 MB/peta).
// Cara kerja:
//  - Daftar berkas + tautan bertanda tangan (berlaku 1 jam) dari /api/portal/peta, lalu tiap berkas diunduh dan disimpan dengan kunci TETAP
//    /peta-cache/<wa|sls>/<nama berkas> (service worker public/sw.js melayani alamat itu dari Cache Storage). Tautan bertanda tangan berubah tiap
//    kali, jadi tidak bisa dipakai sebagai kunci cache browser.
//  - "Sinyal bagus" tidak ditebak dari jenis jaringan (iPhone tidak melaporkannya) melainkan DIUKUR: kecepatan tiap berkas. Terlalu lambat /
//    terlalu sering gagal -> berhenti dan dicoba lagi nanti (online lagi / aplikasi dibuka lagi). Mode hemat data -> tidak diunduh otomatis.
//  - Daftar berkas (manifest) disimpan di localStorage: PetaSheet bisa langsung menampilkan tanpa menunggu server bila semua berkas sudah ada.
//  - Peta bukan data pribadi: tidak dibuang saat keluar (hemat unduhan ulang). Berkas yang diunggah admin belakangan diambil saat manifest > 6 jam.

import { useCallback, useEffect, useState } from "react";
import { apiPortal, KUNCI_MANIFEST_PETA, NAMA_CACHE_PETA } from "./sesi";

export type BerkasM = { nama: string; halaman: number; dari: number; tipe: "pdf" | "gambar" };
type Manifest = { at: number; wa: Record<string, BerkasM[]>; sls: Record<string, BerkasM[]> };
type BerkasApi = BerkasM & { url: string };
type HasilApi = { wa: Record<string, BerkasApi[]>; sls: Record<string, BerkasApi[]> };
export type DaftarPeta = { desa: string[]; subs: string[] };
export type HasilUnduh = { total: number; baru: number; sudah: number; gagal: number; berhenti: null | "sinyal" | "galat" | "luring" | "hemat" | "tidak_didukung" };

const UMUR_MANIFEST_MS = 6 * 3_600_000;
const BATAS_KECEPATAN_BPS = 60 * 1024; // di bawah ini (setelah ≥ 300 KB) dianggap sinyal lemah
const MAKS_GAGAL_BERUNTUN = 3;
const KONKUREN = 2;

export const jalurPeta = (folder: "wa" | "sls", nama: string) => `/peta-cache/${folder}/${encodeURIComponent(nama)}`;

export const cacheDidukung = () => typeof window !== "undefined" && "caches" in window;
/** Service worker sudah mengendalikan halaman ini? (tanpa itu alamat /peta-cache/ tidak dilayani) */
export const swAktif = () => typeof navigator !== "undefined" && "serviceWorker" in navigator && !!navigator.serviceWorker.controller;

export function bacaManifest(): Manifest | null {
  try {
    const raw = localStorage.getItem(KUNCI_MANIFEST_PETA);
    if (!raw) return null;
    const m = JSON.parse(raw) as Manifest;
    return m && typeof m.at === "number" && m.wa && m.sls ? m : null;
  } catch {
    return null;
  }
}

function simpanManifest(m: Manifest) {
  try {
    localStorage.setItem(KUNCI_MANIFEST_PETA, JSON.stringify(m));
  } catch {
    /* penuh: abaikan */
  }
}

export async function petaTersimpan(folder: "wa" | "sls", nama: string): Promise<boolean> {
  if (!cacheDidukung()) return false;
  try {
    const c = await caches.open(NAMA_CACHE_PETA);
    return !!(await c.match(jalurPeta(folder, nama)));
  } catch {
    return false;
  }
}

/** Daftar kode peta dari idsubsls wilayah kerja: kode desa (peta WA) + idsubsls (peta SLS). */
export function daftarPetaDari(idsubsls: string[]): DaftarPeta {
  const subs = Array.from(new Set(idsubsls.filter((x) => /^\d{16}$/.test(x))));
  return { desa: Array.from(new Set(subs.map((s) => s.slice(0, 10)))), subs };
}

/** Berkas yang diperlukan daftar ini menurut manifest. `lengkap` = semua kode sudah dicek dan manifest masih baru. */
export function berkasDiperlukan(d: DaftarPeta, m: Manifest | null = bacaManifest()): { folder: "wa" | "sls"; berkas: BerkasM }[] {
  const hasil: { folder: "wa" | "sls"; berkas: BerkasM }[] = [];
  if (!m) return hasil;
  for (const k of d.desa) for (const b of m.wa[k] ?? []) hasil.push({ folder: "wa", berkas: b });
  for (const k of d.subs) for (const b of m.sls[k] ?? []) hasil.push({ folder: "sls", berkas: b });
  return hasil;
}

export function manifestLengkap(d: DaftarPeta, m: Manifest | null = bacaManifest()): boolean {
  if (!m || Date.now() - m.at > UMUR_MANIFEST_MS) return false;
  return d.desa.every((k) => k in m.wa) && d.subs.every((k) => k in m.sls);
}

const potong = <T,>(a: T[], n: number): T[][] => {
  const h: T[][] = [];
  for (let i = 0; i < a.length; i += n) h.push(a.slice(i, i + n));
  return h;
};

async function ambilDaftar(d: DaftarPeta): Promise<HasilApi> {
  const hasil: HasilApi = { wa: {}, sls: {} };
  const bagiDesa = potong(d.desa, 20);
  const bagiSub = potong(d.subs, 80);
  const n = Math.max(bagiDesa.length, bagiSub.length, 1);
  for (let i = 0; i < n; i++) {
    const q = new URLSearchParams();
    if (bagiDesa[i]?.length) q.set("desa", bagiDesa[i].join(","));
    if (bagiSub[i]?.length) q.set("sub", bagiSub[i].join(","));
    if ([...q.keys()].length === 0) continue;
    const h = await apiPortal<HasilApi>(`/api/portal/peta?${q.toString()}`);
    Object.assign(hasil.wa, h.wa);
    Object.assign(hasil.sls, h.sls);
  }
  return hasil;
}

// ---------------------------------------------------------------- status & pemberitahuan
export type StatusPeta = { total: number; tersimpan: number; jalan: boolean; berhenti: HasilUnduh["berhenti"] };
const pemantau = new Set<() => void>();
let jalan: Promise<HasilUnduh> | null = null;
let berhentiTerakhir: HasilUnduh["berhenti"] = null;
const beritahu = () => pemantau.forEach((f) => f());

export function bolehUnduhOtomatis(): "ya" | "luring" | "hemat" | "tersembunyi" {
  if (typeof navigator === "undefined" || typeof document === "undefined") return "tersembunyi";
  if (document.visibilityState !== "visible") return "tersembunyi";
  if (navigator.onLine === false) return "luring";
  const n = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };
  if (n.connection?.saveData) return "hemat";
  if (n.connection?.effectiveType && /^(slow-2g|2g)$/.test(n.connection.effectiveType)) return "hemat";
  return "ya";
}

/**
 * Unduh semua peta yang belum ada untuk `d`. `manual` = diminta petugas (tombol): tidak menghormati mode hemat data & mencoba lagi walau manifest baru.
 * Berhenti sendiri bila kecepatan terlalu rendah atau gagal beruntun. Satu proses sekaligus.
 */
export function unduhPeta(d: DaftarPeta, opsi: { manual?: boolean } = {}): Promise<HasilUnduh> {
  if (jalan) return jalan;
  jalan = (async (): Promise<HasilUnduh> => {
    const hasil: HasilUnduh = { total: 0, baru: 0, sudah: 0, gagal: 0, berhenti: null };
    if (!cacheDidukung()) return { ...hasil, berhenti: "tidak_didukung" };
    const izin = bolehUnduhOtomatis();
    if (izin === "luring") return { ...hasil, berhenti: "luring" };
    if (izin === "hemat" && !opsi.manual) return { ...hasil, berhenti: "hemat" };
    berhentiTerakhir = null;
    beritahu();
    try {
      const cache = await caches.open(NAMA_CACHE_PETA);
      const daftar: HasilApi = await ambilDaftar(d);
      const m: Manifest = { at: Date.now(), wa: {}, sls: {} };
      for (const k of d.desa) m.wa[k] = (daftar.wa[k] ?? []).map(({ nama, halaman, dari, tipe }) => ({ nama, halaman, dari, tipe }));
      for (const k of d.subs) m.sls[k] = (daftar.sls[k] ?? []).map(({ nama, halaman, dari, tipe }) => ({ nama, halaman, dari, tipe }));
      simpanManifest(m);

      // antrean: hanya yang belum tersimpan
      type Tugas = { folder: "wa" | "sls"; b: BerkasApi };
      const semua: Tugas[] = [];
      for (const k of d.desa) for (const b of daftar.wa[k] ?? []) semua.push({ folder: "wa", b });
      for (const k of d.subs) for (const b of daftar.sls[k] ?? []) semua.push({ folder: "sls", b });
      // satu berkas bisa dipakai beberapa Sub SLS (peta SLS 14 digit): unduh sekali
      const unik = new Map<string, Tugas>();
      for (const t of semua) unik.set(jalurPeta(t.folder, t.b.nama), t);
      hasil.total = unik.size;
      const perlu: Tugas[] = [];
      for (const [j, t] of unik) {
        if (await cache.match(j)) hasil.sudah++;
        else perlu.push(t);
      }
      beritahu();

      let gagalBeruntun = 0;
      let berhenti = false;
      let waktuMulai = Date.now();
      const kerjakan = async () => {
        for (;;) {
          if (berhenti) return;
          const t = perlu.shift();
          if (!t) return;
          const j = jalurPeta(t.folder, t.b.nama);
          const ac = new AbortController();
          const batas = setTimeout(() => ac.abort(), 45_000);
          const mulai = Date.now();
          try {
            const res = await fetch(t.b.url, { signal: ac.signal });
            if (!res.ok) throw new Error(String(res.status));
            const buf = await res.arrayBuffer();
            clearTimeout(batas);
            const dtk = Math.max(0.05, (Date.now() - mulai) / 1000);
            await cache.put(j, new Response(buf, { headers: { "Content-Type": res.headers.get("content-type") || "image/jpeg" } }));
            hasil.baru++;
            gagalBeruntun = 0;
            if (buf.byteLength >= 300 * 1024 && buf.byteLength / dtk < BATAS_KECEPATAN_BPS) {
              // sinyal lemah: simpan yang sudah terunduh, berhenti, coba lagi nanti
              hasil.berhenti = "sinyal";
              berhenti = true;
            }
          } catch {
            clearTimeout(batas);
            hasil.gagal++;
            gagalBeruntun++;
            if (gagalBeruntun >= MAKS_GAGAL_BERUNTUN) {
              hasil.berhenti = navigator.onLine === false ? "luring" : "galat";
              berhenti = true;
            }
          }
          beritahu();
          // tautan bertanda tangan berlaku 1 jam: bila unduhan sangat lama, hentikan (diambil ulang di putaran berikutnya)
          if (Date.now() - waktuMulai > 50 * 60_000) {
            hasil.berhenti = "sinyal";
            berhenti = true;
          }
        }
      };
      waktuMulai = Date.now();
      await Promise.all(Array.from({ length: KONKUREN }, kerjakan));
    } catch (e) {
      if (e instanceof Error && e.message === "SESI_BERAKHIR") hasil.berhenti = "galat";
      else hasil.berhenti = navigator.onLine === false ? "luring" : "galat";
    }
    berhentiTerakhir = hasil.berhenti;
    return hasil;
  })().finally(() => {
    jalan = null;
    beritahu();
  });
  beritahu();
  return jalan;
}

/** Hitung berkas tersimpan vs diperlukan (dari manifest + Cache Storage). */
export async function hitungStatus(d: DaftarPeta): Promise<StatusPeta> {
  const perlu = new Map<string, { folder: "wa" | "sls"; berkas: BerkasM }>();
  for (const x of berkasDiperlukan(d)) perlu.set(jalurPeta(x.folder, x.berkas.nama), x);
  let tersimpan = 0;
  if (cacheDidukung()) {
    try {
      const c = await caches.open(NAMA_CACHE_PETA);
      for (const j of perlu.keys()) if (await c.match(j)) tersimpan++;
    } catch {
      /* abaikan */
    }
  }
  return { total: perlu.size, tersimpan, jalan: !!jalan, berhenti: berhentiTerakhir };
}

/** Hook status untuk tampilan (diperbarui saat unduhan berjalan). */
export function useStatusPeta(d: DaftarPeta): { status: StatusPeta | null; belumDicek: boolean; unduh: () => Promise<HasilUnduh> } {
  const [status, setStatus] = useState<StatusPeta | null>(null);
  const kunci = JSON.stringify(d);
  const segarkan = useCallback(() => {
    void hitungStatus(JSON.parse(kunci) as DaftarPeta).then(setStatus);
  }, [kunci]);
  useEffect(() => {
    segarkan();
    pemantau.add(segarkan);
    return () => {
      pemantau.delete(segarkan);
    };
  }, [segarkan]);
  const unduh = useCallback(() => unduhPeta(JSON.parse(kunci) as DaftarPeta, { manual: true }), [kunci]);
  return { status, belumDicek: !manifestLengkap(JSON.parse(kunci) as DaftarPeta), unduh };
}

const KUNCI_COBA = "sigap_peta_coba_v1";

/** Unduh otomatis saat HP diam & sinyal baik; ulangi saat online / aplikasi dibuka lagi. Tidak memanggil server bila semua sudah lengkap & manifest baru. */
export function useUnduhPetaOtomatis(d: DaftarPeta, aktif = true) {
  const kunci = JSON.stringify(d);
  useEffect(() => {
    if (!aktif) return;
    const daftar = JSON.parse(kunci) as DaftarPeta;
    if (daftar.subs.length === 0 && daftar.desa.length === 0) return;
    let batal = false;
    let pewaktu: ReturnType<typeof setTimeout> | null = null;

    const coba = async () => {
      if (batal || bolehUnduhOtomatis() !== "ya") return;
      // jangan terlalu sering (sinyal lemah sebelumnya): minimal 10 menit antar-percobaan setelah berhenti karena sinyal/galat
      try {
        const t = Number(localStorage.getItem(KUNCI_COBA) ?? 0);
        if (Date.now() - t < 10 * 60_000) return;
      } catch {
        /* abaikan */
      }
      if (manifestLengkap(daftar)) {
        const st = await hitungStatus(daftar);
        if (st.tersimpan >= st.total) return; // sudah lengkap: tanpa jaringan sama sekali
      }
      const h = await unduhPeta(daftar);
      try {
        if (h.berhenti === "sinyal" || h.berhenti === "galat") localStorage.setItem(KUNCI_COBA, String(Date.now()));
        else localStorage.removeItem(KUNCI_COBA);
      } catch {
        /* abaikan */
      }
    };
    const tunda = () => {
      if (pewaktu) clearTimeout(pewaktu);
      pewaktu = setTimeout(() => void coba(), 4000); // beri halaman yang baru terbuka kesempatan selesai digambar & memuat data penting dulu
    };
    tunda();
    const c = () => document.visibilityState === "visible" && tunda();
    document.addEventListener("visibilitychange", c);
    window.addEventListener("online", tunda);
    return () => {
      batal = true;
      if (pewaktu) clearTimeout(pewaktu);
      document.removeEventListener("visibilitychange", c);
      window.removeEventListener("online", tunda);
    };
  }, [kunci, aktif]);
}
