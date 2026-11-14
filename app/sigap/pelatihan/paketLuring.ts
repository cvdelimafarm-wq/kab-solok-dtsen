"use client";
// app/sigap/pelatihan/paketLuring.ts
//
// (14 Nov 2026, luring 3b-1) Unduh paket soal TERSANDI ke HP di belakang layar (tanpa tombol) sejak H-1 sampai tes ditutup, supaya tes tetap bisa
// dikerjakan saat sinyal di lokasi pelatihan hilang. HP mengirim versi yang dipegang; server menjawab `sama` bila tidak berubah (hemat kuota).
// Diulang saat HP kembali bersinyal dan tiap 30 menit selama halaman terbuka.

import { useEffect, useState } from "react";
import { bacaSesi, fetchJson } from "../admin/api";
import { tandaPemilik } from "@/lib/luringSimpan";
import { bacaPaket, perbaruiSelisih, selisihDariPaket, simpanPaket, statusPaket, type StatusPaket } from "@/lib/paketLuringSimpan";
import type { PaketTes } from "@/lib/sigapTesLuring";
import { bacaSesiLuring, ditolakServer, muatanKirim, selesaikan, simpanSesiLuring, tandaiTerkirim } from "@/lib/sesiLuring";

type Jawab = { boleh: false; alasan?: string } | { boleh: true; sama: true; versi: string; sekarang?: string } | { boleh: true; paket: PaketTes };

// (luring 3b-2) halaman tes disimpan lebih dulu oleh service worker (sekali per jenis per pemuatan halaman)
const halamanDisimpan = new Set<string>();
function simpanHalamanTes(jenis: string) {
  if (halamanDisimpan.has(jenis)) return;
  halamanDisimpan.add(jenis);
  try {
    navigator.serviceWorker?.controller?.postMessage({ tipe: "simpan-halaman", alamat: `/sigap/pelatihan/tes/${jenis}` });
  } catch {
    /* tanpa service worker: halaman tes hanya tersedia bila pernah dibuka */
  }
}

/**
 * (luring 3b-3) Kirim jawaban tes tanpa sinyal yang tertunda. Sesi yang waktunya sudah habis diselesaikan dulu. Mengembalikan keadaan tes dari
 * server bila diterima; null bila tidak ada yang dikirim / masih tanpa sinyal; { ditolak } bila server menolak (tidak dicoba lagi otomatis).
 */
export async function kirimSesiLuringTertunda<T = unknown>(jenis: string): Promise<{ keadaan: T } | { ditolak: string } | null> {
  if (typeof window === "undefined") return null;
  const pemilik = tandaPemilik(bacaSesi());
  let s = bacaSesiLuring(localStorage, jenis, pemilik);
  if (!s || !s.kotor || s.galat_kirim) return null;
  const now = Date.now();
  if (s.selesai_hp_ms === null) {
    if (now < s.batas_hp_ms) return null; // masih dikerjakan
    s = selesaikan(s, now);
    simpanSesiLuring(localStorage, s);
  }
  if (!navigator.onLine) return null;
  try {
    const keadaan = await fetchJson<T>(`/api/sigap/pelatihan/tes/${jenis}/luring`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(muatanKirim(s, Date.now())) });
    simpanSesiLuring(localStorage, tandaiTerkirim(s, new Date().toISOString()));
    return { keadaan };
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e);
    if (ditolakServer(pesan)) {
      simpanSesiLuring(localStorage, { ...s, galat_kirim: pesan });
      return { ditolak: pesan };
    }
    // ditahan sementara (mis. terkunci tahapan): simpan pesannya untuk ditampilkan, tetap dicoba lagi
    if (!/failed to fetch|networkerror|load failed|sambungan/i.test(pesan)) simpanSesiLuring(localStorage, { ...s, tertahan: pesan });
    return null;
  }
}

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
    await kirimSesiLuringTertunda(jenis);
    const j = await fetchJson<Jawab>(`/api/sigap/pelatihan/tes/${jenis}/paket${lama ? `?versi=${encodeURIComponent(lama.versi)}` : ""}`);
    if (j.boleh && "paket" in j) {
      simpanPaket(localStorage, jenis, pemilik, j.paket, selisihDariPaket(j.paket, Date.now()));
      simpanHalamanTes(jenis);
      return j.paket;
    }
    if (j.boleh && "sama" in j) {
      const t = j.sekarang ? Date.parse(j.sekarang) : NaN;
      if (Number.isFinite(t)) perbaruiSelisih(localStorage, jenis, pemilik, t - Date.now());
      simpanHalamanTes(jenis);
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
