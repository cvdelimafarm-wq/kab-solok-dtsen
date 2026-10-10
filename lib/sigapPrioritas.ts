// lib/sigapPrioritas.ts
//
// (10 Okt 2026) Aturan UMUM kartu "Tugas aktif" untuk kegiatan induk bertahap -- permintaan user ("buat urutan prioritas; bila tak ada yang prioritas,
// tampilkan tahapan selanjutnya; tombol menuju prioritas; rumusan berlaku general"). Murni (tanpa React/DB) supaya mudah diuji.
//
// URUTAN PRIORITAS (dari paling atas):
//   1. MENDESAK  -- bagian bertahap yang statusnya mendesak (mis. isian hari ini belum lengkap & sisa < 2 jam)            skor 89
//   2. PERLU     -- bagian yang HARUS dikerjakan sekarang: status perlu, atau Lembar Identifikasi/Konfirmasi yang belum selesai  skor 72
//   3. BERIKUTNYA -- tak ada yang perlu dikerjakan sekarang: tampilkan bagian/tahap berikutnya (bukan hari kerja, tahap belum dibuka)  skor 30
//   Seri dalam satu tingkat: tahap lebih awal dulu, lalu urutan modul di tahap itu (= nomor langkah), lalu batas waktu terdekat.
//   Pelatihan TIDAK dihitung di sini (punya aturan sendiri di sigapTugasUtama.tugasUtamaPelatihan); Wilayah tugas tim hanya informasi.
// TOMBOL: menuju langkah yang diprioritaskan itu sendiri (bila modul punya langkah dalam, mis. Transport Lokal -> langkah "Laporan & foto harian"
//   yang sedang terbuka); langkah yang terkunci sementara (pesanKunci) tidak pernah dijadikan tujuan. Pada tingkat BERIKUTNYA tombol "Lihat tahapan".
// KARTU: label = tahap ("TAHAP 3 · PENDATAAN"), judul = tugasnya, uraian = "Langkah i dari n · keterangan" bila tahap punya >= 2 tugas.

import type { LangkahKegiatan, RingkasKegiatan } from "@/lib/sigapKegiatan";
import type { ModulTahap, TahapHasil } from "@/lib/sigapTahap";
import type { IkonKode, TugasUtama } from "@/lib/sigapTugasUtama";

export const SKOR_MENDESAK = 89;
export const SKOR_PERLU = 72;
export const SKOR_BERIKUTNYA = 30;

/** Modul yang berupa TUGAS bernomor (dikerjakan PML/PPL): Lembar Identifikasi & Transport Lokal (kode "translok-<id>" atau "translok:<id>"). */
export const adalahTugas = (kode: string): boolean => kode === "identifikasi" || kode.startsWith("translok");

/** Modul yang tidak ikut dihitung sebagai tugas aktif di sini. */
const DILEWATI = new Set(["pelatihan", "wilayah_tim"]);

const pad = (n: number) => String(n).padStart(2, "0");
function teksSisa(detik: number): string {
  const s = Math.max(0, Math.floor(detik));
  return s < 3600 ? `sisa ${pad(Math.floor(s / 60))}:${pad(s % 60)}` : `sisa ${Math.floor(s / 3600)} j ${pad(Math.floor((s % 3600) / 60))} mnt`;
}

type Calon = {
  tier: 1 | 2;
  tahap: TahapHasil;
  indeks: number;
  modul: ModulTahap;
  langkah: LangkahKegiatan | null;
  batas: number;
};

/** Langkah dalam (mis. Transport Lokal) yang BISA dikerjakan sekarang: mendesak/perlu, punya tujuan, tidak terkunci sementara. */
function langkahAktif(k: RingkasKegiatan | undefined): LangkahKegiatan | null {
  return k?.langkah?.find((l) => (l.status === "mendesak" || l.status === "perlu") && !!l.href && !l.pesanKunci) ?? null;
}

export function tugasDariInduk(induk: { kode: string; nama: string; ikon: IkonKode }, tahap: TahapHasil[], keg: RingkasKegiatan[], nowMs: number): TugasUtama | null {
  const calon: Calon[] = [];
  for (const t of tahap) {
    if (t.terkunci) continue;
    t.modul.forEach((m, indeks) => {
      if (DILEWATI.has(m.kode) || m.status === "selesai") return;
      const k = keg.find((x) => x.id === m.kode);
      if (k?.langkah) {
        // modul bertahap: hanya jadi tugas bila ada langkah dalam yang terbuka sekarang
        const l = langkahAktif(k);
        if (l) calon.push({ tier: l.status === "mendesak" ? 1 : 2, tahap: t, indeks, modul: m, langkah: l, batas: l.batas ? Date.parse(l.batas) : Infinity });
        return;
      }
      const perluSekarang = m.status === "mendesak" || m.status === "perlu" || ((m.kode === "identifikasi" || m.kode === "konfirmasi") && (m.status === "berjalan" || m.status === "sekarang"));
      if (perluSekarang && m.href) calon.push({ tier: m.status === "mendesak" ? 1 : 2, tahap: t, indeks, modul: m, langkah: null, batas: m.batas ? Date.parse(m.batas) : Infinity });
    });
  }

  const ikon = induk.ikon;
  const labelTahap = (t: TahapHasil) => `TAHAP ${t.no} · ${t.nama.toUpperCase()}`;
  const infoLangkah = (t: TahapHasil, m: ModulTahap) => {
    const tugas = t.modul.filter((x) => adalahTugas(x.kode));
    const i = tugas.indexOf(m);
    return { n: tugas.length, no: i >= 0 ? i + 1 : 0, selesai: tugas.filter((x) => x.status === "selesai").length };
  };

  if (calon.length > 0) {
    calon.sort((a, b) => a.tier - b.tier || a.tahap.no - b.tahap.no || a.indeks - b.indeks || a.batas - b.batas);
    const c = calon[0];
    const { n, no, selesai } = infoLangkah(c.tahap, c.modul);
    const kegC = c.langkah ? keg.find((x) => x.id === c.modul.kode) : undefined;
    const ket = c.langkah ? `${kegC?.pendek ?? c.modul.judul} · ${c.langkah.ket}` : c.modul.ket;
    const sisa = c.langkah?.batas ? (Date.parse(c.langkah.batas) - nowMs) / 1000 : null;
    return {
      skor: c.tier === 1 ? SKOR_MENDESAK : SKOR_PERLU,
      ikon,
      label: labelTahap(c.tahap),
      judul: c.langkah ? c.langkah.judul : c.modul.judul,
      uraian: n >= 2 && no > 0 ? `Langkah ${no} dari ${n} · ${ket}` : ket,
      lencana: sisa != null && sisa > 0 ? { teks: teksSisa(sisa), nada: c.tier === 1 ? "merah" : "emas" } : c.tier === 1 ? { teks: "Mendesak", nada: "merah" } : undefined,
      progres: n >= 2 ? { selesai, total: n } : undefined,
      href: (c.langkah ? c.langkah.href : c.modul.href) ?? c.tahap.rute,
      aksi: (c.langkah ? c.langkah.aksi : c.modul.aksi) ?? "Buka",
    };
  }

  // --- tingkat 3: tidak ada yang perlu dikerjakan sekarang -> tampilkan yang berikutnya
  for (const t of tahap) {
    if (t.terkunci) continue;
    for (const m of t.modul) {
      if (DILEWATI.has(m.kode) || m.status === "selesai") continue;
      const k = keg.find((x) => x.id === m.kode);
      const dalam = k?.langkah?.find((l) => l.status !== "selesai" && l.status !== "terkunci") ?? null;
      const { n, no, selesai } = infoLangkah(t, m);
      const ket = dalam ? `${k?.pendek ?? m.judul} · ${dalam.ket}` : m.ket;
      return {
        skor: SKOR_BERIKUTNYA,
        ikon,
        label: `BERIKUTNYA · ${labelTahap(t)}`,
        judul: dalam ? dalam.judul : m.judul,
        uraian: n >= 2 && no > 0 ? `Langkah ${no} dari ${n} · ${ket}` : ket,
        lencana: { teks: "Menunggu", nada: "abu" },
        progres: n >= 2 ? { selesai, total: n } : undefined,
        href: m.href ?? t.rute,
        aksi: "Lihat tahapan",
      };
    }
  }
  const terkunci = tahap.find((t) => t.terkunci);
  if (terkunci) {
    return { skor: SKOR_BERIKUTNYA, ikon, label: "BERIKUTNYA", judul: `Tahap ${terkunci.no} · ${terkunci.nama}`, uraian: terkunci.alasanKunci ?? "Belum dibuka", lencana: { teks: "Belum dibuka", nada: "abu" }, href: terkunci.rute, aksi: "Lihat tahapan" };
  }
  return null;
}
