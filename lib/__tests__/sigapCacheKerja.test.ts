// lib/__tests__/sigapCacheKerja.test.ts
//
// (28 Okt 2026) Simpanan data halaman kerja: tautan foto kedaluwarsa dibuang, pesan galat tetap seperti semula.

import { describe, expect, it } from "vitest";
import { BATAS_URL_FOTO_MS, buangUrlFotoLama, galatMuatKerja, hariWib, simpananHariIni } from "@/lib/sigapCacheKerja";

const data = () => ({
  hari_ini: "2026-10-28",
  penugasan: [
    { id: 1, hari: [{ tanggal: "2026-10-28", foto: [{ slot: 1, url: "https://x/a", susulan: false }, { slot: 2, url: null, susulan: false }] }, { tanggal: "2026-10-29" }] },
    { id: 2 },
  ],
});

describe("buangUrlFotoLama", () => {
  it("data muda: objek yang sama, tidak disalin", () => {
    const d = data();
    expect(buangUrlFotoLama(d, 1000)).toBe(d);
    expect(buangUrlFotoLama(d, BATAS_URL_FOTO_MS)).toBe(d);
  });

  it("data lama: semua url foto menjadi null, bagian lain utuh, data asli tidak berubah", () => {
    const d = data();
    const h = buangUrlFotoLama(d, BATAS_URL_FOTO_MS + 1);
    expect(h).not.toBe(d);
    expect(h.penugasan[0].hari![0].foto!.map((f) => f.url)).toEqual([null, null]);
    expect(h.penugasan[0].hari![0].foto![0]).toMatchObject({ slot: 1, susulan: false });
    expect(h.penugasan[0].hari![1]).toEqual({ tanggal: "2026-10-29" });
    expect(h.penugasan[1]).toEqual({ id: 2 });
    expect(h.hari_ini).toBe("2026-10-28");
    expect(d.penugasan[0].hari![0].foto![0].url).toBe("https://x/a");
  });

  it("tanpa daftar penugasan: dikembalikan apa adanya", () => {
    const d: { hari_ini: string; penugasan?: undefined } = { hari_ini: "x" };
    expect(buangUrlFotoLama(d, BATAS_URL_FOTO_MS * 5)).toBe(d);
  });
});

describe("galatMuatKerja", () => {
  it("tanpa status = jaringan terputus", () => {
    expect(galatMuatKerja(new Error("Failed to fetch"))).toEqual({ sesiTidakSah: false, pesan: "Koneksi terputus. Periksa sinyal, lalu coba lagi." });
    expect(galatMuatKerja(new TypeError("x"))).toMatchObject({ sesiTidakSah: false });
  });

  it("404 = token tidak dikenal; pesan server dipakai", () => {
    expect(galatMuatKerja(Object.assign(new Error("Sesi tidak valid. Silakan masuk kembali."), { status: 404 }))).toEqual({ sesiTidakSah: true, pesan: "Sesi tidak valid. Silakan masuk kembali." });
  });

  it("403 membawa pesan server (belum ditugaskan)", () => {
    expect(galatMuatKerja(Object.assign(new Error("Anda belum ditugaskan."), { status: 403 }))).toEqual({ sesiTidakSah: false, pesan: "Anda belum ditugaskan." });
  });

  it("5xx tanpa pesan server (pesan bawaan 'Gagal (502)') = server sibuk; 4xx umum = gagal memuat", () => {
    expect(galatMuatKerja(Object.assign(new Error("Gagal (502)"), { status: 502 })).pesan).toBe("Server sedang sibuk. Coba lagi sebentar lagi.");
    expect(galatMuatKerja(Object.assign(new Error("Gagal (400)"), { status: 400 })).pesan).toBe("Gagal memuat.");
    expect(galatMuatKerja(Object.assign(new Error("Gagal (404)"), { status: 404 }))).toEqual({ sesiTidakSah: true, pesan: "Gagal memuat." });
  });

  it("galat 500 dengan pesan dari server memakai pesan itu", () => {
    expect(galatMuatKerja(Object.assign(new Error("Terjadi kesalahan di server. Coba lagi sebentar lagi."), { status: 500 })).pesan).toBe("Terjadi kesalahan di server. Coba lagi sebentar lagi.");
  });

  it("nilai aneh tidak melempar", () => {
    expect(galatMuatKerja(null).pesan).toContain("Koneksi");
    expect(galatMuatKerja("x").pesan).toContain("Koneksi");
  });
});

describe("hari WIB", () => {
  it("hariWib memakai zona WIB (UTC+7), termasuk pergantian hari", () => {
    expect(hariWib(Date.parse("2026-10-28T16:59:59Z"))).toBe("2026-10-28");
    expect(hariWib(Date.parse("2026-10-28T17:00:00Z"))).toBe("2026-10-29");
  });
  it("simpananHariIni hanya cocok bila tanggalnya sama dengan hari ini", () => {
    const sekarang = Date.parse("2026-10-28T03:00:00Z");
    expect(simpananHariIni("2026-10-28", sekarang)).toBe(true);
    expect(simpananHariIni("2026-10-27", sekarang)).toBe(false);
    expect(simpananHariIni(undefined, sekarang)).toBe(false);
  });
});
