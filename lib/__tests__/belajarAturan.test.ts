// lib/__tests__/belajarAturan.test.ts
// (13 Nov 2026, B) Aturan belajar dan mutu per waktu: butir per waktu, isian, keadaan, Vanguard dari sumber tunggal.
import { describe, expect, it } from "vitest";
import { butirSah, keadaanButir, lengkapiButir, periksaIsian, vanguardDariAturan, waktuUntukJenis, type BarisBelajar } from "../belajarAturan";

const b = (x: Partial<BarisBelajar>): BarisBelajar => ({ kegiatan_id: 7, waktu: "saat_pelatihan", butir: "vanguard_roleplay", aktif: true, wajib: false, tenggat: null, blokir: false, catatan: "", batal_alasan: null, batal_oleh: null, batal_at: null, diubah_oleh: "", diubah_at: null, ...x });

describe("belajarAturan", () => {
  it("butir per waktu sesuai keputusan 13 Nov", () => {
    expect(butirSah("pra_pelatihan", "vanguard_latihan")).toBe(true);
    expect(butirSah("pra_pelatihan", "posttest")).toBe(false);
    expect(butirSah("saat_pendataan", "qc_murajaah")).toBe(true);
    expect(waktuUntukJenis("pelatihan")).toEqual(["pra_pelatihan", "saat_pelatihan"]);
    expect(waktuUntukJenis("pendataan")).toEqual(["saat_pendataan"]);
  });
  it("lengkapi butir: 7 butir untuk pelatihan, tersimpan dipakai", () => {
    const l = lengkapiButir(7, ["pra_pelatihan", "saat_pelatihan"], [b({ wajib: true })]);
    expect(l).toHaveLength(7);
    expect(l.find((x) => x.butir === "vanguard_roleplay")?.wajib).toBe(true);
    expect(l.find((x) => x.butir === "posttest")?.aktif).toBe(false);
  });
  it("isian: wajib/blokir hanya bila dicentang; tenggat harus tanggal", () => {
    const p = periksaIsian({ waktu: "pra_pelatihan", butir: "vanguard_latihan", aktif: false, wajib: true, blokir: true, tenggat: "2026-11-09" });
    expect(p.ok && p.isian.wajib).toBe(false);
    expect(periksaIsian({ waktu: "pra_pelatihan", butir: "vanguard_latihan", aktif: true, tenggat: "9 Nov" }).ok).toBe(false);
    expect(periksaIsian({ waktu: "saat_pendataan", butir: "posttest", aktif: true }).ok).toBe(false);
  });
  it("keadaan dan Vanguard: roleplay dibatalkan tidak menyalakan; latihan aktif menyalakan; tanpa aturan = null", () => {
    expect(keadaanButir(b({ batal_at: "2026-11-09T09:25:45Z", batal_alasan: "sinyal buruk" })).teks).toBe("Dibatalkan");
    expect(keadaanButir(b({ wajib: true, blokir: true })).teks).toBe("Wajib · memblokir");
    expect(vanguardDariAturan([b({ batal_at: "x", batal_alasan: "y" })])).toBe(false);
    expect(vanguardDariAturan([b({ batal_at: "x", batal_alasan: "y" }), b({ waktu: "pra_pelatihan", butir: "vanguard_latihan" })])).toBe(true);
    expect(vanguardDariAturan([])).toBeNull();
  });
});
