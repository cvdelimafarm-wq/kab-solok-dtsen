import { describe, expect, it } from "vitest";
import * as React from "react";
import { createElement as e } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NavPelatihan, PenunjukPelatihan, StripPelatihan } from "@/app/sigap/pelatihan/AlurPelatihan";
import { hitungLangkahPelatihan, statusLangkah, type MasukanLangkah } from "@/lib/alurPelatihan";

// JSX klasik di konfigurasi vitest proyek ini: sediakan React global agar komponen bisa dirender.
(globalThis as unknown as { React: typeof React }).React = React;

const MULAI = new Date("2026-11-05T08:00:00+07:00").getTime();
const masukan = (o: Partial<MasukanLangkah> = {}): MasukanLangkah => ({
  langkah: { undangan_dibuka: true, instrumen_diunduh: true, foto_total: 5, slot: [] },
  tes: [
    { jenis: "pretest", status: "terlewat" },
    { jenis: "posttest", status: "belum_buka" },
  ],
  presensi: null,
  kuis: null,
  fotoTranslok: true,
  mulaiMs: MULAI,
  now: MULAI - 86_400_000,
  ...o,
});
const daftar = hitungLangkahPelatihan(masukan());
const status = statusLangkah(daftar);

describe("komponen langkah pelatihan", () => {
  it("lajur: satu butir per langkah, yang aktif bertanda step, selesai memakai centang", () => {
    const h = renderToStaticMarkup(e(StripPelatihan, { daftar, status, aktif: "pretest" }));
    expect(h.match(/<li /g)?.length).toBe(daftar.length);
    expect(h).toContain('aria-current="step"');
    expect(h).toContain("Undangan");
    expect(h).toContain("Foto Translok"); // (3 Nov 2026) nama pendek langkah foto
    expect(h).toContain("selesai"); // teks status untuk pembaca layar
    expect(h).toContain("terlewat");
  });
  it("lajur: langkah yang halamannya sendiri berupa tautan; yang bagian halaman Langkah juga tautan bila tanpa onGulir, tombol bila ada onGulir", () => {
    const tanpa = renderToStaticMarkup(e(StripPelatihan, { daftar, status, aktif: "pretest" }));
    expect(tanpa).toContain('href="/sigap/pelatihan/undangan"');
    expect(tanpa).toContain('href="/sigap/pelatihan?langkah=hadir"');
    const dengan = renderToStaticMarkup(e(StripPelatihan, { daftar, status, aktif: null, onGulir: () => undefined }));
    expect(dengan).toContain('href="/sigap/pelatihan/undangan"'); // punya halaman sendiri: tetap tautan
    expect(dengan).not.toContain('href="/sigap/pelatihan?langkah=hadir"'); // bagian halaman ini: tombol gulir
    expect(dengan).toContain("<button");
    expect(dengan).not.toContain('aria-current="step"');
  });
  it("penunjuk: 'Langkah 3 dari n', status, dan ringkasan progres", () => {
    const h = renderToStaticMarkup(e(PenunjukPelatihan, { daftar, status, aktif: "pretest" }));
    expect(h).toContain(`Langkah 3 dari ${daftar.length} · Pretest`);
    expect(h).toContain("Terlewat");
    // (3 Nov 2026) kalimat "x dari y langkah selesai" diganti bilah progres tipis + "x/y"
    expect(h).toContain(`aria-label="2 dari ${daftar.length} langkah wajib selesai"`);
    expect(h).toContain(`2/${daftar.length}`);
    expect(h).not.toContain("Lihat semua langkah"); // daftar langkah bernomor sudah dihapus (membingungkan)
  });
  it("penunjuk: kode tak dikenal -> kosong", () => {
    expect(renderToStaticMarkup(e(PenunjukPelatihan, { daftar, status, aktif: "lain" }))).toBe("");
    expect(renderToStaticMarkup(e(NavPelatihan, { daftar, aktif: "lain" }))).toBe("");
  });
  it("navigasi: Sebelumnya dan Berikutnya berupa tautan ke halaman langkah itu", () => {
    const h = renderToStaticMarkup(e(NavPelatihan, { daftar, aktif: "pretest" }));
    expect(h).toContain("Sebelumnya");
    expect(h).toContain("2 · Instrumen");
    expect(h).toContain('href="/sigap/pelatihan/instrumen"');
    expect(h).toContain("4 · Presensi");
    expect(h).toContain('href="/sigap/pelatihan?langkah=hadir"');
  });
  it("navigasi: langkah lepas (presensi, foto) tidak diberi catatan "belum bisa dikerjakan"", () => {
    // (8 Nov 2026) Presensi dan Foto Translok lepas dari urutan: boleh dikerjakan kapan saja, jadi tidak ada peringatan "belum bisa dikerjakan"
    expect(renderToStaticMarkup(e(NavPelatihan, { daftar, aktif: "hadir" }))).not.toContain("belum bisa dikerjakan");
    expect(renderToStaticMarkup(e(NavPelatihan, { daftar, aktif: "pretest" }))).not.toContain("belum bisa dikerjakan");
    // Posttest kini penunjuk "Berikutnya" (langkah berurutan pertama yang belum selesai), jadi dari Foto Translok juga tanpa catatan
    expect(renderToStaticMarkup(e(NavPelatihan, { daftar, aktif: "foto_awal" }))).not.toContain("belum bisa dikerjakan");
  });
  it("navigasi: langkah terakhir -> kalimat penutup, tanpa Berikutnya", () => {
    const akhir = daftar[daftar.length - 1].kode;
    const h = renderToStaticMarkup(e(NavPelatihan, { daftar, aktif: akhir }));
    expect(h).toContain("Langkah terakhir pelatihan");
    expect(h).not.toContain(">Berikutnya<");
  });
  it("navigasi: langkah pertama tidak punya Sebelumnya", () => {
    const h = renderToStaticMarkup(e(NavPelatihan, { daftar, aktif: "undangan" }));
    expect(h).not.toContain(">Sebelumnya<");
    expect(h).toContain("2 · Instrumen");
  });
});
