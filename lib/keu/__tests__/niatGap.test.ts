import { describe, expect, it } from "vitest";
import { argsKekuranganDariGap, kekuranganDariButir, uraianDariGap } from "../niat";

describe("usulan revisi dari Gap", () => {
  const r = { akun: "524113", uraian: "Transport lokal petugas", jumlah: 0, besar: 2_500_000 };
  it("argumen catat kekurangan memakai jumlah niat, atau seluruh kekurangan bila 0", () => {
    const a = argsKekuranganDariGap("2906.BMA.006", r, "penting");
    expect(a).toMatchObject({ p_ro: "2906.BMA.006", p_akun_kode: "524113", p_uraian: "Dari Gap: Transport lokal petugas", p_jumlah: 2_500_000, p_prioritas: "penting" });
    expect(argsKekuranganDariGap("X", { ...r, jumlah: 1_000_000 }, "inti").p_jumlah).toBe(1_000_000);
  });
  it("kekurangan yang sudah dicatat dikenali dari akun dan uraian", () => {
    const ada = [{ id: 9, akun_kode: "524113", uraian: uraianDariGap("Transport lokal petugas"), status: "tercatat", jumlah: 1 }];
    expect(kekuranganDariButir(r, ada)?.id).toBe(9);
    expect(kekuranganDariButir({ ...r, akun: "521211" }, ada)).toBeNull();
  });
});
