"use client";

// app/portal/antreanKirim.ts
//
// (10 Okt 2026) Antrean kirim: aplikasi ini lebih banyak MENGIRIM data daripada menerima, dan petugas sering di tempat bersinyal lemah. Maka hasil yang
// disimpan petugas (kini: Lembar Identifikasi SLS) langsung tampil sebagai tersimpan di layarnya sendiri, lalu dikirim ke server di belakang layar;
// bila gagal karena sinyal, ditahan di HP dan dicoba lagi otomatis (online lagi / aplikasi dibuka lagi / tiap menit) -- permintaan user.
// Aturan:
//  - validasi isian tetap dilakukan SEBELUM masuk antrean (periksaIsian, sama dengan server); penolakan server tetap tampil sebagai "ditolak";
//  - satu antrean per akun (pemilik); tidak dikirim atas nama akun lain; tidak dibuang saat keluar;
//  - kirim berurutan; isian yang sama (kunci sama) menimpa yang menunggu -- yang terakhir yang berlaku;
//  - selama masih menunggu, data dari server tidak "menimpa mundur" tampilan (tumpuk di dataBersama.ts).

import { useCallback, useEffect, useState } from "react";
import { apiPortal, KUNCI_ANTREAN, pemilikSesi, type GalatApi } from "./sesi";
import { daftarkanTumpuk, tandaBasi, ubahCache } from "./dataBersama";
import { periksaIsian, ringkasIdentifikasi, type SubIdentifikasi } from "@/lib/identifikasi";

export type ItemAntre = {
  id: string;
  pemilik: number;
  path: string;
  /** isi POST (JSON) */
  body: Record<string, unknown>;
  /** pembeda isian (mis. idsubsls): isian baru dengan kunci sama menggantikan yang menunggu */
  kunci: string;
  at: number;
  coba: number;
  status: "menunggu" | "ditolak";
  galat?: string;
};

const PATH_IDENTIFIKASI = "/api/portal/identifikasi";
const pemantau = new Set<() => void>();
let sedangKirim: Promise<void> | null = null;

function baca(): ItemAntre[] {
  try {
    const a = JSON.parse(localStorage.getItem(KUNCI_ANTREAN) ?? "[]");
    return Array.isArray(a) ? (a as ItemAntre[]) : [];
  } catch {
    return [];
  }
}
function tulis(a: ItemAntre[]) {
  try {
    localStorage.setItem(KUNCI_ANTREAN, JSON.stringify(a));
  } catch {
    /* penuh: abaikan */
  }
  pemantau.forEach((f) => f());
}
const milikku = (a: ItemAntre[]) => {
  const p = pemilikSesi();
  return p ? a.filter((x) => x.pemilik === p) : [];
};

// ---------------------------------------------------------------- tampilan sementara (hasil yang belum terkirim)
type DataIdf = { sub: SubIdentifikasi[]; ringkas: unknown } & Record<string, unknown>;

function terapkanIdentifikasi(d: DataIdf, items: ItemAntre[]): DataIdf {
  const per = new Map(items.filter((x) => x.path === PATH_IDENTIFIKASI && x.status === "menunggu").map((x) => [String(x.body.idsubsls), x]));
  if (per.size === 0 || !Array.isArray(d.sub)) return d;
  const sub = d.sub.map((s) => {
    const it = per.get(s.idsubsls);
    if (!it) return s;
    const r = periksaIsian(it.body);
    if (!r.ok) return s;
    return { ...s, hasil: { ...r.isi, diperbarui_at: new Date(it.at).toISOString(), oleh: s.hasil?.oleh ?? null } } as SubIdentifikasi;
  });
  return { ...d, sub, ringkas: ringkasIdentifikasi(sub) };
}

daftarkanTumpuk(PATH_IDENTIFIKASI, (data) => terapkanIdentifikasi(data as DataIdf, milikku(baca())));

// ---------------------------------------------------------------- antre & kirim
/**
 * Simpan hasil: tampil seketika di layar & simpanan lokal, lalu dikirim di belakang. Mengembalikan segera (tidak menunggu server).
 * Isian harus sudah lolos periksaIsian (dipanggil lagi di sini sebagai pagar).
 */
export function kirimAtauAntre(path: string, body: Record<string, unknown>, kunci: string): { ok: true } | { ok: false; pesan: string } {
  const pemilik = pemilikSesi();
  if (!pemilik) return { ok: false, pesan: "Sesi berakhir. Silakan masuk kembali." };
  if (path === PATH_IDENTIFIKASI) {
    const cek = periksaIsian(body);
    if (!cek.ok) return { ok: false, pesan: cek.pesan };
  }
  const semua = baca().filter((x) => !(x.pemilik === pemilik && x.kunci === kunci && x.path === path && x.status === "menunggu"));
  const item: ItemAntre = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, pemilik, path, body, kunci, at: Date.now(), coba: 0, status: "menunggu" };
  tulis([...semua, item]);
  // tampil seketika
  if (path === PATH_IDENTIFIKASI) {
    ubahCache<DataIdf>(PATH_IDENTIFIKASI, (d) => terapkanIdentifikasi(d, [item]));
    tandaBasi("/api/portal/induk"); // ringkasan di Beranda/tahap dihitung ulang di belakang
  }
  pasangPemicu(); // kirim ulang otomatis (online lagi / aplikasi dibuka lagi / tiap menit) walau petugas tidak lewat Beranda
  void kirimAntrean();
  return { ok: true };
}

/** Kirim semua yang menunggu (milik akun yang sedang masuk). Aman dipanggil berulang; satu proses sekaligus. */
export function kirimAntrean(): Promise<void> {
  if (sedangKirim) return sedangKirim;
  sedangKirim = (async () => {
    for (;;) {
      const pemilik = pemilikSesi();
      if (!pemilik || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
      const item = baca().find((x) => x.pemilik === pemilik && x.status === "menunggu");
      if (!item) return;
      try {
        await apiPortal(item.path, { method: "POST", body: JSON.stringify(item.body) });
        tulis(baca().filter((x) => x.id !== item.id));
      } catch (e) {
        const g = e as GalatApi;
        if (g.message === "SESI_BERAKHIR") return; // tetap menunggu; terkirim setelah masuk lagi
        const status = g.status;
        const tolak = status !== undefined && status >= 400 && status < 500;
        tulis(baca().map((x) => (x.id === item.id ? { ...x, coba: x.coba + 1, ...(tolak ? { status: "ditolak" as const, galat: g.message } : {}) } : x)));
        if (!tolak) return; // sinyal / server sibuk: berhenti, coba lagi nanti
        tandaBasi(PATH_IDENTIFIKASI); // ditolak: ambil data server agar tampilan kembali benar
      }
    }
  })().finally(() => {
    sedangKirim = null;
  });
  return sedangKirim;
}

export function buangDitolak(id?: string) {
  tulis(baca().filter((x) => !(x.status === "ditolak" && (!id || x.id === id))));
  tandaBasi(PATH_IDENTIFIKASI);
}

let terpasang = false;
function pasangPemicu() {
  if (terpasang || typeof window === "undefined") return;
  terpasang = true;
  const k = () => void kirimAntrean();
  window.addEventListener("online", k);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && k());
  setInterval(() => document.visibilityState === "visible" && baca().length > 0 && k(), 60_000);
  k();
}

/** Pasang pemicu kirim ulang otomatis (idempoten). Dipanggil dari Beranda & halaman identifikasi. */
export function usePengirimAntrean() {
  useEffect(() => {
    pasangPemicu();
  }, []);
}

export function useAntrean() {
  const [daftar, setDaftar] = useState<ItemAntre[]>([]);
  const segarkan = useCallback(() => setDaftar(milikku(baca())), []);
  useEffect(() => {
    segarkan();
    pemantau.add(segarkan);
    window.addEventListener("storage", segarkan);
    return () => {
      pemantau.delete(segarkan);
      window.removeEventListener("storage", segarkan);
    };
  }, [segarkan]);
  return {
    menunggu: daftar.filter((x) => x.status === "menunggu"),
    ditolak: daftar.filter((x) => x.status === "ditolak"),
    kirimSekarang: kirimAntrean,
    buangDitolak,
  };
}
