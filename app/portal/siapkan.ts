"use client";

// app/portal/siapkan.ts
//
// (10 Okt 2026) Prefetch: selagi petugas membaca / menggulir sebuah halaman, data dan kode halaman TUJUAN layer berikutnya diambil di belakang,
// sehingga saat tombol ditekan datanya sudah ada (lihat dataBersama.ts). Tombol kembali tidak perlu prefetch: halaman sebelumnya masih tersimpan.
// Hanya data yang BENAR-BENAR akan dibuka: wilayah tim (PPL) dan Lembar Identifikasi (PML). Wilayah tim disembunyikan untuk PML, jadi dilewati.
// Diambil satu per satu setelah HP diam sejenak (tidak berebut dengan halaman yang sedang dibuka) -- permintaan user: ambil semua tujuan layer berikutnya.
// Dilewati bila mode hemat data aktif, tab tersembunyi, atau sedang luring.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { siapkanData } from "./dataBersama";
import { tahapSekarang, type TahapHasil } from "@/lib/sigapTahap";

export type Rencana = { rute: string[]; data: string[] };

/** modul tahap -> API yang dibaca halaman kerjanya */
const DATA_MODUL: Record<string, string> = {
  wilayah_tim: "/api/portal/wilayah-tim",
  identifikasi: "/api/portal/identifikasi",
};

const internal = (x: string | null | undefined): x is string => !!x && x.startsWith("/") && !x.startsWith("//");

/** Rencana pengambilan untuk sekumpulan tahap; tahap yang sedang diprioritaskan (tujuan tombol biru) didahulukan. */
export function buatRencana(tahap: TahapHasil[], pml: boolean): Rencana {
  const kini = tahapSekarang(tahap)?.tahap ?? null;
  const urut = [...(kini ? [kini] : []), ...tahap.filter((t) => t !== kini)].filter((t) => !t.terkunci);
  const rute = new Set<string>();
  const data = new Set<string>();
  for (const t of urut) {
    // pelatihan punya halamannya sendiri; rute tahap generik tetap disiapkan
    if (internal(t.rute)) rute.add(t.rute);
    for (const m of t.modul) {
      if (m.kode === "wilayah_tim" && pml) continue; // (10 Okt 2026) wilayah tugas tim disembunyikan untuk PML
      const api = DATA_MODUL[m.kode];
      if (api) data.add(api);
      if (internal(m.href)) rute.add(m.href.split("?")[0]);
    }
  }
  return { rute: Array.from(rute), data: Array.from(data) };
}

function bolehSiapkan(): boolean {
  if (typeof document === "undefined" || document.visibilityState !== "visible") return false;
  const n = navigator as Navigator & { connection?: { saveData?: boolean } };
  if (n.onLine === false || n.connection?.saveData) return false;
  return true;
}

const tunda = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Jalankan rencana setelah HP diam sejenak. */
export function useSiapkan(rencana: Rencana, aktif = true) {
  const router = useRouter();
  const tanda = JSON.stringify(rencana);
  useEffect(() => {
    if (!aktif) return;
    const { rute, data } = JSON.parse(tanda) as Rencana;
    if (rute.length === 0 && data.length === 0) return;
    let batal = false;
    (async () => {
      await tunda(600); // beri halaman yang baru terbuka kesempatan selesai digambar dulu
      for (const d of data) {
        if (batal || !bolehSiapkan()) return;
        await siapkanData(d).catch(() => {}); // gagal diam-diam: halaman tujuan akan memuat sendiri
        await tunda(150);
      }
      for (const r of rute) {
        if (batal || !bolehSiapkan()) return;
        try {
          router.prefetch(r);
        } catch {
          /* abaikan */
        }
      }
    })();
    return () => {
      batal = true;
    };
  }, [tanda, aktif, router]);
}
