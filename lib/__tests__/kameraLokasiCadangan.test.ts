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

describe("sumber lokasi foto (putusan 14 Nov)", () => {
  it("HP mengirim sumber_lokasi gps/jaringan; server hanya menyimpan nilai sah; layar periksa menampilkannya", () => {
    const antre = readFileSync("app/sigap/foto/antreanFoto.ts", "utf8");
    const rute = readFileSync("app/api/sigap/foto/route.ts", "utf8");
    const periksa = readFileSync("app/sigap/foto/PeriksaFoto.tsx", "utf8");
    expect(src).toMatch(/terima\(p, "gps"\)/);
    expect(src).toMatch(/terima\(p, "jaringan"\)/);
    expect(antre).toMatch(/f\.append\("sumber_lokasi"/);
    expect(rute).toMatch(/s === "gps" \|\| s === "jaringan"/);
    expect(periksa).toMatch(/jaringan Wi-Fi\/seluler/);
  });
});
