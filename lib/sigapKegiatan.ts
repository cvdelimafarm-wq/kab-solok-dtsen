// lib/sigapKegiatan.ts
//
// (8 Okt 2026) Struktur 3 layer (mockup disetujui user): Layer 1 = ikon bulat "Kegiatan saya" dengan cincin progres + tanda seru bila mendesak;
// Layer 2 = tahapan bernomor di dalam satu kegiatan; Layer 3 = halaman kerja yang sudah ada.
// Berkas ini murni (tanpa React/DB): tipe bersama server-klien, ringkasan kegiatan dari data pelatihan/kartu, pengurutan mendesak-dulu.

import { bagiFoto, keadaanHari } from "@/lib/sigapPresensi";
import { tugasUtamaPelatihan, type HubTugas, type IkonKode, type KartuRingkas, type TugasUtama } from "@/lib/sigapTugasUtama";

export type NadaKegiatan = "merah" | "emas" | "biru" | "abu" | "hijau";
export type StatusLangkah = "selesai" | "mendesak" | "perlu" | "sekarang" | "berjalan" | "menunggu" | "terkunci";
export type KelompokLangkah = "Persiapan" | "Pelaksanaan" | "Penyelesaian";

export type LangkahKegiatan = {
  no: number;
  kode: string;
  kelompok: KelompokLangkah;
  judul: string;
  ket: string;
  status: StatusLangkah;
  /** halaman kerja (Layer 3); kosong = belum bisa dibuka */
  href?: string | null;
  aksi?: string;
  /** batas waktu (ISO) untuk hitung mundur di kartu "Kerjakan sekarang" */
  batas?: string | null;
  /** (10 Okt 2026) Bila terisi, langkah ini TERKUNCI sementara (mis. di luar hari kerja): ketukan menampilkan pesan ini, tidak membuka halaman kerja. */
  pesanKunci?: string | null;
};

export type RingkasKegiatan = {
  id: string;
  judul: string;
  /** label pendek di bawah ikon */
  pendek: string;
  ikon: IkonKode;
  nada: NadaKegiatan;
  /** 0..1; null = progres tidak terukur (cincin kosong bergaris) */
  pecahan: number | null;
  selesai: number | null;
  total: number | null;
  /** teks kecil di bawah nama, mis. "3/5 · Foto kurang 2" */
  sub: string;
  /** tanda seru di pojok ikon */
  peringatan: boolean;
  /** tujuan ketukan: Layer 2 (/sigap/kegiatan/..) atau langsung halaman kerja */
  href: string | null;
  sso?: "penyisiran";
  langkah?: LangkahKegiatan[];
  /** (9 Okt 2026) sigap_kegiatan.id untuk Transport Lokal, dipakai tahap kegiatan induk (lib/sigapTahap.ts) */
  kegiatan_id?: number;
};

export const URUT_NADA: Record<NadaKegiatan, number> = { merah: 0, emas: 1, biru: 2, abu: 3, hijau: 4 };

/** Mendesak di atas, selesai paling bawah; urutan asli dipertahankan dalam satu tingkat. */
export function urutKegiatan<T extends { nada: NadaKegiatan }>(daftar: T[]): T[] {
  return daftar.map((x, i) => ({ x, i })).sort((a, b) => URUT_NADA[a.x.nada] - URUT_NADA[b.x.nada] || a.i - b.i).map((v) => v.x);
}

/** Nomor langkah yang sedang dikerjakan (pertama yang belum selesai) dan total, untuk "Langkah x dari n". */
export function langkahKe(l: { status: StatusLangkah }[]): { ke: number; total: number } {
  const i = l.findIndex((x) => x.status !== "selesai");
  return { ke: i < 0 ? l.length : i + 1, total: l.length };
}

export const KELOMPOK_URUT: KelompokLangkah[] = ["Persiapan", "Pelaksanaan", "Penyelesaian"];

type HubKegiatan = HubTugas & { nama?: string };

/**
 * Ringkasan pelatihan untuk ikon Layer 1. Mencerminkan daftar langkah halaman /sigap/pelatihan (undangan, instrumen, pretest, presensi,
 * foto sebelum posttest, posttest, foto sesudah posttest; kuis "Adu Sigap" tidak dihitung wajib).
 */
export function ringkasPelatihan(hub: HubKegiatan, nowMs: number): RingkasKegiatan | null {
  if (!hub.peserta) return null;
  const L = hub.langkah;
  const tes = (j: string) => hub.tes.find((t) => t.jenis === j);
  const { awal, akhir } = bagiFoto(L?.foto_total ?? 5);
  const fotoSelesai = (slot: number[]) => slot.length > 0 && slot.every((s) => L?.slot.includes(s));
  const kh = hub.presensi ? keadaanHari(hub.presensi.hari, nowMs) : null;
  const wajib: { selesai: boolean; terlewat: boolean }[] = [
    { selesai: !!L?.undangan_dibuka, terlewat: false },
    { selesai: !!L?.instrumen_diunduh, terlewat: false },
    { selesai: tes("pretest")?.status === "selesai", terlewat: tes("pretest")?.status === "terlewat" },
    { selesai: !!hub.presensi?.sudah, terlewat: !!kh && !kh.lengkap && !kh.aktif && !kh.berikutnya },
    ...(awal.length ? [{ selesai: fotoSelesai(awal), terlewat: false }] : []),
    { selesai: tes("posttest")?.status === "selesai", terlewat: tes("posttest")?.status === "terlewat" },
    ...(akhir.length ? [{ selesai: fotoSelesai(akhir), terlewat: false }] : []),
  ];
  const total = wajib.length;
  const selesai = wajib.filter((x) => x.selesai).length;
  const terlewat = wajib.filter((x) => !x.selesai && x.terlewat).length;
  const tp = tugasUtamaPelatihan(hub, nowMs);
  const skor = tp?.skor ?? 0;
  let nada: NadaKegiatan;
  let sub: string;
  if (selesai >= total) {
    nada = "hijau";
    sub = "Selesai";
  } else if (skor >= 90) {
    nada = "merah";
    sub = tp!.judul;
  } else if (skor >= 55 || terlewat > 0) {
    nada = "emas";
    sub = terlewat > 0 && skor < 55 ? `${terlewat} langkah terlewat` : (tp?.judul ?? "Perlu dilengkapi");
  } else {
    nada = "biru";
    sub = tp && skor >= 40 ? tp.judul : "Berjalan";
  }
  return {
    id: "pelatihan",
    judul: "Pelatihan PSP Pascabencana 2026",
    pendek: "Pelatihan PSP Pascabencana",
    ikon: "langkah",
    nada,
    pecahan: total ? selesai / total : 0,
    selesai,
    total,
    sub: `${selesai}/${total} · ${sub}`,
    peringatan: nada === "merah" || nada === "emas",
    href: "/sigap/pelatihan",
  };
}

const NADA_KARTU: Record<string, NadaKegiatan> = { aktif: "biru", tenggang: "emas", info: "abu", peringatan: "merah", arsip: "abu" };

/** Kegiatan tanpa tahapan terukur (pendataan bencana, penyisiran, usulan DTSEN): ikon langsung membuka halaman kerjanya. */
export function ringkasDariKartu(k: KartuRingkas): RingkasKegiatan | null {
  if (k.grup !== "tugas") return null;
  if (!k.href && !k.sso) return null;
  if (k.kode.startsWith("translok-") || k.kode.startsWith("pelatihan")) return null; // dihitung oleh adapter sendiri
  const ikon: IkonKode = k.kode === "bencana" ? "bencana" : k.kode === "penyisiran" ? "peta" : k.kode === "dtsen-operator" ? "dtsen" : "arsip";
  const pendek = k.kode === "bencana" ? "Pendataan Pascabencana" : k.kode === "penyisiran" ? "Penyisiran SE2026" : k.kode === "dtsen-operator" ? "Usulan DTSEN" : k.judul;
  const nada = k.status ? (NADA_KARTU[k.status.nada] ?? "biru") : "biru";
  return {
    id: k.kode,
    judul: k.judul,
    pendek,
    ikon,
    nada,
    pecahan: null,
    selesai: null,
    total: null,
    sub: k.status?.label ?? "Buka",
    peringatan: nada === "emas" || nada === "merah",
    href: k.href ?? null,
    sso: k.sso === "penyisiran" ? "penyisiran" : undefined,
  };
}

/** Tugas utama dari kegiatan berlangkah (Transport Lokal): langkah mendesak (88) atau perlu dilengkapi (70). */
export function tugasDariKegiatan(daftar: RingkasKegiatan[], nowMs: number): TugasUtama | null {
  let terbaik: TugasUtama | null = null;
  for (const k of daftar) {
    if (!k.langkah) continue;
    const l = k.langkah.find((x) => x.status === "mendesak" || x.status === "perlu");
    if (!l) continue;
    const skor = l.status === "mendesak" ? 88 : 70;
    if (terbaik && terbaik.skor >= skor) continue;
    const sisa = l.batas ? (Date.parse(l.batas) - nowMs) / 1000 : null;
    const p = sisa != null && sisa > 0 ? sisa : null;
    const pad = (n: number) => String(n).padStart(2, "0");
    const teksSisa = p == null ? undefined : p < 3600 ? `sisa ${pad(Math.floor(p / 60))}:${pad(Math.floor(p % 60))}` : `sisa ${Math.floor(p / 3600)} j ${pad(Math.floor((p % 3600) / 60))} mnt`;
    terbaik = {
      skor,
      ikon: k.ikon,
      label: "TUGAS HARI INI",
      judul: l.judul,
      uraian: `${k.pendek}. ${l.ket}`,
      lencana: teksSisa ? { teks: teksSisa, nada: l.status === "mendesak" ? "merah" : "emas" } : undefined,
      progres: k.total ? { selesai: k.selesai ?? 0, total: k.total } : undefined,
      href: l.href ?? k.href ?? "/",
      aksi: l.aksi ?? "Lanjutkan",
    };
  }
  return terbaik;
}
