// (7 Okt 2026) SIGAP PEDIA -- test hashing & validasi tipe file berdasarkan isi.
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { sha256 } from "../tsa";
import { bentukFile, validasiJenis, tebakJenis } from "../deteksi";

const F = path.join(__dirname, "fixtures");

describe("hash SHA-256", () => {
  it("sama dgn nilai standar (vektor uji 'abc')", () => {
    expect(sha256(Buffer.from("abc")).toString("hex")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("dihitung dari byte persis (1 byte beda -> hash beda)", () => {
    const a = fs.readFileSync(path.join(F, "contoh_dkim.eml"));
    const b = Buffer.from(a);
    b[b.length - 3] ^= 1;
    expect(sha256(a).equals(sha256(b))).toBe(false);
  });
});

describe("deteksi tipe dari isi", () => {
  it("eml dikenali dari header", () => {
    const eml = fs.readFileSync(path.join(F, "contoh_dkim.eml"));
    expect(bentukFile(eml).bentuk).toBe("eml");
    expect(validasiJenis(eml, "eml").ok).toBe(true);
    expect(tebakJenis(eml)).toBe("eml");
  });
  it("PDF dari magic bytes, bukan ekstensi", () => {
    const pdf = Buffer.from("%PDF-1.7\n%%EOF\n");
    expect(validasiJenis(pdf, "pdf").ok).toBe(true);
    expect(validasiJenis(pdf, "eml").ok).toBe(false);
  });
  it("HTML SingleFile", () => {
    const html = Buffer.from("<!--\n Page saved with SingleFile \n--><!DOCTYPE html><html><body>x</body></html>");
    expect(validasiJenis(html, "html").ok).toBe(true);
  });
  it("file palsu (teks biasa berekstensi .pdf) ditolak sebagai pdf", () => {
    expect(validasiJenis(Buffer.from("bukan pdf"), "pdf").ok).toBe(false);
  });
  it("file kosong ditolak", () => {
    expect(validasiJenis(Buffer.alloc(0), "lampiran").ok).toBe(false);
  });
  it("PNG utk tangkapan DKIM", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(validasiJenis(png, "dkim_screenshot").ok).toBe(true);
  });
});
