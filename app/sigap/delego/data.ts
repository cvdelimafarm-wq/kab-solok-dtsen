"use client";

// app/sigap/delego/data.ts
//
// (26 Okt 2026) Pengambil data Delego. Semua bacaan memanggil fungsi basis data lewat gerbang keu (aksiKeu -> POST /api/sigap/keu/panggil), sehingga
// hak ditegakkan basis data dan akun mitra pun dapat membaca tugasnya sendiri. Tulis memakai useKirim dari ro/useKeu.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { bacaCache, isiCache, basi } from "@/app/portal/dataBersama";
import { aksiKeu } from "@/app/sigap/ro/useKeu";
import { hariWib } from "@/lib/sigapCacheKerja";
import type { PoinUntuk } from "@/lib/delego/skala";
import type { BahanEskalasi } from "@/lib/delego/eskalasi";
import type { RekapInisiatif } from "@/lib/delego/inisiatif";
import type { BahanPengingat } from "@/lib/delego/pengingat";
import type { BahanSaya, BahanTim, BahanTinjau, Calon, HakDelegasi, KalibrasiBahan, KatalogSkor, Monitor, Rekap } from "@/lib/delego/tipe";

export { useKirim, aksiKeu } from "@/app/sigap/ro/useKeu";

const useTataLetak = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** (28 Okt 2026) Kunci simpanan bacaan Delego di dataBersama (profil "keu:"). Disimpan per akun, dibuang saat keluar. */
const kunciSimpan = (fungsi: string, args: Record<string, unknown>) => `keu:${fungsi}|${JSON.stringify(args)}`;

export type HasilBaca<T> = { data: T | null; galat: string | null; memuat: boolean; muat: () => Promise<void> };

/**
 * Memuat hasil fungsi baca `fungsi` dengan `args` (null = jangan memuat). Memuat ulang saat tab kembali aktif.
 * (28 Okt 2026) Hasil terakhir disimpan di HP (`simpan`, bawaan hidup): layar Delego langsung terisi dari simpanan lalu diperbarui di belakang.
 * Matikan (`simpan: false`) untuk bacaan yang kuncinya berubah tiap ketukan (pencarian).
 */
export function useBacaFungsi<T>(fungsi: string, args: Record<string, unknown> | null, opsi: { simpan?: boolean } = {}): HasilBaca<T> {
  const simpan = opsi.simpan !== false;
  const kunci = args === null ? "" : JSON.stringify(args);
  const argsRef = useRef(args);
  argsRef.current = args;
  const [data, setData] = useState<T | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(args !== null);
  const urutan = useRef(0);
  const adaSimpanan = useRef(false);

  // tampilkan simpanan SEBELUM digambar pertama kali; simpanan hari lain tidak dipakai (isinya bergantung tanggal)
  useTataLetak(() => {
    adaSimpanan.current = false;
    if (!simpan || args === null) return;
    const c = bacaCache<T>(kunciSimpan(fungsi, args));
    if (c && hariWib(c.tiba) === hariWib(Date.now())) {
      adaSimpanan.current = true;
      setData(c.data);
      setGalat(null);
      setMemuat(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci, fungsi, simpan]);

  const muat = useCallback(async () => {
    const a = argsRef.current;
    if (a === null) return;
    const saya = ++urutan.current;
    const mulai = Date.now();
    const r = await aksiKeu<T>(fungsi, a);
    if (saya !== urutan.current) return; // jawaban lama diabaikan
    if (r.ok) {
      setData(r.data);
      setGalat(null);
      if (simpan) isiCache(kunciSimpan(fungsi, a), r.data, mulai);
    } else setGalat(r.pesan);
    setMemuat(false);
  }, [fungsi, simpan]);

  useEffect(() => {
    if (kunci === "") {
      setMemuat(false);
      return;
    }
    setMemuat(!adaSimpanan.current); // ada simpanan: tidak ada layar memuat, data diperbarui diam-diam
    void muat();
  }, [kunci, muat]);

  useEffect(() => {
    const kembali = () => {
      if (document.visibilityState === "visible") void muat();
    };
    document.addEventListener("visibilitychange", kembali);
    return () => document.removeEventListener("visibilitychange", kembali);
  }, [muat]);

  return { data, galat, memuat, muat };
}

export const useHakDelegasi = () => useBacaFungsi<HakDelegasi>("keu_dlg_hak", {});
export const useSaya = () => useBacaFungsi<BahanSaya>("keu_dlg_saya", {});

/** Bahan tim (hanya untuk pemberi atau pelihat). `aktif` false = tidak memuat. */
export function useBahan(opsi: { ident?: number | null; ro?: string | null; aktif?: boolean } = {}) {
  const { ident = null, ro = null, aktif = true } = opsi;
  const args = aktif ? { ...(ident ? { p_ident: ident } : {}), ...(ro ? { p_ro: ro } : {}) } : null;
  return useBacaFungsi<BahanTim>("keu_dlg_bahan", args);
}

/** Bahan tinjau (antrean laporan, usulan, sanggahan, dan bahan saya sebagai pegawai). */
export const useTinjauBahan = (aktif = true) => useBacaFungsi<BahanTinjau>("keu_dlg_tinjau_bahan", aktif ? {} : null);
/** (14 Nov 2026, Fase 4b) Butir lewat tenggat: milik saya (wajib jelaskan) dan yang harus saya jawab sebagai pimpinan. */
/** (14 Nov 2026, Fase 4c) Hitungan inisiatif per pegawai (bulan berjalan bila rentang kosong). */
export const useInisiatifRekap = (aktif = true) => useBacaFungsi<RekapInisiatif>("keu_dlg_inisiatif_rekap", aktif ? {} : null);
/** (14 Nov 2026, Fase 4d) Jadwal pengingat Delego serta setelan eskalasi dan mutu. */
export const usePengingatBahan = () => useBacaFungsi<BahanPengingat>("keu_dlg_pengingat_bahan", {});
export const useEskalasiBahan = (aktif = true) => useBacaFungsi<BahanEskalasi>("keu_dlg_eskalasi_bahan", aktif ? {} : null);
/** Katalog skor beban kerja beserta pilihan kegiatan dan kelompok untuk layar Catat pekerjaan. */
export const useKatalogSkor = () => useBacaFungsi<KatalogSkor>("keu_dlg_katalog_skor", {});
/** Rekap beban dari penugasan lapangan, pelatihan, dan ketersediaan untuk rentang tanggal (Senin sampai Minggu bila kosong). */
export const useRekap = (dari: string | null, sampai: string | null, aktif = true) => useBacaFungsi<Rekap>("keu_dlg_rekap", aktif ? { ...(dari ? { p_dari: dari } : {}), ...(sampai ? { p_sampai: sampai } : {}) } : null);
/** Monitoring Kepala: tiga angka capaian, antrean tinjau, hambatan, sanggahan. */
export const useMonitor = (dari: string | null, sampai: string | null, aktif = true) => useBacaFungsi<Monitor>("keu_dlg_monitor", aktif ? { ...(dari ? { p_dari: dari } : {}), ...(sampai ? { p_sampai: sampai } : {}) } : null);

/** Menit nyata per satuan untuk kalibrasi skor (Ketua Tim, pelihat, Kepala). `aktif` false = tidak memuat. */
export const useKalibrasi = (aktif = true) => useBacaFungsi<KalibrasiBahan>("keu_dlg_kalibrasi", aktif ? {} : null);

export function useCalon(ro: string | null, ident: number | null, q: string) {
  const args = ro ? { p_ro: ro, ...(ident ? { p_ident: ident } : {}), p_q: q } : null;
  return useBacaFungsi<Calon>("keu_dlg_calon", args, { simpan: false }); // kunci berubah tiap ketukan pencarian
}

/**
 * (28 Okt 2026) Prefetch dari Beranda: hak dan tugas saya diambil di belakang supaya Delego terbuka dengan data siap. Dilewati bila layar tersembunyi,
 * luring, atau mode hemat data; data yang masih segar (< 1 menit) tidak diminta ulang. Gagal diam-diam: layar Delego memuat sendiri.
 */
export async function siapkanDelego(): Promise<void> {
  const n = navigator as Navigator & { connection?: { saveData?: boolean } };
  for (const f of ["keu_dlg_hak", "keu_dlg_saya"]) {
    if (document.visibilityState !== "visible" || n.onLine === false || n.connection?.saveData) return;
    const kunci = kunciSimpan(f, {});
    if (!basi(kunci)) continue;
    const mulai = Date.now();
    const r = await aksiKeu(f, {});
    if (r.ok) isiCache(kunci, r.data, mulai);
    await new Promise((ok) => setTimeout(ok, 150));
  }
}

// (14 Nov 2026, fase D) Poin per satuan dari Master > Poin beban kerja untuk teks survei (nama identifikasi/kegiatan + judul).
// Teks ditunda 600 ms supaya mengetik judul tidak memanggil server tiap huruf.
export function usePoinUntuk(teks: string, aktif = true) {
  const [t, setT] = useState(teks);
  useEffect(() => {
    const h = setTimeout(() => setT(teks), 600);
    return () => clearTimeout(h);
  }, [teks]);
  return useBacaFungsi<PoinUntuk[]>("keu_poin_untuk_daftar", aktif ? { p_teks: t.trim().slice(0, 300) } : null);
}
