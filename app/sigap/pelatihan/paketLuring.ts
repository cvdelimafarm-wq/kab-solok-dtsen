"use client";
// app/sigap/pelatihan/paketLuring.ts
//
// (14 Nov 2026, luring 3b-1) Unduh paket soal TERSANDI ke HP di belakang layar (tanpa tombol) sejak H-1 sampai tes ditutup, supaya tes tetap bisa
// dikerjakan saat sinyal di lokasi pelatihan hilang. HP mengirim versi yang dipegang; server menjawab `sama` bila tidak berubah (hemat kuota).
// Diulang saat HP kembali bersinyal dan tiap 30 menit selama halaman terbuka.

import { useEffect, useState } from "react";
import { bacaSesi, fetchJson } from "../admin/api";
import { tandaPemilik } from "@/lib/luringSimpan";
import { bacaPaket, simpanPaket, statusPaket, type StatusPaket } from "@/lib/paketLuringSimpan";
import type { PaketTes } from "@/lib/sigapTesLuring";

type Jawab = { boleh: false; alasan?: string } | { boleh: true; sama: true; versi: string } | { boleh: true; paket: PaketTes };

const ULANG_MS = 30 * 60_000;
const sedangJalan = new Set<string>();

/** Satu kali periksa/unduh. Mengembalikan paket yang ada di HP sesudahnya (atau null). Tidak pernah melempar galat. */
export async function segarkanPaket(jenis: string): Promise<PaketTes | null> {
  if (typeof window === "undefined") return null;
  const pemilik = tandaPemilik(bacaSesi());
  if (!pemilik) return null;
  const lama = bacaPaket(localStorage, jenis, pemilik);
  if (sedangJalan.has(jenis) || !navigator.onLine) return lama;
  sedangJalan.add(jenis);
  try {
    const j = await fetchJson<Jawab>(`/api/sigap/pelatihan/tes/${jenis}/paket${lama ? `?versi=${encodeURIComponent(lama.versi)}` : ""}`);
    if (j.boleh && "paket" in j) {
      simpanPaket(localStorage, jenis, pemilik, j.paket);
      return j.paket;
    }
    return lama;
  } catch {
    return lama; // tanpa sinyal / galat: pakai yang sudah ada
  } finally {
    sedangJalan.delete(jenis);
  }
}

/**
 * Status paket untuk satu tes. `aktif` = tes dalam jendela unduh menurut halaman (belum_buka/buka/mengerjakan); di luar itu tidak mengunduh.
 * Server tetap memutuskan jendela H-1 (paket tidak diberikan lebih awal).
 */
export function usePaketLuring(jenis: string, tutupAt: string, aktif: boolean): StatusPaket {
  const [paket, setPaket] = useState<PaketTes | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (typeof window === "undefined") return;
    const pemilik = tandaPemilik(bacaSesi());
    setPaket(pemilik ? bacaPaket(localStorage, jenis, pemilik) : null);
    if (!aktif) return;
    let hidup = true;
    const jalan = () => {
      void segarkanPaket(jenis).then((p) => {
        if (hidup) {
          setPaket(p);
          setNow(Date.now());
        }
      });
    };
    jalan();
    const t = window.setInterval(jalan, ULANG_MS);
    window.addEventListener("online", jalan);
    return () => {
      hidup = false;
      window.clearInterval(t);
      window.removeEventListener("online", jalan);
    };
  }, [jenis, aktif]);
  return statusPaket(paket, tutupAt, now);
}
