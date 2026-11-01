import { describe, expect, it } from "vitest";
import { acak, bacaBenih, hitungRumus, isiTeks, MIN_PILIHAN, susunSoalK, tetapkanNilai } from "../vanguard/kuesioner/templat";
import { KASUS_K, TEMPLAT_K, nilaiKasusK, soalK } from "../vanguard/kuesioner/nilaiK";
import { periksaIv1 } from "../vanguard/kuesioner/engine";
import { cariRincianIv1 } from "../vanguard/kuesioner/rincian";

describe("hitungRumus", () => {
  it("operator, prioritas, kurung, minus, dan fungsi", () => {
    const v = { a: 4, b: 3 };
    expect(hitungRumus("a+b*2", v)).toBe(10);
    expect(hitungRumus("(a+b)*2", v)).toBe(14);
    expect(hitungRumus("-a+10/4", v)).toBe(-1.5);
    expect(hitungRumus("bulat(2.5)", v)).toBe(3);
    expect(hitungRumus("bulat2(0.5*135/100)", v)).toBe(0.68);
    expect(hitungRumus("bulat2(0.5*100/150)", v)).toBe(0.33);
    expect(hitungRumus("max(a,b)+min(a,b)", v)).toBe(7);
  });
  it("galat yang jelas: variabel/fungsi tak dikenal, kurung, sisa", () => {
    expect(() => hitungRumus("x+1", {})).toThrow(/variabel x/);
    expect(() => hitungRumus("foo(1)", {})).toThrow(/fungsi foo/);
    expect(() => hitungRumus("(1+2", {})).toThrow();
    expect(() => hitungRumus("1+2)", {})).toThrow();
    expect(() => hitungRumus("process.exit()", {})).toThrow();
  });
});

describe("isiTeks dan acak", () => {
  it("penampung angka dan rupiah; penampung tak dikenal = galat", () => {
    expect(isiTeks("{a} dan {b:rp}", { a: 1.5, b: 25000 })).toBe("1,5 dan Rp25.000");
    expect(() => isiTeks("{z}", {})).toThrow();
  });
  it("acak deterministik per benih dan beragam antar benih; bacaBenih membatasi", () => {
    const a = acak(7), b = acak(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(acak(1)()).not.toBe(acak(2)());
    expect(bacaBenih(0)).toBe(0); expect(bacaBenih(123)).toBe(123);
    for (const x of [-1, 1.5, "5", NaN, 3_000_000_000, null]) expect(bacaBenih(x)).toBeNull();
  });
});

describe("templat kasus K (V7a)", () => {
  it(`tiap parameter punya >= ${MIN_PILIHAN} pilihan tanpa duplikat, dan nilai baku ada di pilihan`, () => {
    for (const t of TEMPLAT_K) for (const [nama, p] of Object.entries(t.parameter)) {
      expect(p.pilihan.length, `${t.kode}.${nama}`).toBeGreaterThanOrEqual(MIN_PILIHAN);
      expect(new Set(p.pilihan).size, `${t.kode}.${nama} duplikat`).toBe(p.pilihan.length);
      expect(p.pilihan, `${t.kode}.${nama} baku`).toContain(p.baku);
    }
  });
  it("benih 0 = angka baku; benih sama = soal sama; benih beda = angka beda", () => {
    for (const t of TEMPLAT_K) {
      const nilai0 = tetapkanNilai(t, 0);
      for (const [n, p] of Object.entries(t.parameter)) expect(nilai0[n]).toBe(p.baku);
      expect(susunSoalK(t, 12345)).toEqual(susunSoalK(t, 12345));
      expect(JSON.stringify(susunSoalK(t, 1).kunci)).not.toBe(JSON.stringify(susunSoalK(t, 2).kunci));
    }
  });
  it("lintas 300 benih: semua penampung terisi, kunci menilai dirinya benar, rincian sah dan unik, bentuk isian lolos aturan kuesioner", () => {
    for (const t of TEMPLAT_K) for (let b = 0; b < 300; b++) {
      const s = soalK(t.kode, b)!;
      for (const x of [s.cerita, ...s.catatan, ...s.info, s.pembahasan, ...s.petunjuk, ...s.jebakan.map((j) => j.m)]) expect(x, `${t.kode}#${b}`).not.toMatch(/[{}]/);
      expect(nilaiKasusK(s, s.kunci).benar, `${t.kode}#${b}`).toBe(true);
      const id = s.kunci.map((k) => `${k.r}|${k.art ?? 0}`);
      expect(new Set(id).size, `${t.kode}#${b} duplikat`).toBe(id.length);
      for (const k of s.kunci) {
        expect(cariRincianIv1(k.r), `${t.kode}#${b} R${k.r}`).toBeDefined();
        for (const f of ["k1", "k2", "k3", "k4"] as const) if (k[f] !== undefined) { expect(Number.isFinite(k[f]), `${t.kode}#${b} R${k.r}${f}`).toBe(true); expect(k[f]!, `${t.kode}#${b} R${k.r}${f}`).toBeGreaterThan(0); }
      }
      expect(periksaIv1(s.kunci), `${t.kode}#${b}`).toEqual([]);
    }
  });
  it("minimal 5 varian kunci berbeda untuk kasus yang sama (dan cerita ikut berbeda)", () => {
    for (const t of TEMPLAT_K) {
      const kunci = new Set<string>(), cerita = new Set<string>();
      for (let b = 1; b <= 30; b++) { const s = soalK(t.kode, b)!; kunci.add(JSON.stringify(s.kunci)); cerita.add(s.catatan.join("|")); }
      expect(kunci.size, t.kode).toBeGreaterThanOrEqual(5);
      expect(cerita.size, t.kode).toBeGreaterThanOrEqual(5);
    }
  });
  it("angka di cerita sesuai kunci: K01 benih acak, minyak R156 k1 = liter pada catatan", () => {
    const s = soalK("K01", 4242)!;
    const k = s.kunci.find((x) => x.r === 156)!;
    expect(s.catatan[0]).toContain(`${s.nilai.minyak_l} liter`);
    expect(k.k1).toBe(s.nilai.minyak_l);
    expect(k.k2).toBe((s.nilai.minyak_jual * s.nilai.minyak_l) / 2);
  });
  it("KASUS_K (benih 0) = kasus asli: K01 14 entri, K02 10 entri", () => {
    expect(KASUS_K.map((k) => [k.kode, k.kunci.length])).toEqual([["K01", 14], ["K02", 10]]);
  });
});

describe("format kata (V7c)", () => {
  it("{x:Kata} dan {x:kata} menulis bilangan 0–20 sebagai kata; di luar rentang atau pecahan = galat", () => {
    expect(isiTeks("{a:Kata} ART dan {b:kata} orang", { a: 3, b: 12 })).toBe("Tiga ART dan dua belas orang");
    expect(() => isiTeks("{a:kata}", { a: 21 })).toThrow();
    expect(() => isiTeks("{a:kata}", { a: 1.5 })).toThrow();
  });
});
