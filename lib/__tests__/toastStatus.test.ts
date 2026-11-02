// Pemberitahuan status di pojok kanan bawah (Toast): komponen tidak boleh berpola modal (Back HP), dan hierarki pelatihan memakainya
// sebagai pengganti keterangan "Menyimpan…/✓ Tersimpan" di dalam baris tabel.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const baca = (rel: string) => fs.readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const POLA_MODAL = /fixed inset-0|role="dialog"|aria-modal/;

describe("Toast status", () => {
  const toast = baca("app/sigap/admin/Toast.tsx");
  it("posisi pojok kanan bawah dan bukan modal", () => {
    expect(toast).toMatch(/fixed bottom-4 right-4/);
    expect(POLA_MODAL.test(toast)).toBe(false);
  });
  it("galat memakai role alert dan bisa ditutup; ok dan simpan memakai role status", () => {
    expect(toast).toMatch(/role=\{isi\.jenis === "galat" \? "alert" : "status"\}/);
    expect(toast).toMatch(/aria-label="Tutup pemberitahuan"/);
  });
  it("hanya jenis ok yang hilang sendiri", () => {
    expect(toast).toMatch(/if \(jenis === "ok"\) timer\.current = setTimeout/);
  });
});

describe("hierarki pelatihan memakai Toast", () => {
  const h = baca("app/sigap/pelatihan/kelola/hierarki.tsx");
  it("mengimpor dan memasang Toast", () => {
    expect(h).toMatch(/from "\.\.\/\.\.\/admin\/Toast"/);
    expect(h).toMatch(/<Toast isi=\{toast\.isi\} onTutup=\{toast\.tutup\} \/>/);
  });
  it("tidak lagi menampilkan status di dalam baris tabel", () => {
    expect(h).not.toMatch(/✓ Tersimpan/);
    expect(h).not.toMatch(/Menyimpan…<\/span>/);
    expect(h).not.toMatch(/setStatus/);
  });
  it("tiga status dikirim ke Toast: simpan, ok, galat", () => {
    expect(h).toMatch(/toast\.tampil\("simpan"/);
    expect(h).toMatch(/toast\.tampil\("ok", "Tersimpan"\)/);
    expect(h).toMatch(/toast\.tampil\("galat"/);
  });
});
