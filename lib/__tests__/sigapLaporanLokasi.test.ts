// lib/__tests__/sigapLaporanLokasi.test.ts
//
// (27 Okt 2026) Korwil boleh menyimpan laporan harian tanpa lokasi; peran lain tetap wajib minimal 1 lokasi.

import { describe, expect, it } from "vitest";
import { bolehSimpanLaporan, galatLokasiLaporan, lokasiWajib, petunjukSimpanLaporan, teksTanpaLokasi } from "@/lib/sigapLaporanLokasi";

describe("lokasiWajib", () => {
  it("korwil tidak wajib; PML, PPL, dan peran lain wajib", () => {
    expect(lokasiWajib("korwil")).toBe(false);
    expect(lokasiWajib("pml")).toBe(true);
    expect(lokasiWajib("ppl")).toBe(true);
    expect(lokasiWajib("instruktur")).toBe(true);
  });

  it("tidak peka huruf besar dan spasi; peran kosong dianggap wajib (aman)", () => {
    expect(lokasiWajib(" Korwil ")).toBe(false);
    expect(lokasiWajib("KORWIL")).toBe(false);
    expect(lokasiWajib(null)).toBe(true);
    expect(lokasiWajib(undefined)).toBe(true);
    expect(lokasiWajib("")).toBe(true);
  });
});

describe("galatLokasiLaporan (server)", () => {
  it("lokasi kosong: korwil lolos, PML dan PPL ditolak dengan pesan lama", () => {
    expect(galatLokasiLaporan("korwil", 0)).toBeNull();
    expect(galatLokasiLaporan("pml", 0)).toBe("Pilih minimal 1 lokasi.");
    expect(galatLokasiLaporan("ppl", 0)).toBe("Pilih minimal 1 lokasi.");
  });

  it("ada lokasi: semua peran lolos", () => {
    expect(galatLokasiLaporan("korwil", 1)).toBeNull();
    expect(galatLokasiLaporan("pml", 2)).toBeNull();
  });
});

describe("petunjukSimpanLaporan dan bolehSimpanLaporan (formulir)", () => {
  const dasar = { butuhAlasan: false, sibuk: false };

  it("korwil: jumlah terisi, lokasi kosong -> tombol aktif, tanpa petunjuk", () => {
    const m = { peran: "korwil", jumlahLokasi: 0, jumlah: "3" };
    expect(petunjukSimpanLaporan(m)).toBeNull();
    expect(bolehSimpanLaporan({ ...m, ...dasar })).toBe(true);
  });

  it("PML: lokasi kosong -> tombol mati dan ada petunjuk yang menyebut lokasi", () => {
    const m = { peran: "pml", jumlahLokasi: 0, jumlah: "3" };
    expect(petunjukSimpanLaporan(m)).toMatch(/lokasi/i);
    expect(bolehSimpanLaporan({ ...m, ...dasar })).toBe(false);
  });

  it("jumlah kosong -> mati untuk semua peran, petunjuk menyebut jumlah (didahulukan)", () => {
    for (const peran of ["korwil", "pml", "ppl"]) {
      const m = { peran, jumlahLokasi: 1, jumlah: "" };
      expect(petunjukSimpanLaporan(m)).toMatch(/jumlah/i);
      expect(bolehSimpanLaporan({ ...m, ...dasar })).toBe(false);
    }
    expect(petunjukSimpanLaporan({ peran: "pml", jumlahLokasi: 0, jumlah: "  " })).toMatch(/jumlah/i);
  });

  it("jumlah 0 sah (laporan nihil)", () => {
    expect(bolehSimpanLaporan({ peran: "korwil", jumlahLokasi: 0, jumlah: "0", ...dasar })).toBe(true);
    expect(bolehSimpanLaporan({ peran: "pml", jumlahLokasi: 1, jumlah: "0", ...dasar })).toBe(true);
  });

  it("sibuk menyimpan atau butuh alasan -> mati walau isian lengkap", () => {
    const m = { peran: "ppl", jumlahLokasi: 2, jumlah: "10" };
    expect(bolehSimpanLaporan({ ...m, butuhAlasan: false, sibuk: true })).toBe(false);
    expect(bolehSimpanLaporan({ ...m, butuhAlasan: true, sibuk: false })).toBe(false);
    expect(bolehSimpanLaporan({ ...m, butuhAlasan: false, sibuk: false })).toBe(true);
  });
});

describe("teksTanpaLokasi", () => {
  it("korwil: teks 'tidak wajib'; peran lain: 'Belum ada lokasi.'", () => {
    expect(teksTanpaLokasi("korwil")).toMatch(/tidak wajib/);
    expect(teksTanpaLokasi("pml")).toBe("Belum ada lokasi.");
  });
});
