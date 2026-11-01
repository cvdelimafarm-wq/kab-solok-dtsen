import { describe, expect, it } from "vitest";
import { pilihPelatihanPeserta } from "../sigapPelatihanPilih";

const k = (id: number, m: string | null, s: string | null = m) => ({ id, tanggal_mulai: m, tanggal_selesai: s });

describe("pilihPelatihanPeserta", () => {
  it("kosong -> null; satu -> itu", () => {
    expect(pilihPelatihanPeserta([], "2026-11-01")).toBeNull();
    expect(pilihPelatihanPeserta([k(3, "2026-10-08")], "2026-11-01")).toBe(3);
  });
  it("PSP sudah selesai, Seruti akan datang -> Seruti", () => {
    expect(pilihPelatihanPeserta([k(3, "2026-10-08"), k(7, "2026-11-09")], "2026-11-01")).toBe(7);
  });
  it("yang sedang berlangsung menang atas yang akan datang", () => {
    expect(pilihPelatihanPeserta([k(7, "2026-11-09"), k(8, "2026-11-01", "2026-11-03")], "2026-11-02")).toBe(8);
  });
  it("beberapa akan datang -> paling dekat", () => {
    expect(pilihPelatihanPeserta([k(9, "2026-12-01"), k(7, "2026-11-09")], "2026-11-01")).toBe(7);
  });
  it("hari terakhir masih dihitung belum selesai", () => {
    expect(pilihPelatihanPeserta([k(3, "2026-10-08"), k(7, "2026-11-09")], "2026-11-09")).toBe(7);
  });
  it("semua selesai -> yang paling baru selesai", () => {
    expect(pilihPelatihanPeserta([k(3, "2026-10-08"), k(7, "2026-11-09")], "2026-11-20")).toBe(7);
  });
  it("tanpa tanggal: dianggap belum selesai, urut sesudah yang bertanggal", () => {
    expect(pilihPelatihanPeserta([k(3, "2026-10-08"), k(10, null)], "2026-11-01")).toBe(10);
    expect(pilihPelatihanPeserta([k(10, null), k(7, "2026-11-09")], "2026-11-01")).toBe(7);
  });
  it("seri -> id terkecil", () => {
    expect(pilihPelatihanPeserta([k(8, "2026-11-09"), k(7, "2026-11-09")], "2026-11-01")).toBe(7);
  });
});
