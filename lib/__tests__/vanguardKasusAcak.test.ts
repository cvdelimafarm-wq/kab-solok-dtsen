import { describe, expect, it } from "vitest";
import { KASUS } from "../vanguard/kasus";
import { TEMPLAT_V1, kasusDariBenih, punyaTemplatV1 } from "../vanguard/kasus/acak";
import { kasusBenar } from "../vanguard/engine";
import { MIN_PILIHAN } from "../vanguard/kuesioner/templat";

const bandingkan = (kode: string) => KASUS.find((k) => k.kode === kode)!;

describe("templat kasus lama (V7c)", () => {
  it("templat tersedia untuk level A–C (A01–A13, B01–B10, C01–C11), dan tiap kodenya ada di kasus asli", () => {
    expect(TEMPLAT_V1.map((t) => t.kode)).toEqual(["A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09", "A10", "A11", "A12", "A13", "B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08", "B09", "B10", "C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C11"]);
    for (const t of TEMPLAT_V1) { expect(punyaTemplatV1(t.kode)).toBe(true); expect(bandingkan(t.kode)).toBeDefined(); }
  });
  it(`tiap parameter >= ${MIN_PILIHAN} pilihan tanpa duplikat, dan nilai baku ada di pilihan`, () => {
    for (const t of TEMPLAT_V1) for (const [n, p] of Object.entries(t.parameter)) {
      expect(p.pilihan.length, `${t.kode}.${n}`).toBeGreaterThanOrEqual(MIN_PILIHAN);
      expect(new Set(p.pilihan).size, `${t.kode}.${n}`).toBe(p.pilihan.length);
      expect(p.pilihan, `${t.kode}.${n}`).toContain(p.baku);
    }
  });
  it("benih 0 = kasus asli persis (semua bidang: cerita, tabel IV.1, kunci, alternatif, langkah, pembahasan)", () => {
    for (const t of TEMPLAT_V1) expect(kasusDariBenih(t.kode, 0), t.kode).toEqual(bandingkan(t.kode));
  });
  it("benih sama = kasus sama; kasus tak bertemplat = undefined", () => {
    expect(kasusDariBenih("A05", 99)).toEqual(kasusDariBenih("A05", 99));
    expect(kasusDariBenih("D01", 5)).toBeUndefined();
  });
  it("lintas 300 benih: tidak ada penampung tersisa, kunci menilai dirinya benar, nilai wajar, alternatif berbeda dari kunci", () => {
    for (const t of TEMPLAT_V1) for (let b = 1; b <= 300; b++) {
      const k = kasusDariBenih(t.kode, b)!;
      const teks = JSON.stringify([k.cerita, k.langkah, k.pembahasan, k.petunjuk, k.jebakan, k.alternatif, k.iv]);
      expect(teks, `${t.kode}#${b}`).not.toMatch(/\{[A-Za-z_][A-Za-z0-9_:]*\}|NaN|undefined/);
      for (const [sel, v] of Object.entries(k.kunci)) { expect(Number.isFinite(v), `${t.kode}#${b} ${sel}`).toBe(true); expect(v as number, `${t.kode}#${b} ${sel}`).toBeGreaterThan(0); }
      expect(kasusBenar(k, k.kunci).benar, `${t.kode}#${b}`).toBe(true);
      for (const a of k.alternatif) { expect(Number.isFinite(a.v)).toBe(true); expect(a.v, `${t.kode}#${b} alt`).not.toBe(k.kunci[a.k]); }
    }
  });
  it("minimal 5 varian berbeda per kasus (cerita dan kunci), dan angka di cerita sesuai kunci", () => {
    for (const t of TEMPLAT_V1) {
      const ce = new Set<string>(), ku = new Set<string>();
      for (let b = 1; b <= 40; b++) { const k = kasusDariBenih(t.kode, b)!; ce.add(k.cerita + JSON.stringify(k.iv)); ku.add(JSON.stringify(k.kunci)); }
      expect(ce.size, t.kode).toBeGreaterThanOrEqual(5);
      if (Object.keys(bandingkan(t.kode).kunci).length > 0) expect(ku.size, t.kode).toBeGreaterThanOrEqual(5);
    }
    const a2 = kasusDariBenih("A02", 12345)!; // hari * harga * 30/7 * 12
    const m = /selama (\d+) hari.*?Rp([\d.]+) per porsi/.exec(a2.cerita)!;
    expect(a2.kunci.e_bantuan_barangD).toBe(Math.round((Number(m[1]) * Number(m[2].replace(/\./g, "")) * 30 / 7 * 12) + Number.EPSILON));
  });
});
