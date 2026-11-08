import { describe, expect, it } from "vitest";
import { adalahPdf, alasanBersih, kelasTanpaSurat, namaBerkasSurat, periksaBerkas, periksaIsian, tanggalSah } from "@/lib/sigapSuratUndangan";

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

describe("sigapSuratUndangan", () => {
  it("tanggal sah", () => {
    expect(tanggalSah("2026-11-06")).toBe(true);
    expect(tanggalSah("2026-02-31")).toBe(false);
    expect(tanggalSah("06-11-2026")).toBe(false);
  });
  it("isian wajib lengkap dan dirapikan", () => {
    const r = periksaIsian({ nomor: "  B-457/13030/VS.220/2026 ", tanggal: "2026-11-06", perihal: "Undangan   Pelatihan Petugas Seruti" });
    expect(r).toEqual({ ok: true, isian: { nomor: "B-457/13030/VS.220/2026", tanggal: "2026-11-06", perihal: "Undangan Pelatihan Petugas Seruti" } });
  });
  it("menolak isian kosong atau salah", () => {
    expect(periksaIsian({ nomor: "", tanggal: "2026-11-06", perihal: "x" })).toMatchObject({ ok: false, galat: "Nomor surat wajib diisi." });
    expect(periksaIsian({ nomor: "1", tanggal: "", perihal: "x" })).toMatchObject({ ok: false, galat: "Tanggal surat wajib diisi." });
    expect(periksaIsian({ nomor: "1", tanggal: "2026-13-01", perihal: "x" })).toMatchObject({ ok: false, galat: "Tanggal surat tidak valid." });
    expect(periksaIsian({ nomor: "1", tanggal: "2026-11-06", perihal: "  " })).toMatchObject({ ok: false, galat: "Perihal surat wajib diisi." });
    expect(periksaIsian({ nomor: 5, tanggal: "2026-11-06", perihal: "x" })).toMatchObject({ ok: false });
    expect(periksaIsian({ nomor: "x".repeat(81), tanggal: "2026-11-06", perihal: "x" })).toMatchObject({ ok: false });
  });
  it("berkas harus PDF dan <= 10 MB", () => {
    expect(adalahPdf(pdf)).toBe(true);
    expect(adalahPdf(new Uint8Array([1, 2, 3, 4, 5]))).toBe(false);
    expect(periksaBerkas(100, pdf)).toBeNull();
    expect(periksaBerkas(0, pdf)).toBe("Berkas kosong.");
    expect(periksaBerkas(11 * 1024 * 1024, pdf)).toBe("Ukuran PDF maksimal 10 MB.");
    expect(periksaBerkas(100, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe("Berkas harus berupa PDF.");
  });
  it("kelas tanpa surat, alasan, nama berkas", () => {
    expect(kelasTanpaSurat([1, 2, 3], [2])).toEqual([1, 3]);
    expect(kelasTanpaSurat([], [2])).toEqual([]);
    expect(alasanBersih("  salah  tanggal ")).toBe("salah tanggal");
    expect(alasanBersih("   ")).toBeNull();
    expect(namaBerkasSurat("B-457/13030/VS.220/2026", 1)).toBe("Undangan_Kelas1_B_457_13030_VS_220_2026.pdf");
  });
});
