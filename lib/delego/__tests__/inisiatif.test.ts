import { describe, expect, it } from "vitest";
import { dataInisiatif, galatInisiatif, teksJenisInisiatif, totalRekap } from "@/lib/delego/inisiatif";

describe("inisiatif", () => {
  it("isian wajib jenis, alasan, dan manfaat minimal 10 huruf", () => {
    expect(galatInisiatif({ jenis: "", alasan: "", manfaat: "" })).toMatch(/jenis/);
    expect(galatInisiatif({ jenis: "ide_baru", alasan: "pendek", manfaat: "" })).toMatch(/Alasan/);
    expect(galatInisiatif({ jenis: "ide_baru", alasan: "Arsip sulit dicari", manfaat: "cepat" })).toMatch(/Manfaat/);
    expect(galatInisiatif({ jenis: "ide_baru", alasan: "Arsip sulit dicari", manfaat: "Waktu cari turun" })).toBeNull();
  });
  it("data untuk keu_dlg_usul dipangkas", () => {
    expect(dataInisiatif({ jenis: "bantu_rekan", alasan: " a b c d e f ", manfaat: " x " })).toEqual({ jenis: "bantu_rekan", alasan: "a b c d e f", manfaat: "x" });
  });
  it("teks jenis dan total rekap", () => {
    expect(teksJenisInisiatif("perbaikan_proses")).toBe("Perbaikan cara kerja");
    expect(teksJenisInisiatif(null)).toBe("Inisiatif");
    expect(totalRekap({ dari: "", sampai: "", per_jenis: {}, pegawai: [{ akun: 1, nama: "A", diajukan: 3, disetujui: 2, ditolak: 1, menunggu: 0 }, { akun: 2, nama: "B", diajukan: 1, disetujui: 0, ditolak: 0, menunggu: 1 }] })).toEqual({ diajukan: 4, disetujui: 2 });
  });
});
