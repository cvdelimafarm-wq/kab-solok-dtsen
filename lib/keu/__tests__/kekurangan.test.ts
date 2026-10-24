import { describe, expect, it } from "vitest";
import { argsCatat, argsTarik, argsUbah, bacaRupiah, periksaKekurangan, type IsianKekurangan } from "../kekurangan";

const sah: IsianKekurangan = { akun_kode: "521211", uraian: "Konsumsi rapat", jumlah: "1.500.000", prioritas: "inti", alasan: "Rapat tidak tercakup RAB" };

describe("bacaRupiah", () => {
  it("menerima titik pemisah, spasi, dan awalan Rp", () => {
    expect(bacaRupiah("1.500.000")).toBe(1500000);
    expect(bacaRupiah(" Rp 2.000 ")).toBe(2000);
    expect(bacaRupiah("rp. 750000")).toBe(750000);
    expect(bacaRupiah("5")).toBe(5);
  });
  it("menolak nol, negatif, desimal, huruf, kosong, dan terlalu besar", () => {
    for (const t of ["0", "-5", "1,5", "12a", "", "   ", "1234567890123456", "1e3"]) expect(bacaRupiah(t)).toBeNull();
  });
});

describe("periksaKekurangan", () => {
  it("isian sah tidak menghasilkan pesan", () => expect(periksaKekurangan(sah)).toEqual([]));
  it("mengumpulkan semua pesan", () => {
    const g = periksaKekurangan({ akun_kode: "12", uraian: "ab", jumlah: "0", prioritas: "x", alasan: "ya" });
    expect(g).toHaveLength(5);
  });
  it("akun tidak diperiksa saat mengubah", () => {
    expect(periksaKekurangan({ ...sah, akun_kode: "" }, { baru: false })).toEqual([]);
    expect(periksaKekurangan({ ...sah, akun_kode: "" })).toHaveLength(1);
  });
  it("batas panjang", () => {
    expect(periksaKekurangan({ ...sah, uraian: "x".repeat(201) })).toHaveLength(1);
    expect(periksaKekurangan({ ...sah, alasan: "x".repeat(501) })).toHaveLength(1);
  });
});

describe("argumen gerbang", () => {
  it("argsCatat tidak memuat p_akun dan merapikan isian", () => {
    const a = argsCatat("2906.BMA.005", { ...sah, uraian: "  Konsumsi rapat ", komponen: " " });
    expect(a).toEqual({ p_ro: "2906.BMA.005", p_akun_kode: "521211", p_uraian: "Konsumsi rapat", p_jumlah: 1500000, p_prioritas: "inti", p_alasan: "Rapat tidak tercakup RAB", p_komponen: null });
    expect("p_akun" in a).toBe(false);
  });
  it("argsUbah hanya memuat yang berubah; tanpa perubahan -> null", () => {
    const lama = { uraian: "Konsumsi rapat", jumlah: "1500000", prioritas_kode: "inti", alasan: "Rapat tidak tercakup RAB" };
    expect(argsUbah(7, lama, sah)).toBeNull();
    expect(argsUbah(7, lama, { ...sah, jumlah: "2.000.000", prioritas: "tunda" })).toEqual({ p_id: 7, p_jumlah: 2000000, p_prioritas: "tunda" });
    expect(argsUbah(7, lama, { ...sah, uraian: "Konsumsi lain" })).toEqual({ p_id: 7, p_uraian: "Konsumsi lain" });
  });
  it("argsTarik menolak alasan pendek", () => {
    expect(argsTarik(3, "ya")).toEqual({ galat: "Alasan penarikan minimal 5 huruf." });
    expect(argsTarik(3, " tidak jadi diajukan ")).toEqual({ args: { p_id: 3, p_alasan: "tidak jadi diajukan" } });
  });
});
