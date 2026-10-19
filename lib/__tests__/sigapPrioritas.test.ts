import { describe, expect, it } from "vitest";
import { tugasDariInduk } from "@/lib/sigapPrioritas";
import type { ModulTahap, TahapHasil } from "@/lib/sigapTahap";

const mod = (kode: string, status: ModulTahap["status"], o: Partial<ModulTahap> = {}): ModulTahap => ({ kode, judul: kode, ket: `ket ${kode}`, status, href: `/x/${kode}`, pecahan: 0, ...o });
const tahap = (no: number, modul: ModulTahap[]): TahapHasil => ({ kode: `t${no}`, urutan: no, nama: "Pendataan", uraian: null, isi: modul.map((m) => m.kode), buka_mode: "langsung", buka_tanggal: null, no, status: "berjalan", modul, terkunci: false, alasanKunci: null, rute: `/sigap/kegiatan/p/t${no}`, ringkas: "", pecahan: 0 });
const induk = { kode: "p", nama: "Pendataan", ikon: "bencana" as const };
const NOW = Date.parse("2026-10-19T03:00:00Z");

describe("tugasDariInduk: kartu utama per peran", () => {
  it("korwil (monitoring berjalan) -> kartu utama = Monitoring Korwil, bukan Transport Lokal yang hanya 'perlu' di tahap berikutnya", () => {
    const t = [tahap(3, [mod("monitoring_korwil", "berjalan"), mod("pendataan", "selesai")]), tahap(4, [mod("translok:1", "perlu")])];
    const u = tugasDariInduk(induk, t, [], NOW);
    expect(u?.judul).toBe("monitoring_korwil");
    expect(u?.label).toBe("TAHAP 3 · PENDATAAN");
  });
  it("Transport Lokal mendesak (tingkat 1) tetap mengalahkan monitoring", () => {
    const t = [tahap(3, [mod("monitoring_korwil", "berjalan")]), tahap(4, [mod("translok:1", "mendesak")])];
    expect(tugasDariInduk(induk, t, [], NOW)?.label).toBe("TAHAP 4 · PENDATAAN");
  });
  it("uraian memakai kata 'Tugas i dari n' (bukan 'Langkah')", () => {
    const t = [tahap(3, [mod("identifikasi", "selesai"), mod("pendataan", "perlu")])];
    const u = tugasDariInduk(induk, t, [], NOW);
    expect(u?.uraian).toBe("Tugas 2 dari 2 · ket pendataan");
    expect(u?.progres).toEqual({ selesai: 1, total: 2 });
  });
  it("PPL tanpa monitoring: kartu utama = Lembar Pendataan", () => {
    const t = [tahap(3, [mod("wilayah_tim", "berjalan"), mod("pendataan", "berjalan")])];
    expect(tugasDariInduk(induk, t, [], NOW)?.judul).toBe("pendataan");
  });
});

import { ketTranslok } from "@/lib/sigapTahap";
describe("ketTranslok: keterangan baris Transport Lokal", () => {
  it("memakai kekurangan teratas, dengan jumlah sisanya", () => {
    const k = (ringkas: string) => ({ ringkas }) as never;
    expect(ketTranslok({ sub: "2/5 · x", kekurangan: [k("Foto kurang 2"), k("Laporan 14 Okt kosong")] })).toBe("Foto kurang 2 · +1 lagi");
    expect(ketTranslok({ sub: "2/5 · x", kekurangan: [k("Foto kurang 2")] })).toBe("Foto kurang 2");
  });
  it("tanpa kekurangan: '3/5 ·' dibaca 'Langkah 3 dari 5 ·'", () => {
    expect(ketTranslok({ sub: "3/5 · Pilih hari kerja" })).toBe("Langkah 3 dari 5 · Pilih hari kerja");
    expect(ketTranslok({ sub: "Selesai", kekurangan: [] })).toBe("Selesai");
  });
});
