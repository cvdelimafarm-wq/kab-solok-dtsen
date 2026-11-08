import { describe, expect, it } from "vitest";
import { SUMBER_KOSONG, periksaParam, ringkasSumber, terapkanUsulan, usulanPeran, type SumberSampel } from "../usulanSampel";

const sumber = (o: Partial<SumberSampel> = {}): SumberSampel => ({ ...SUMBER_KOSONG, tersambung: true, kegiatan_id: 7, kegiatan_nama: "Survei X", model: 1, unit: 25, sampel: 300, ...o });

describe("periksaParam", () => {
  it("menolak kosong, nol, desimal, dan huruf", () => {
    for (const a of ["", "0", "2,5", "abc", "-1", "100001"]) expect(periksaParam({ unitPerPpl: a, pplPerPml: "4" }).ok).toBe(false);
    expect(periksaParam({ unitPerPpl: "5", pplPerPml: "" }).ok).toBe(false);
  });
  it("menerima bilangan bulat dan memangkas spasi", () => {
    const r = periksaParam({ unitPerPpl: " 5 ", pplPerPml: "4" });
    expect(r.ok && r.nilai).toEqual({ unitPerPpl: 5, pplPerPml: 4 });
  });
});

describe("usulanPeran", () => {
  it("membulatkan ke atas", () => {
    expect(usulanPeran({ unit: 25, sampel: 300 }, { unitPerPpl: 5, pplPerPml: 4 })).toEqual({ ppl: 5, pml: 2, sampel: 300 });
    expect(usulanPeran({ unit: 26, sampel: 0 }, { unitPerPpl: 5, pplPerPml: 4 })).toEqual({ ppl: 6, pml: 2, sampel: 0 });
  });
  it("tanpa unit = 0 petugas", () => {
    expect(usulanPeran({ unit: 0, sampel: 0 }, { unitPerPpl: 5, pplPerPml: 4 })).toEqual({ ppl: 0, pml: 0, sampel: 0 });
  });
  it("satu PPL per PML", () => {
    expect(usulanPeran({ unit: 7, sampel: 7 }, { unitPerPpl: 1, pplPerPml: 1 })).toMatchObject({ ppl: 7, pml: 7 });
  });
});

describe("terapkanUsulan", () => {
  const p = { ppl: { on: true, nOrg: 0, nMit: 1 }, pml: { on: true, nOrg: 1, nMit: 1 } };
  const nol = { org: 0, mit: 0 };
  it("organik dibiarkan, Mitra = usulan - organik", () => {
    const h = terapkanUsulan(p, { ppl: 5, pml: 2, sampel: 300 }, { ppl: nol, pml: nol }, { beban: true });
    expect(h.ppl).toEqual({ nOrg: 0, nMit: 5 });
    expect(h.pml).toEqual({ nOrg: 1, nMit: 1 });
    expect(h.sampel).toBe(300);
    expect(h.catatan).toEqual([]);
  });
  it("organik melebihi usulan: Mitra 0 dan diberi catatan", () => {
    const h = terapkanUsulan({ ...p, pml: { on: true, nOrg: 3, nMit: 0 } }, { ppl: 5, pml: 2, sampel: 0 }, { ppl: nol, pml: nol }, { beban: true });
    expect(h.pml).toEqual({ nOrg: 3, nMit: 0 });
    expect(h.catatan.some((c) => c.includes("melebihi usulan"))).toBe(true);
    expect(h.sampel).toBeNull();
  });
  it("tidak menurunkan di bawah jumlah baris petugas yang ada", () => {
    const h = terapkanUsulan(p, { ppl: 2, pml: 1, sampel: 10 }, { ppl: { org: 0, mit: 4 }, pml: nol }, { beban: false });
    expect(h.ppl).toEqual({ nOrg: 0, nMit: 4 });
    expect(h.sampel).toBeNull();
    expect(h.catatan.some((c) => c.includes("ditahan"))).toBe(true);
  });
  it("peran tidak dipakai tidak diubah", () => {
    const h = terapkanUsulan({ ...p, ppl: { on: false, nOrg: 0, nMit: 0 } }, { ppl: 5, pml: 2, sampel: 1 }, { ppl: nol, pml: nol }, { beban: true });
    expect(h.ppl).toBeNull();
    expect(h.catatan[0]).toContain("PPL tidak dipakai");
  });
});

describe("ringkasSumber", () => {
  it("belum tertaut", () => expect(ringkasSumber(SUMBER_KOSONG)).toContain("belum ditautkan"));
  it("belum ada sampel", () => expect(ringkasSumber(sumber({ model: null, unit: 0 }))).toContain("belum punya"));
  it("model 1 dan model 2", () => {
    expect(ringkasSumber(sumber())).toContain("25 sub SLS dialokasikan");
    expect(ringkasSumber(sumber({ model: 2, unit: 40, satuan: "objek", plot_ppl: 8, plot_pml: 2 }))).toContain("40 objek di daftar sampel");
    expect(ringkasSumber(sumber({ model: 2, unit: 40, satuan: "objek", plot_ppl: 8, plot_pml: 2 }))).toContain("Sudah ditetapkan: 8 PPL, 2 PML");
  });
});
