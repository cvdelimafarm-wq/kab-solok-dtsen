// (7 Okt 2026) Uji aturan isian per kegiatan (pelatihan tanpa laporan).
import { describe, expect, it } from "vitest";
import { aturanDari, hariLengkap } from "../sigap";

describe("aturan isian", () => {
  it("bawaan = pendataan, wajib laporan, 5 foto", () => expect(aturanDari(null)).toEqual({ jenis: "pendataan", wajib_laporan: true, jumlah_foto: 5 }));
  it("pendataan butuh laporan + 5 foto", () => {
    const a = aturanDari({ jenis: "pendataan", wajib_laporan: true, jumlah_foto: 5 });
    expect(hariLengkap(false, 5, a)).toBe(false);
    expect(hariLengkap(true, 5, a)).toBe(true);
  });
  it("pelatihan cukup foto", () => {
    const a = aturanDari({ jenis: "pelatihan", wajib_laporan: false, jumlah_foto: 5 });
    expect(hariLengkap(false, 5, a)).toBe(true);
    expect(hariLengkap(false, 4, a)).toBe(false);
  });
  it("nilai tak sah jatuh ke bawaan", () => expect(aturanDari({ jenis: "x", jumlah_foto: 99 })).toEqual({ jenis: "pendataan", wajib_laporan: true, jumlah_foto: 5 }));
});
