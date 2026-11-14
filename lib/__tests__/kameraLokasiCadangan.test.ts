// lib/__tests__/kameraLokasiCadangan.test.ts
// (14 Nov 2026) Penjaga: kamera SIGAP tidak boleh bergantung pada GPS akurasi tinggi saja (laporan Yola: di dalam ruangan "Lokasi belum terbaca" terus).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("app/sigap/foto/KameraSigap.tsx", "utf8");

describe("kamera SIGAP: lokasi cadangan", () => {
  it("memasang watch lokasi jaringan (enableHighAccuracy:false) sebagai cadangan", () => {
    expect(src).toMatch(/enableHighAccuracy: true/);
    expect(src).toMatch(/enableHighAccuracy: false/);
    expect(src).toMatch(/pasang\(\);/);
  });
  it("memakai bacaan paling akurat yang masih baru dan membuang simpanan lama", () => {
    expect(src).toMatch(/baru\.akurasi <= lama\.akurasi/);
    expect(src).toMatch(/Date\.now\(\) - p\.timestamp > 120_000/);
  });
  it("cadangan dibersihkan saat kamera ditutup", () => {
    expect(src).toMatch(/clearWatch\(cadanganRef\.current\)/);
  });
});
