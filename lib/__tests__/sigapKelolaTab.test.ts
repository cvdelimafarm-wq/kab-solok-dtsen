// lib/__tests__/sigapKelolaTab.test.ts
// (8 Nov 2026) Peta alamat lama -> tujuh tab baru Kelola Pelatihan.
import { describe, expect, it } from "vitest";
import { TAB_KELOLA, petakanTab } from "../sigapKelolaTab";

describe("petakanTab", () => {
  it("ada tujuh tab dan Kesiapan paling depan", () => {
    expect(TAB_KELOLA).toHaveLength(7);
    expect(TAB_KELOLA[0]).toBe("kesiapan");
  });
  it("tab baru dikembalikan apa adanya (sub dipertahankan)", () => {
    expect(petakanTab("harih", "rapat")).toEqual({ tab: "harih", sub: "rapat" });
    expect(petakanTab("peserta")).toEqual({ tab: "peserta", sub: undefined });
  });
  it("tab lama dialihkan ke tempat baru", () => {
    expect(petakanTab("soal")).toEqual({ tab: "materi", sub: "tes" });
    expect(petakanTab("harikerja")).toEqual({ tab: "peserta", sub: "harikerja" });
    expect(petakanTab("monitoring")).toEqual({ tab: "harih", sub: "monitoring" });
    expect(petakanTab("administrasi")).toEqual({ tab: "hasil" });
  });
  it("tab lama yang bersub dibelah menurut sub-nya", () => {
    expect(petakanTab("persiapan", "pengaturan")).toEqual({ tab: "komunikasi", sub: "tampilan" });
    expect(petakanTab("persiapan")).toEqual({ tab: "komunikasi", sub: "tampilan" });
    expect(petakanTab("persiapan", "instrumen")).toEqual({ tab: "materi", sub: "instrumen" });
    expect(petakanTab("persiapan", "vanguard")).toEqual({ tab: "materi", sub: "vanguard" });
    expect(petakanTab("tim", "hierarki")).toEqual({ tab: "peserta", sub: "hierarki" });
    expect(petakanTab("tim", "ngawur")).toEqual({ tab: "peserta", sub: "pengaturan" });
    expect(petakanTab("kuis", "kuispra")).toEqual({ tab: "materi", sub: "kuispra" });
    expect(petakanTab("kuis", "rapat")).toEqual({ tab: "harih", sub: "rapat" });
    expect(petakanTab("kuis")).toEqual({ tab: "harih", sub: "adusigap" });
    expect(petakanTab("notifikasi", "pengumuman")).toEqual({ tab: "komunikasi", sub: "pengumuman" });
    expect(petakanTab("notifikasi")).toEqual({ tab: "komunikasi", sub: "notifikasi" });
  });
  it("alamat paling lama tetap dikenali", () => {
    expect(petakanTab("pengumuman")).toEqual({ tab: "komunikasi", sub: "pengumuman" });
    expect(petakanTab("rapat")).toEqual({ tab: "harih", sub: "rapat" });
    expect(petakanTab("kuispra")).toEqual({ tab: "materi", sub: "kuispra" });
    expect(petakanTab("kelas")).toEqual({ tab: "peserta", sub: "kelas" });
    expect(petakanTab("tampilan")).toEqual({ tab: "komunikasi", sub: "tampilan" });
    expect(petakanTab("instrumen")).toEqual({ tab: "materi", sub: "instrumen" });
    expect(petakanTab("vanguard")).toEqual({ tab: "materi", sub: "vanguard" });
  });
  it("kosong atau tidak dikenal -> null; tanpa celah spasi", () => {
    expect(petakanTab(null)).toBeNull();
    expect(petakanTab("")).toBeNull();
    expect(petakanTab("entah")).toBeNull();
    expect(petakanTab(" soal ")).toEqual({ tab: "materi", sub: "tes" });
  });
  it("setiap tab lama yang pernah sah menghasilkan tujuan di tujuh tab", () => {
    for (const t of ["persiapan", "tim", "kendala", "harikerja", "soal", "kuis", "notifikasi", "monitoring", "administrasi"]) {
      const r = petakanTab(t);
      expect(r, t).not.toBeNull();
      expect(TAB_KELOLA).toContain(r!.tab);
    }
  });
});
