import { describe, expect, it } from "vitest";
import { KASUS } from "../vanguard/kasus";
import { TEMPLAT_V1, kasusDariBenih, punyaTemplatV1 } from "../vanguard/kasus/acak";
import { kasusBenar } from "../vanguard/engine";
import { MIN_PILIHAN } from "../vanguard/kuesioner/templat";

const bandingkan = (kode: string) => KASUS.find((k) => k.kode === kode)!;

describe("templat kasus lama (V7c)", () => {
  it("templat tersedia untuk level A–E (A01–A13, B01–B10, C01–C11, D01–D22 kecuali D18 yang ditangguhkan, E01–E21), dan tiap kodenya ada di kasus asli", () => {
    expect(TEMPLAT_V1.map((t) => t.kode)).toEqual(["A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09", "A10", "A11", "A12", "A13", "B01", "B02", "B03", "B04", "B05", "B06", "B07", "B08", "B09", "B10", "C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09", "C10", "C11", "D01", "D02", "D03", "D04", "D05", "D06", "D07", "D08", "D09", "D10", "D11", "D12", "D13", "D14", "D15", "D16", "D17", "D19", "D20", "D21", "D22", "E01", "E02", "E03", "E04", "E05", "E06", "E07", "E08", "E09", "E10", "E11", "E12", "E13", "E14", "E15", "E16", "E17", "E18", "E19", "E20", "E21"]);
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
    expect(kasusDariBenih("G01", 5)).toBeUndefined();
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

describe("tidak ada angka tertinggal pada teks pendamping (V7c)", () => {
  it("petunjuk, jebakan, pembahasan, dan keterangan 'nol' yang memuat angka bertitik ribuan harus berubah mengikuti benih (bukan angka kasus asli yang tertinggal)", () => {
    const bidang = (k: ReturnType<typeof kasusDariBenih>) => ({ petunjuk: JSON.stringify(k!.petunjuk), jebakan: JSON.stringify(k!.jebakan), pembahasan: String(k!.pembahasan), nol: String((k as unknown as { nol?: string }).nol ?? "") });
    for (const t of TEMPLAT_V1) {
      const per: Record<string, Set<string>> = { petunjuk: new Set(), jebakan: new Set(), pembahasan: new Set(), nol: new Set() };
      for (let b = 1; b <= 25; b++) { const f = bidang(kasusDariBenih(t.kode, b)); for (const k of Object.keys(per)) per[k].add(f[k as keyof typeof f]); }
      const baku = bidang(kasusDariBenih(t.kode, 0));
      for (const k of Object.keys(per)) {
        const ada = /\d{1,3}(?:\.\d{3})+|Rp\d/.test(baku[k as keyof typeof baku]);
        if (ada) expect(per[k].size, `${t.kode}.${k} memuat angka tetap: ${baku[k as keyof typeof baku].slice(0, 120)}`).toBeGreaterThan(1);
      }
    }
  });
});

describe("keadilan penilaian lintas kasus (V8d)", () => {
  it("satu nilai salah letak di tiap kasus dan tiap kotak dihitung SATU kesalahan (tidak berpoin 20 karena dihukum ganda)", async () => {
    const { nilaiButir } = await import("../vanguard/sertifikasi/nilai");
    const { idSelKasus } = await import("../vanguard/sel");
    let skenario = 0;
    for (const t of TEMPLAT_V1) {
      const k = kasusDariBenih(t.kode, 3)!; const kunci = k.kunci as Record<string, number>;
      const ids = idSelKasus(k); const terisi = ids.filter((i) => kunci[i]); const kosong = ids.filter((i) => !kunci[i]);
      if (!kosong.length) continue;
      for (const s of terisi) {
        const isian = { ...Object.fromEntries(terisi.filter((x) => x !== s).map((x) => [x, kunci[x]])), [kosong[0]]: kunci[s] };
        const h = nilaiButir(t.kode, 3, isian) as { fatal: number; berat: number; ringan: number; poin: number };
        expect({ kode: t.kode, s, n: h.fatal + h.berat + h.ringan }).toEqual({ kode: t.kode, s, n: 1 });
        expect(h.poin).toBe(60);
        skenario++;
      }
    }
    expect(skenario).toBeGreaterThan(60);
  });
  it("satu angka meleset 30% pada satu kotak hanya menghasilkan satu kesalahan di semua kasus", async () => {
    const { nilaiButir } = await import("../vanguard/sertifikasi/nilai");
    for (const t of TEMPLAT_V1) {
      const kunci = kasusDariBenih(t.kode, 3)!.kunci as Record<string, number>;
      for (const s of Object.keys(kunci)) {
        const h = nilaiButir(t.kode, 3, { ...kunci, [s]: Math.round(kunci[s] * 1.3) }) as { fatal: number; berat: number; ringan: number };
        expect({ kode: t.kode, s, n: h.fatal + h.berat + h.ringan }).toEqual({ kode: t.kode, s, n: 1 });
      }
    }
  });
});
