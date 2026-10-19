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

import { peringatanDariInduk, translokDariInduk } from "@/lib/sigapPrioritas";
import { modalBerlakuUntukPeran } from "@/lib/siaranPetugas";
import type { RingkasKegiatan } from "@/lib/sigapKegiatan";

const kegTL = (o: Partial<RingkasKegiatan> = {}): RingkasKegiatan => ({ id: "translok-10", judul: "Transport Lokal — X", pendek: "TL", ikon: "motor", nada: "emas", pecahan: 0.4, selesai: 2, total: 5, sub: "3/5 · x", peringatan: false, href: "/sigap/kegiatan/translok-10", langkah: [1, 2, 3, 4, 5].map((no) => ({ no, kode: `l${no}`, kelompok: "Pelaksanaan" as const, judul: `L${no}`, ket: `ket ${no}`, status: no <= 2 ? ("selesai" as const) : ("menunggu" as const) })), ...o });

describe("peringatanDariInduk: Kesediaan belum dikonfirmasi", () => {
  it("konfirmasi belum selesai (tanpa halaman) -> peringatan menuju tahap", () => {
    const t = [tahap(1, [mod("konfirmasi", "menunggu", { href: null })]), tahap(2, [mod("monitoring_korwil", "berjalan")])];
    expect(peringatanDariInduk(t, "monitoring_korwil")).toMatchObject({ judul: "Kesediaan belum dikonfirmasi", uraian: "Tahap 1 Pendataan menunggu konfirmasi Anda.", href: "/sigap/kegiatan/p/t1" });
  });
  it("tanpa peringatan: sudah selesai, tahap terkunci, atau kartu utama = konfirmasi", () => {
    expect(peringatanDariInduk([tahap(1, [mod("konfirmasi", "selesai")])], null)).toBeNull();
    expect(peringatanDariInduk([{ ...tahap(1, [mod("konfirmasi", "perlu")]), terkunci: true }], null)).toBeNull();
    expect(peringatanDariInduk([tahap(1, [mod("konfirmasi", "perlu")])], "konfirmasi")).toBeNull();
  });
});

describe("translokDariInduk: kartu Transport Lokal di Beranda", () => {
  const th = [tahap(2, [mod("monitoring_korwil", "berjalan"), mod("translok-10", "perlu")])];
  it("tampil dengan langkah aktif (pertama yang belum selesai)", () => {
    const d = translokDariInduk(th, [kegTL()], "monitoring_korwil");
    expect(d).toMatchObject({ ke: 3, total: 5, aktif: { kode: "l3" } });
  });
  it("tidak tampil bila sudah jadi kartu utama, sudah selesai, tahap terkunci, atau tanpa langkah", () => {
    expect(translokDariInduk(th, [kegTL()], "translok-10")).toBeNull();
    expect(translokDariInduk([tahap(2, [mod("translok-10", "selesai")])], [kegTL()], null)).toBeNull();
    expect(translokDariInduk([{ ...th[0], terkunci: true }], [kegTL()], null)).toBeNull();
    expect(translokDariInduk(th, [kegTL({ langkah: undefined })], null)).toBeNull();
  });
});

describe("modalBerlakuUntukPeran: siaran ke Lembar Pendataan tidak untuk korwil", () => {
  it("tombol ke /sigap/pendataan hanya PML/PPL; tujuan lain untuk semua", () => {
    const korwil = new Set(["korwil"]);
    expect(modalBerlakuUntukPeran("/sigap/pendataan?kolam=1", korwil)).toBe(false);
    expect(modalBerlakuUntukPeran("/sigap/pendataan", korwil)).toBe(false);
    expect(modalBerlakuUntukPeran("/sigap/pendataan?kolam=1", new Set(["pml"]))).toBe(true);
    expect(modalBerlakuUntukPeran("/sigap/pendataan?kolam=1", new Set(["ppl"]))).toBe(true);
    expect(modalBerlakuUntukPeran("/sigap/pendataan?kolam=1", new Set(["korwil", "pml"]))).toBe(true);
    expect(modalBerlakuUntukPeran("https://telkomsel.zoom.us/j/1", korwil)).toBe(true);
    expect(modalBerlakuUntukPeran(null, korwil)).toBe(true);
    expect(modalBerlakuUntukPeran("/sigap/pendataanx", korwil)).toBe(true);
  });
});
