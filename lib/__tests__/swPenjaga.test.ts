// lib/__tests__/swPenjaga.test.ts
//
// (14 Nov 2026, luring langkah 1) Tes PENJAGA aturan luring (docs/luring-aturan.md, nomor L1-L9). Membaca teks public/sw.js dan push.ps1.
// JANGAN dihapus atau dilonggarkan tanpa persetujuan Iqbal. Bila gagal: berhenti, laporkan, jangan push.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const akar = join(__dirname, "..", "..");
const sw = readFileSync(join(akar, "public", "sw.js"), "utf8");
const konst = (nama: string): string | null => sw.match(new RegExp(`const ${nama} = "([^"]+)"`))?.[1] ?? null;

describe("penjaga luring (docs/luring-aturan.md)", () => {
  it("L1: berkas aturan dan service worker ada", () => {
    expect(existsSync(join(akar, "docs", "luring-aturan.md"))).toBe(true);
    expect(sw.length).toBeGreaterThan(1000);
  });
  it("L2: halaman kamera disimpan, jaringan dulu dengan batas tunggu, salinannya tidak dipangkas", () => {
    expect(konst("HALAMAN_KAMERA")).toBe("/sigap/foto");
    expect(sw).toMatch(/const TUNGGU_JARINGAN_MS = \d+;/);
    expect(sw).toMatch(/function halamanKamera\(/);
    expect(sw).toMatch(/\.filter\(\(r\) => r\.url !== halaman\)/); // pangkas() mengecualikan halaman kamera
  });
  it("L3: cache peta dan aplikasi tidak dibuang saat ganti versi; namanya tetap", () => {
    expect(konst("CACHE_PETA")).toBe("sigap-peta-v1");
    expect(konst("CACHE_APP")).toBe("sigap-app-v1");
    const aktif = sw.slice(sw.indexOf('addEventListener("activate"'), sw.indexOf("async function pangkas"));
    expect(aktif).toContain("k !== CACHE_PETA");
    expect(aktif).toContain("k !== CACHE_APP");
    expect(aktif).toContain("k !== VERSI");
  });
  it("L4: service worker tidak menghapus antrean (IndexedDB/localStorage)", () => {
    expect(sw).not.toMatch(/indexedDB\.deleteDatabase/);
    expect(sw).not.toMatch(/localStorage\.clear|localStorage\.removeItem/);
  });
  it("L5: API tidak dilayani dari simpanan; halaman jaringan dulu", () => {
    expect(sw).not.toMatch(/caches\.match\([^)]*\/api\//);
    expect(sw).toMatch(/if \(req\.method !== "GET" \|\| req\.mode !== "navigate"\) return;/);
    expect(sw).toMatch(/fetch\(req\)\s*\.catch\(/);
  });
  it("L6: offline.html dan ikon disimpan saat pemasangan dan dipakai saat navigasi gagal", () => {
    expect(sw).toMatch(/BERKAS_OFFLINE = \[[^\]]*"\/offline\.html"/);
    expect(sw).toMatch(/caches\.match\("\/offline\.html"\)/);
    expect(existsSync(join(akar, "public", "offline.html"))).toBe(true);
    expect(existsSync(join(akar, "public", "icons", "icon-192.png"))).toBe(true);
  });
  it("L7: berkas statis cache-first dan dibatasi", () => {
    expect(sw).toMatch(/pathname\.startsWith\("\/_next\/static\/"\)/);
    expect(sw).toMatch(/const MAKS_BERKAS_APP = \d+;/);
  });
  it("L8: pesan simpan-halaman-kamera tetap didukung", () => {
    expect(sw).toContain('"simpan-halaman-kamera"');
    expect(sw).toMatch(/async function simpanHalamanKamera\(/);
  });
  it("L9: push.ps1 menjalankan npm test dan berhenti bila gagal", () => {
    const ps = readFileSync(join(akar, "push.ps1"), "utf8");
    expect(ps).toMatch(/npm test/);
    expect(ps).toMatch(/\$LASTEXITCODE -ne 0/);
    expect(ps.indexOf("npm test")).toBeLessThan(ps.indexOf("git push"));
  });
});
