import { describe, expect, it } from "vitest";
import { SETELAN_MUTU_AWAL as S, faktorAkui, galatMutu, poinDiakui, tandaKewajaran, teksMutu } from "@/lib/delego/mutu";

describe("faktorAkui", () => {
  it("nilai sempurna dan tepat waktu = 1", () => {
    expect(faktorAkui(S, 5, 5, false)).toBe(1);
  });
  it("sama dengan fungsi basis data (uji kering: 4, 2, terlambat -> 0,625)", () => {
    expect(faktorAkui(S, 4, 2, true)).toBe(0.625);
    expect(poinDiakui(14, 0.625)).toBe(8.75);
  });
  it("mengikuti bobot setelan", () => {
    expect(faktorAkui({ ...S, w_kualitas: 100, w_disiplin: 0, w_tepat: 0 }, 3, 1, true)).toBe(0.6);
  });
});

describe("galatMutu", () => {
  it("wajib memilih kedua nilai", () => {
    expect(galatMutu(null, 4, "")).toMatch(/Pilih/);
  });
  it("nilai di bawah 3 wajib beralasan", () => {
    expect(galatMutu(2, 4, "")).toMatch(/alasan/);
    expect(galatMutu(2, 4, "kurang rapi")).toBeNull();
    expect(galatMutu(3, 3, "")).toBeNull();
  });
});

describe("tandaKewajaran", () => {
  it("tanpa tanda untuk laporan wajar", () => {
    expect(tandaKewajaran({ poin: 50, jumlah: 6, target_harian: 6, menit_nyata: 240 }, S)).toEqual([]);
  });
  it("menandai jumlah lebih dari 2x target, poin besar, dan laju terlalu cepat", () => {
    const t = tandaKewajaran({ poin: 160, jumlah: 13, target_harian: 6, menit_nyata: 60 }, S).map((x) => x.kode);
    expect(t).toEqual(["jumlah", "poin", "kecepatan"]);
  });
  it("tanpa menit nyata tidak menilai kecepatan", () => {
    expect(tandaKewajaran({ poin: 90, jumlah: null, target_harian: 0, menit_nyata: null }, S)).toEqual([]);
  });
});

describe("teksMutu", () => {
  it("kosong bila belum dinilai mutu", () => {
    expect(teksMutu({ faktor_akui: null })).toBeNull();
  });
  it("merangkum faktor dan nilai", () => {
    expect(teksMutu({ faktor_akui: "0.625", mutu_kualitas: 4, mutu_disiplin: 2, mutu_tepat: 0.5 })).toBe("faktor 0,63 · kualitas 4 · disiplin 2 · terlambat");
  });
});
