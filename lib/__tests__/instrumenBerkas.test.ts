import { beforeEach, describe, expect, it } from "vitest";
import { GRUP_BERKAS, atributTerima, bisaDibukaDiTab, ekstensi, jenisIkonBerkas, periksaBerkas, ringkasJenis, ringkasSemua, ukuranTeks, type BerkasInstrumen } from "../instrumenBerkas";
import { idBerkasTersimpan, simpanBerkasLokal, ambilBerkasLokal, hapusBerkasLokal, kunciBerkasLokal } from "../berkasLokal";

const b = (id: number, jenis: BerkasInstrumen["jenis"]): BerkasInstrumen => ({ id, jenis, judul: "x", nama_file: "x.pdf", ukuran: 10, diunggah_at: "2026-11-02T00:00:00Z" });

describe("instrumenBerkas", () => {
  it("memeriksa format, ukuran, dan berkas kosong", () => {
    expect(periksaBerkas("kuesioner", "a.pdf", 100)).toBeNull();
    expect(periksaBerkas("kuesioner", "a.pptx", 100)).toMatch(/tidak diterima/);
    expect(periksaBerkas("materi", "a.PPTX", 100)).toBeNull();
    expect(periksaBerkas("pedoman", "a.pdf", 0)).toBe("Berkas kosong.");
    expect(periksaBerkas("pedoman", "a.pdf", 101 * 1024 * 1024)).toMatch(/Terlalu besar/);
    expect(periksaBerkas("pedoman", "tanpaekstensi", 5)).toMatch(/\.\?/);
  });
  it("ekstensi, ikon, dan buka di tab", () => {
    expect(ekstensi("a.b.PDF")).toBe("pdf");
    expect(ekstensi("polos")).toBe("");
    expect(jenisIkonBerkas("a.docx")).toBe("dokumen");
    expect(jenisIkonBerkas("a.xlsx")).toBe("lembar");
    expect(jenisIkonBerkas("a.ppsx")).toBe("slide");
    expect(jenisIkonBerkas("a.zip")).toBe("arsip");
    expect(bisaDibukaDiTab("a.pdf")).toBe(true);
    expect(bisaDibukaDiTab("a.docx")).toBe(false);
  });
  it("atribut terima dan ukuran", () => {
    expect(atributTerima(GRUP_BERKAS[1])).toBe(".pdf,.doc,.docx");
    expect(ukuranTeks(null)).toBe("");
    expect(ukuranTeks(2048)).toBe("2 KB");
    expect(ukuranTeks(1572864)).toBe("1,5 MB");
  });
  it("ringkasan status per jenis", () => {
    const l = [b(1, "kuesioner"), b(2, "kuesioner")];
    expect(ringkasJenis(l, "kuesioner").teks).toBe("2 berkas terunggah");
    expect(ringkasJenis(l, "pedoman").teks).toBe("Belum diunggah");
    expect(ringkasJenis([b(1, "materi")], "materi").teks).toBe("1 berkas terunggah");
    const r = ringkasSemua(l);
    expect(r.terisi).toBe(1);
    expect(r.lengkap).toBe(false);
    expect(ringkasSemua([...l, b(3, "pedoman"), b(4, "materi")]).lengkap).toBe(true);
  });
});

describe("berkasLokal (Cache Storage)", () => {
  beforeEach(() => {
    const toko = new Map<string, Response>();
    const cache = {
      put: async (k: string, r: Response) => void toko.set(k, r),
      match: async (k: string) => toko.get(k),
      delete: async (k: string) => toko.delete(k),
      keys: async () => [...toko.keys()].map((u) => ({ url: `https://x.test${u}` })),
    };
    (globalThis as { caches?: unknown }).caches = { open: async () => cache };
  });
  it("menyimpan, mengenali, mengambil, dan menghapus berkas per id", async () => {
    expect((await idBerkasTersimpan()).size).toBe(0);
    expect(await ambilBerkasLokal(5)).toBeNull();
    expect(await simpanBerkasLokal(5, new Blob(["halo"]))).toBe(true);
    expect(await simpanBerkasLokal(9, new Blob(["x"]))).toBe(true);
    expect([...(await idBerkasTersimpan())].sort()).toEqual([5, 9]);
    expect(await (await ambilBerkasLokal(5))!.text()).toBe("halo");
    await hapusBerkasLokal(5);
    expect([...(await idBerkasTersimpan())]).toEqual([9]);
    expect(kunciBerkasLokal(9)).toBe("/_berkas-lokal/9");
  });
  it("diam-diam tidak ada bila Cache Storage tidak tersedia atau gagal", async () => {
    delete (globalThis as { caches?: unknown }).caches;
    expect((await idBerkasTersimpan()).size).toBe(0);
    expect(await simpanBerkasLokal(1, new Blob(["a"]))).toBe(false);
    expect(await ambilBerkasLokal(1)).toBeNull();
    await expect(hapusBerkasLokal(1)).resolves.toBeUndefined();
    (globalThis as { caches?: unknown }).caches = { open: async () => { throw new Error("penuh"); } };
    expect(await simpanBerkasLokal(1, new Blob(["a"]))).toBe(false);
    expect((await idBerkasTersimpan()).size).toBe(0);
  });
});
