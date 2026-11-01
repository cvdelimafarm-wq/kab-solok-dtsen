import { describe, expect, it } from "vitest";
import { KASUS } from "../vanguard/kasus";
import { MAKS_SARAN, kemampuanKasus, petaKemampuan, saranKasus } from "../vanguard/remedial";

const PETA = petaKemampuan(KASUS);

const kasus = (kode: string) => KASUS.find((k) => k.kode === kode)!;

describe("kemampuanKasus (diturunkan dari engine dan data)", () => {
  it("A01: konversi seminggu ya (nilai Blok IV.1 seminggu); jebakan dan alternatif mengikuti data", () => {
    const k = kasus("A01"); const m = kemampuanKasus(k);
    expect(m.has("konversi_seminggu")).toBe(true);
    expect(m.has("belum_diisi")).toBe(true);
    expect(m.has("jebakan")).toBe(k.jebakan.length > 0);
    expect(m.has("alternatif")).toBe(k.alternatif.length > 0);
    expect(m.has("kontrol_vii")).toBe(false);
  });
  it("kasus lengkap melatih kontrol VII dan diskrepansi; kalkulator bebas tidak melatih apa pun", () => {
    const g = kemampuanKasus(kasus("G01")); expect(g.has("kontrol_vii")).toBe(true); expect(g.has("diskrepansi")).toBe(true);
    expect(kemampuanKasus(kasus("H01")).size).toBe(0);
  });
  it("untuk semua kasus: jebakan dan alternatif sama persis dengan isi berkas", () => {
    for (const k of KASUS) { if (k.bebas) continue; const m = kemampuanKasus(k); expect(m.has("jebakan"), k.kode).toBe(k.jebakan.length > 0); expect(m.has("alternatif"), k.kode).toBe(k.alternatif.length > 0); }
  });
  it("setiap kasus bernilai melatih sedikitnya satu jenis", () => {
    for (const k of KASUS) if (!k.bebas) expect(kemampuanKasus(k).size, k.kode).toBeGreaterThan(0);
  });
});

describe("saranKasus", () => {
  it("tanpa riwayat dan tanpa kelemahan = tidak ada saran", () => { expect(saranKasus([], [], PETA)).toEqual([]); });
  it("kasus yang belum benar sesudah mencoba berada di atas; alasan jelas", () => {
    const s = saranKasus([{ jenis: "konversi_seminggu", jumlah: 4 }], [{ kasus: "A01", percobaan: 3, benar: false, bintang: 0 }], PETA);
    expect(s[0].kasus).toBe("A01");
    expect(s[0].alasan[0]).toBe("Belum benar");
    expect(s[0].alasan.some((a) => a.startsWith("Melatih: Masih nilai seminggu"))).toBe(true);
    expect(s.length).toBeLessThanOrEqual(MAKS_SARAN);
  });
  it("kasus yang sudah benar tidak disarankan kecuali melatih kelemahan; tanpa kelemahan semuanya benar = kosong", () => {
    const semua = KASUS.filter((k) => !k.bebas).map((k) => ({ kasus: k.kode, percobaan: 1, benar: true, bintang: 3 }));
    const s = saranKasus([{ jenis: "konversi_seminggu", jumlah: 2 }], semua, PETA, 71);
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => kemampuanKasus(kasus(x.kasus)).has("konversi_seminggu"))).toBe(true);
    expect(saranKasus([], semua, PETA)).toEqual([]);
  });
  it("urutan deterministik, menurun menurut skor, dan mengutamakan kasus yang melatih kelemahan teratas", () => {
    const l = [{ jenis: "jebakan" as const, jumlah: 5 }, { jenis: "konversi_sebulan" as const, jumlah: 1 }];
    const a = saranKasus(l, [], PETA); const b = saranKasus(l, [], PETA);
    expect(a).toEqual(b);
    expect(a.length).toBe(MAKS_SARAN);
    expect(kemampuanKasus(kasus(a[0].kasus)).has("jebakan")).toBe(true);
    for (let i = 1; i < a.length; i++) expect(a[i - 1].skor).toBeGreaterThanOrEqual(a[i].skor);
  });
  it("kasus bebas tidak pernah disarankan; maks dihormati", () => {
    const s = saranKasus([{ jenis: "belum_diisi", jumlah: 9 }], [], PETA, 3);
    expect(s).toHaveLength(3);
    expect(s.some((x) => x.kasus === "H01")).toBe(false);
  });
});
