import { describe, expect, it } from "vitest";
import * as React from "react";
import { createElement as e } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NavAlur, PenunjukAlur } from "@/app/sigap/kelola/AlurKelola";
import { alurIdentifikasi, posisiAlur, urutanDariTab } from "@/lib/alurKelola";

// Komponen memakai JSX runtime klasik di konfigurasi vitest proyek ini (tanpa transform otomatis): sediakan React global agar bisa dirender.
(globalThis as unknown as { React: typeof React }).React = React;

const tab = urutanDariTab([
  { kode: "ringkasan", label: "Ringkasan" },
  { kode: "persiapan", label: "1 · Persiapan", ket: "Unggah daftar KK." },
  { kode: "tim", label: "2 · Tim & Surat Tugas" },
]);

describe("komponen alur", () => {
  it("penunjuk menampilkan tahap, keterangan, dan selanjutnya", () => {
    const h = renderToStaticMarkup(e(PenunjukAlur, { nama: "Alur pendataan", posisi: posisiAlur(tab, "persiapan") }));
    expect(h).toContain("Tahap 1 dari 2 · Persiapan");
    expect(h).toContain("Unggah daftar KK.");
    expect(h).toContain("Selanjutnya:");
    expect(h).toContain("2 · Tim &amp; Surat Tugas");
  });
  it("tahap terakhir: tanpa selanjutnya", () => {
    const h = renderToStaticMarkup(e(PenunjukAlur, { nama: "Alur pendataan", posisi: posisiAlur(tab, "tim") }));
    expect(h).toContain("Ini tahap terakhir alur.");
  });
  it("posisi null -> tidak menggambar apa pun", () => {
    expect(renderToStaticMarkup(e(PenunjukAlur, { nama: "x", posisi: null }))).toBe("");
    expect(renderToStaticMarkup(e(NavAlur, { posisi: null }))).toBe("");
  });
  it("alur bertab: dua tombol; Ringkasan hanya Berikutnya", () => {
    const tengah = renderToStaticMarkup(e(NavAlur, { posisi: posisiAlur(tab, "persiapan"), onPilih: () => undefined }));
    expect(tengah).toContain(">Sebelumnya<");
    expect(tengah).toContain("Berikutnya");
    const awal = renderToStaticMarkup(e(NavAlur, { posisi: posisiAlur(tab, "ringkasan"), onPilih: () => undefined }));
    expect(awal).not.toContain(">Sebelumnya<");
    expect(awal).toContain("Berikutnya");
  });
  it("alur berhalaman: tombol berupa tautan", () => {
    const h = renderToStaticMarkup(e(NavAlur, { posisi: posisiAlur(alurIdentifikasi(9), "lanjutan") }));
    expect(h).toContain('href="/sigap/kelola/perencanaan/identifikasi/9"');
    expect(h).toContain('href="/sigap/kelola/perencanaan/identifikasi/9/kebutuhan"');
  });
  it("peringatan tampil bila diberikan, tidak memblokir tombol", () => {
    const h = renderToStaticMarkup(e(NavAlur, { posisi: posisiAlur(tab, "persiapan"), onPilih: () => undefined, peringatan: "Daftar KK belum diunggah." }));
    expect(h).toContain("Daftar KK belum diunggah.");
    expect(h).toContain("Berikutnya");
  });
  it("tahap terakhir: ada penanda selesai alur", () => {
    const h = renderToStaticMarkup(e(NavAlur, { posisi: posisiAlur(tab, "tim"), onPilih: () => undefined }));
    expect(h).toContain("Tahap terakhir alur");
  });
});
