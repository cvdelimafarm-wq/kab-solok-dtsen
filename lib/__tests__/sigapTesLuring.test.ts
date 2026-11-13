import { describe, expect, it } from "vitest";
import { bolehUnduh, bukaSandi, buatSandi, rapikanSandi, sandikan, versiSoal } from "../sigapTesLuring";

describe("paket tes luring tersandi (3b)", () => {
  it("sandi: dua kata + tiga angka, mudah diketik ulang", () => {
    let i = 0;
    const s = buatSandi(() => [0, 48, 375][i++ % 3]);
    expect(s).toBe("SAWAH-ELANG-475");
    expect(buatSandi()).toMatch(/^[A-Z]+-[A-Z]+-\d{3}$/);
    expect(rapikanSandi("  sawah elang 475 ")).toBe("SAWAH-ELANG-475");
    expect(rapikanSandi("sawah--elang_475")).toBe("SAWAH-ELANG-475");
  });
  it("sandikan lalu buka dengan sandi benar; sandi salah = null", async () => {
    const isi = { tes_id: 1, versi: "x", soal: [{ nomor: 1, teks: "Apa?", opsi: [{ kode: "A", teks: "Ya" }] }] };
    const t = await sandikan(isi, "SAWAH-ELANG-475", 1000);
    expect(t.data).not.toContain("Apa?");
    expect(await bukaSandi(t, "sawah elang 475")).toEqual(isi);
    expect(await bukaSandi(t, "SAWAH-ELANG-476")).toBeNull();
  });
  it("versi berubah bila soal berubah; unduh mulai H-1 sampai tutup", async () => {
    const a = await versiSoal([{ nomor: 1, teks: "A", opsi: [] }]);
    const b = await versiSoal([{ nomor: 1, teks: "B", opsi: [] }]);
    expect(a).not.toBe(b);
    const buka = "2026-11-16T01:00:00Z", tutup = "2026-11-16T05:00:00Z";
    expect(bolehUnduh(buka, tutup, Date.parse("2026-11-15T00:59:00Z"))).toBe(false);
    expect(bolehUnduh(buka, tutup, Date.parse("2026-11-15T01:00:00Z"))).toBe(true);
    expect(bolehUnduh(buka, tutup, Date.parse("2026-11-16T05:00:00Z"))).toBe(false);
  });
});
