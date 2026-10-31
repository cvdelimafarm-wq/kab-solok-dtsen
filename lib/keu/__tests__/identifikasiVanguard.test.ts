import { describe, expect, it } from "vitest";
import { awalForm, bedaForm, labelJalur, normalisasi, vanguardUntuk, type Form } from "../identifikasi";

const salin = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
function dasar(ubah: (f: Form) => void = () => {}): Form {
  const f = normalisasi({ nama: "UJI Vanguard", sesi: { pelatihan: { on: true, bentuk: "Luring", tempat: "Kantor" } }, instrumen: "FASIH" });
  ubah(f);
  return f;
}

describe("Vanguard pada identifikasi survei", () => {
  it("bawaan: tidak memakai Vanguard", () => {
    expect(awalForm().vanguard).toEqual({ pelatihan: false, pendataan: false });
    const f = dasar();
    expect(vanguardUntuk(f, "pelatihan")).toBe(false);
    expect(vanguardUntuk(f, "pendataan")).toBe(false);
  });

  it("formulir lama tanpa isian vanguard dipulihkan ke bawaan (tidak ada yang rusak)", () => {
    const lama = salin(awalForm()) as unknown as Record<string, unknown>;
    delete lama.vanguard;
    expect(normalisasi(lama).vanguard).toEqual({ pelatihan: false, pendataan: false });
    expect(normalisasi({ vanguard: true }).vanguard).toEqual({ pelatihan: false, pendataan: false });
    expect(normalisasi({ vanguard: { pelatihan: "ya", pendataan: 1 } }).vanguard).toEqual({ pelatihan: false, pendataan: false });
    expect(normalisasi({ vanguard: { pelatihan: true } }).vanguard).toEqual({ pelatihan: true, pendataan: false });
  });

  it("pelatihan: Ya hanya berlaku bila ada sesi pelatihan sendiri", () => {
    const f = dasar((g) => { g.vanguard.pelatihan = true; });
    expect(vanguardUntuk(f, "pelatihan")).toBe(true);
    expect(vanguardUntuk(dasar((g) => { g.vanguard.pelatihan = true; g.sesi.pelatihan.on = false; }), "pelatihan")).toBe(false);
    expect(vanguardUntuk(dasar((g) => { g.vanguard.pelatihan = true; g.berbagi = true; g.rujukan = "Survei lain"; }), "pelatihan")).toBe(false);
  });

  it("pendataan: Ya hanya berlaku bila ada pendataan", () => {
    expect(vanguardUntuk(dasar((g) => { g.vanguard.pendataan = true; }), "pendataan")).toBe(true);
    expect(vanguardUntuk(dasar((g) => { g.vanguard.pendataan = true; g.instrumen = "PAPI"; }), "pendataan")).toBe(true);
    expect(vanguardUntuk(dasar((g) => { g.vanguard.pendataan = true; g.instrumen = "Tanpa pendataan"; }), "pendataan")).toBe(false);
  });

  it("jawaban pelatihan dan pendataan berdiri sendiri; fungsi 'lain' tidak pernah meminta", () => {
    const f = dasar((g) => { g.vanguard.pelatihan = true; });
    expect(vanguardUntuk(f, "pendataan")).toBe(false);
    const g2 = dasar((g) => { g.vanguard.pelatihan = true; g.vanguard.pendataan = true; });
    expect(vanguardUntuk(g2, "lain")).toBe(false);
  });

  it("pilihan tetap tersimpan walau bagiannya sedang dimatikan (tidak hilang diam-diam)", () => {
    const f = dasar((g) => { g.vanguard.pendataan = true; g.instrumen = "Tanpa pendataan"; });
    expect(normalisasi(salin(f)).vanguard.pendataan).toBe(true);
  });

  it("revisi: perubahan jawaban terbaca dengan label yang jelas", () => {
    const a = dasar();
    const b = dasar((g) => { g.vanguard.pelatihan = true; g.vanguard.pendataan = true; });
    expect(bedaForm(a, b).map((d) => d.t)).toEqual([
      "Vanguard di pelatihan: Tidak → Ya",
      "Vanguard sebagai QC di pendataan: Tidak → Ya",
    ]);
    expect(labelJalur("vanguard.pelatihan")).toBe("Vanguard di pelatihan");
    expect(bedaForm(a, dasar())).toEqual([]);
  });

  it("formulir lama (tanpa vanguard) dan yang sudah dinormalkan tidak dianggap berbeda", () => {
    const lama = salin(dasar()) as unknown as Record<string, unknown>;
    delete lama.vanguard;
    expect(bedaForm(normalisasi(lama), dasar())).toEqual([]);
  });
});
