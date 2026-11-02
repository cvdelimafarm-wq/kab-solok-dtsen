import { describe, expect, it } from "vitest";
import { barisTemplate, bacaImpor, normNama, periksaPerubahan } from "@/lib/hierarkiImpor";
import type { SimpulHierarki } from "@/lib/hierarkiPelatihan";

const S = (akun_id: number, nama: string, peran: SimpulHierarki["peran"], atasan: number | null = null, kelas: number | null = null): SimpulHierarki => ({ akun_id, nama, peran, atasan_akun_id: atasan, kelas, tersembunyi: false });
const semua = [S(1, "Budi Korwil", "korwil"), S(2, "Citra PML", "pml", 1), S(3, "Dedi PPL", "ppl", 2), S(4, "Eka PPL", "ppl"), S(5, "Farah Sahara", "ppl")];
const judul = ["No", "Nama", "Peran", "Kelas", "Atasan"];

describe("barisTemplate", () => {
  it("judul + satu baris per peserta, terurut peran lalu nama; atasan dituliskan sebagai nama, tanpa atasan = -", () => {
    const b = barisTemplate(semua);
    expect(b[0]).toEqual(judul);
    expect(b.slice(1).map((r) => r[1])).toEqual(["Budi Korwil", "Citra PML", "Dedi PPL", "Eka PPL", "Farah Sahara"]);
    expect(b[3]).toEqual([3, "Dedi PPL", "ppl", "", "Citra PML"]);
    expect(b[4][4]).toBe("-");
  });
  it("template yang dibaca ulang tanpa perubahan tidak menghasilkan perubahan", () => {
    const h = bacaImpor(barisTemplate(semua), semua);
    expect(h.perubahan).toEqual([]);
    expect(h.galat).toEqual([]);
    expect(h.sama).toBe(5);
  });
});

describe("bacaImpor", () => {
  it("mengisi atasan dari nama (tanpa memandang huruf dan spasi ganda); kosong = tidak diubah; - = hapus atasan", () => {
    const h = bacaImpor([judul, [1, "Eka PPL", "", "", "  citra   pml "], [2, "Dedi PPL", "", "", "-"], [3, "Farah Sahara", "", "", ""]], semua);
    expect(h.galat).toEqual([]);
    expect(h.perubahan.map((p) => [p.akun_id, p.atasan_akun_id])).toEqual([[4, 2], [3, null]]);
    expect(h.perubahan[0].atasan_nama).toBe("Citra PML");
    expect(h.perubahan[1].sebelumnya.atasan_nama).toBe("Citra PML");
    expect(h.sama).toBe(1); // Farah: kosong = tidak diubah, tetap sama
  });
  it("peran dapat diubah; peran tidak dikenal dilaporkan", () => {
    const h = bacaImpor([judul, [1, "Eka PPL", "pml", "", ""], [2, "Dedi PPL", "dosen", "", ""]], semua);
    expect(h.perubahan).toHaveLength(1);
    expect(h.perubahan[0]).toMatchObject({ akun_id: 4, peran: "pml" });
    expect(h.galat).toEqual([{ baris: 3, pesan: expect.stringContaining("dosen") }]);
  });
  it("nama tak dikenal, kembar, ganda, dan atasan diri sendiri dilaporkan beserta nomor barisnya", () => {
    const kembar = [...semua, S(6, "Gita", "ppl"), S(7, "gita", "ppl")];
    const h = bacaImpor([judul, [1, "Tidak Ada", "", "", ""], [2, "Gita", "", "", ""], [3, "Eka PPL", "", "", "Eka PPL"], [4, "Eka PPL", "", "", "Budi Korwil"], [5, "Dedi PPL", "", "", "Orang Asing"]], kembar);
    expect(h.galat.map((g) => g.baris)).toEqual([2, 3, 4, 5, 6]);
    expect(h.perubahan).toEqual([]);
    expect(h.galat[3].pesan).toContain("lebih dari sekali");
  });
  it("siklus akibat gabungan perubahan: baris yang melingkar dibuang dan dilaporkan", () => {
    // Budi (korwil, tanpa atasan) dijadikan bawahan Dedi, padahal Dedi bawahan Citra bawahan Budi
    const h = bacaImpor([judul, [1, "Budi Korwil", "", "", "Dedi PPL"]], semua);
    expect(h.perubahan).toEqual([]);
    expect(h.galat[0].pesan).toContain("melingkar");
  });
  it("lembar tanpa judul atau tanpa kolom Atasan ditolak dengan petunjuk", () => {
    expect(bacaImpor([["a", "b"], [1, 2]], semua).kolomSah).toBe(false);
    const h = bacaImpor([["No", "Nama", "Peran"], [1, "Eka PPL", "ppl"]], semua);
    expect(h.kolomSah).toBe(false);
    expect(h.galat[0].pesan).toContain("Atasan");
  });
  it("judul boleh tidak di baris pertama dan baris kosong dilewati", () => {
    const h = bacaImpor([["Template hierarki"], [], judul, [1, "", "", "", ""], [2, "Eka PPL", "", "", "Citra PML"]], semua);
    expect(h.perubahan).toHaveLength(1);
    expect(h.galat).toEqual([]);
  });
});

describe("periksaPerubahan (pemeriksaan server)", () => {
  it("menerima perubahan sah, menolak akun/atasan asing, diri sendiri, ganda, siklus, peran salah", () => {
    expect(periksaPerubahan(semua, [{ akun_id: 4, atasan_akun_id: 2, peran: "ppl" }])).toBeNull();
    expect(periksaPerubahan(semua, [{ akun_id: 99, atasan_akun_id: 2, peran: "ppl" }])).toContain("bukan peserta");
    expect(periksaPerubahan(semua, [{ akun_id: 4, atasan_akun_id: 99, peran: "ppl" }])).toContain("Atasan");
    expect(periksaPerubahan(semua, [{ akun_id: 4, atasan_akun_id: 4, peran: "ppl" }])).toContain("diri sendiri");
    expect(periksaPerubahan(semua, [{ akun_id: 4, atasan_akun_id: 2, peran: "ppl" }, { akun_id: 4, atasan_akun_id: 1, peran: "ppl" }])).toContain("dua kali");
    expect(periksaPerubahan(semua, [{ akun_id: 1, atasan_akun_id: 3, peran: "korwil" }])).toContain("melingkar");
    expect(periksaPerubahan(semua, [{ akun_id: 4, atasan_akun_id: null, peran: "dosen" as never }])).toContain("Peran");
  });
  it("normNama", () => {
    expect(normNama("  Budi   KORWIL ")).toBe("budi korwil");
    expect(normNama(null)).toBe("");
  });
});
