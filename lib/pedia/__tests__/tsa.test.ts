// (7 Okt 2026) SIGAP PEDIA -- test request & validasi timestamp RFC 3161 (tanpa jaringan).
// Fixture: TSA uji lokal buatan openssl (fixtures/tsa: ca.pem, tsa.pem, tsa.key, tsa.cnf -- KHUSUS TEST).
//   r.tsr       = respons openssl utk data.txt (nonce acak)
//   r_tetap.tsr = respons utk permintaan buatan buatPermintaan() dgn nonce 0102030405060708
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";
import { buatPermintaan, mintaTimestamp, sha256, validasiRespons } from "../tsa";

const F = path.join(__dirname, "fixtures", "tsa");
const data = fs.readFileSync(path.join(F, "data.txt"));
const NONCE = Buffer.from("0102030405060708", "hex");

describe("TimeStampReq", () => {
  it("SHA-256, certReq=true, nonce positif, imprint = hash data", () => {
    const { der, nonce } = buatPermintaan(sha256(data), Buffer.from("ff00ff00ff00ff00", "hex"));
    const req = new pkijs.TimeStampReq({ schema: asn1js.fromBER(new Uint8Array(der).buffer).result });
    expect(req.certReq).toBe(true);
    expect(req.messageImprint.hashAlgorithm.algorithmId).toBe("2.16.840.1.101.3.4.2.1");
    expect(Buffer.from(req.messageImprint.hashedMessage.valueBlock.valueHexView).equals(sha256(data))).toBe(true);
    expect(nonce[0] & 0x80).toBe(0);
  });
  it("sama persis dgn fixture (deterministik utk nonce tetap)", () => {
    expect(buatPermintaan(sha256(data), NONCE).der.equals(fs.readFileSync(path.join(F, "q_tetap.tsq")))).toBe(true);
  });
});

describe("validasi token", () => {
  it("token valid utk file asli", async () => {
    const info = await validasiRespons(fs.readFileSync(path.join(F, "r.tsr")), data);
    expect(info.hashCocok).toBe(true);
    expect(info.tandaTanganValid).toBe(true);
    expect(info.genTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(info.sertifikat.length).toBeGreaterThan(0);
  });
  it("token TIDAK cocok utk file yg diubah", async () => {
    const info = await validasiRespons(fs.readFileSync(path.join(F, "r.tsr")), Buffer.from("isi lain"));
    expect(info.hashCocok).toBe(false);
    expect(info.tandaTanganValid).toBe(false);
  });
  it("nonce tidak sama -> ditolak", async () => {
    await expect(validasiRespons(fs.readFileSync(path.join(F, "r_tetap.tsr")), data, Buffer.from("0909090909090909", "hex"))).rejects.toThrow(/Nonce/);
  });
});

describe("mintaTimestamp dgn mock TSA", () => {
  const tsr = fs.readFileSync(path.join(F, "r_tetap.tsr"));
  it("TSA utama berhasil", async () => {
    const r = await mintaTimestamp(data, { nonce: NONCE, daftar: [{ nama: "Mock", url: "mock://1" }], kirim: async () => tsr });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tsa.nama).toBe("Mock");
  });
  it("TSA utama gagal -> cadangan dipakai", async () => {
    const r = await mintaTimestamp(data, {
      nonce: NONCE,
      daftar: [
        { nama: "FreeTSA", url: "mock://a" },
        { nama: "DigiCert", url: "mock://b" },
      ],
      kirim: async (url) => {
        if (url === "mock://a") throw new Error("timeout");
        return tsr;
      },
    });
    expect(r.ok && r.tsa.nama).toBe("DigiCert");
  });
  it("semua TSA gagal -> ok:false (entri tetap tersimpan sbg pending)", async () => {
    const r = await mintaTimestamp(data, { nonce: NONCE, daftar: [{ nama: "A", url: "x" }, { nama: "B", url: "y" }], kirim: async () => Buffer.from("rusak") });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.galat).toHaveLength(2);
  });
  it("respons utk file lain ditolak", async () => {
    const r = await mintaTimestamp(Buffer.from("file lain"), { nonce: NONCE, daftar: [{ nama: "A", url: "x" }], kirim: async () => tsr });
    expect(r.ok).toBe(false);
  });
});
