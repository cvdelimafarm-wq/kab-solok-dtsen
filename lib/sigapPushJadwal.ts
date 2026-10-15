// lib/sigapPushJadwal.ts
//
// (15 Okt 2026) Aturan PUSH TERJADWAL pengingat "yang belum dilengkapi" (dikirim server pada jam tertentu lewat cron, tanpa migrasi).
// Murni (tanpa React/DB) supaya mudah diuji. Pelaksananya: app/api/sigap/pengingat-push/route.ts.
//
// JADWAL (WIB), 4 titik dipanggil cron Railway:
//   pagi  07.00 -> hanya yang perlu disiapkan: izin susulan, pilih hari kerja
//   siang 13.00 -> kekurangan "hari ini" (foto/laporan/lembar) dan izin susulan, skor >= 72
//   sore  17.00 -> sama seperti siang
//   malam 22.15 -> hanya yang MENDESAK (sisa < 2 jam) dan izin susulan mendesak, skor >= 88
// BATAS: tidak ada kiriman di luar 06.00-22.59 WIB; maksimal MAKS_PUSH_PER_HARI per akun per hari; kekurangan yang SAMA (kunci kode|judul) tidak
// dikirim dua kali pada hari yang sama; "hari terlewat" tidak pernah dikirim. Isi pesan = isi kartu/modal (satu sumber: lib/sigapKekurangan.ts).

import type { Kekurangan } from "@/lib/sigapKekurangan";
import { kunciKekurangan } from "@/lib/sigapPengingat";
import { MAKS_ISI_PUSH, MAKS_JUDUL_PUSH, urlInternalAman, type PesanPush } from "@/lib/sigapPushUtil";

export type SlotPush = "pagi" | "siang" | "sore" | "malam";
export const SLOT_PUSH: SlotPush[] = ["pagi", "siang", "sore", "malam"];
export const MAKS_PUSH_PER_HARI = 3;
export const JENIS_LOG_PUSH = "pengingat_terjadwal";

export const adalahSlotPush = (x: unknown): x is SlotPush => typeof x === "string" && (SLOT_PUSH as string[]).includes(x);

const jamWib = (nowMs: number): number => new Date(nowMs + 7 * 3_600_000).getUTCHours();

/** Slot menurut jam WIB bila cron tidak menyebut slot. */
export function slotDariJam(nowMs: number): SlotPush {
  const j = jamWib(nowMs);
  if (j < 10) return "pagi";
  if (j < 15) return "siang";
  if (j < 20) return "sore";
  return "malam";
}

/** Jam senyap: tidak ada kiriman 23.00-05.59 WIB (cron salah jalan tidak membangunkan petugas). */
export const jamSenyap = (nowMs: number): boolean => {
  const j = jamWib(nowMs);
  return j >= 23 || j < 6;
};

export function layakUntukSlot(k: Kekurangan, slot: SlotPush): boolean {
  if (k.jenis === "hari_terlewat") return false;
  if (slot === "pagi") return k.jenis === "perbaikan" || k.jenis === "izin_susulan" || k.jenis === "hari_kerja";
  if (slot === "malam") return k.skor >= 88;
  return k.skor >= 72 && k.jenis !== "hari_kerja";
}

export type RiwayatHariIni = { jumlah: number; kunci: string[] };

/** Pilih satu kekurangan untuk dikirim ke satu akun pada slot ini (atau null). `kek` boleh tak terurut. */
export function pilihPushJadwal(kek: Kekurangan[], slot: SlotPush, nowMs: number, riwayat: RiwayatHariIni): Kekurangan | null {
  if (jamSenyap(nowMs) || riwayat.jumlah >= MAKS_PUSH_PER_HARI) return null;
  const sudah = new Set(riwayat.kunci);
  return kek.filter((k) => layakUntukSlot(k, slot) && !sudah.has(kunciKekurangan(k))).sort((a, b) => b.skor - a.skor)[0] ?? null;
}

const potong = (t: string, maks: number): string => (t.length <= maks ? t : `${t.slice(0, maks - 1).trimEnd()}…`);

/** Pesan push dari kekurangan: judul dipotong, isi dipotong, tautan harus internal (selain itu "/"). */
export function susunPesanPush(k: Kekurangan): PesanPush {
  const awal = k.nada === "merah" ? "Segera: " : "";
  return {
    judul: potong(`${awal}${k.judul}`.replace(/\s+/g, " ").trim(), MAKS_JUDUL_PUSH),
    isi: potong(`${k.uraian} Ketuk untuk ${k.aksi.charAt(0).toLowerCase()}${k.aksi.slice(1)}.`.replace(/\s+/g, " ").trim(), MAKS_ISI_PUSH),
    url: urlInternalAman(k.href) ?? "/",
  };
}

/** Awal hari WIB (ISO UTC) dari ms epoch -- batas bawah pencarian riwayat kiriman hari ini. */
export function awalHariWibIso(nowMs: number): string {
  const wib = new Date(nowMs + 7 * 3_600_000);
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()) - 7 * 3_600_000).toISOString();
}
