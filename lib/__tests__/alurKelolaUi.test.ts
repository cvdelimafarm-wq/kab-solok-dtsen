import { describe, expect, it } from "vitest";
import * as React from "react";
import { createElement as e } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NavAlur, PenunjukAlur } from "@/app/sigap/kelola/AlurKelola";
import { alurIdentifikasi, posisiAlur, urutanDariTab, urutanSubAlur } from "@/lib/alurKelola";

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
    expect(h).toContain('href="/sigap/kelola/perencanaan/identifikasi/9/tim"');
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
  it("daftar seluruh tahap: semua tahap tampil, tahap sekarang ditandai, tahap lain berupa tautan", () => {
    const h = renderToStaticMarkup(e(PenunjukAlur, { nama: "Alur identifikasi survei", posisi: posisiAlur(alurIdentifikasi(9), "pelatihan") }));
    expect(h).toContain("Lihat seluruh tahap (7)");
    for (const nama of ["1 · Identifikasi awal", "2 · Identifikasi lanjutan", "3 · Susunan tim kerja", "4 · Rekrutmen dan pengadaan", "5 · Persiapan pelatihan", "6 · Persiapan pendataan", "7 · Gap pelaksanaan"]) {
      expect(h).toContain(nama);
    }
    expect(h).toContain("(Anda di sini)");
    expect(h).toContain('href="/sigap/kelola/perencanaan/identifikasi/9/pendataan"');
    expect(h).not.toContain('href="/sigap/kelola/perencanaan/identifikasi/9/pelatihan"'); // tahap sekarang bukan tautan
  });

  it("lajur ikon: satu ikon per tahap, tahap sekarang ditandai, tahap lain bisa dibuka (tautan)", () => {
    const h = renderToStaticMarkup(e(PenunjukAlur, { nama: "Alur identifikasi survei", posisi: posisiAlur(alurIdentifikasi(9), "pelatihan") }));
    expect(h).toContain('aria-label="Ikon tahap alur"');
    expect(h.match(/<svg/g)?.length).toBe(7);
    expect(h.match(/aria-current="step"/g)?.length).toBeGreaterThanOrEqual(2); // judul + ikon sekarang
    expect(h).toContain('aria-label="Buka tahap 6 · Persiapan pendataan"');
    expect(h).not.toContain('aria-label="Buka tahap 5 · Persiapan pelatihan"'); // tahap sekarang bukan tautan
  });
  it("lajur ikon alur bertab: tombol per tahap lain, Ringkasan tanpa nomor", () => {
    const h = renderToStaticMarkup(e(PenunjukAlur, { nama: "Alur pendataan", posisi: posisiAlur(tab, "persiapan"), onPilih: () => undefined }));
    expect(h.match(/<svg/g)?.length).toBe(3);
    expect(h).toContain('aria-label="Buka tahap Ringkasan"');
    expect(h).toContain('aria-label="Buka tahap 2 · Tim &amp; Surat Tugas"');
  });
  it("lajur ikon: lebih dari 12 tahap tidak digambar; kode tak dikenal memakai titik", () => {
    const banyak = urutanDariTab(Array.from({ length: 13 }, (_, i) => ({ kode: `x${i}`, label: `${i + 1} · T${i + 1}` })));
    expect(renderToStaticMarkup(e(PenunjukAlur, { nama: "x", posisi: posisiAlur(banyak, "x0") }))).not.toContain("<svg");
    const asing = urutanDariTab([{ kode: "asing", label: "Asing" }, { kode: "asing2", label: "Asing 2" }]);
    expect(renderToStaticMarkup(e(PenunjukAlur, { nama: "x", posisi: posisiAlur(asing, "asing") }))).toContain("<circle");
  });

  it("sub-alur ringkas: ikon bernama, tanpa keterangan/daftar lengkap; teks terakhir khusus; navigasi berjudul", () => {
    const sub = urutanSubAlur(
      [{ kode: "monitoring", label: "Kelengkapan SPJ", ket: "Kelengkapan per petugas." }, { kode: "unduh", label: "Unduh SPJ" }],
      ["monitoring", "unduh"],
      { monitoring: "daftar", unduh: "unduh" }
    );
    const awal = renderToStaticMarkup(e(PenunjukAlur, { nama: "Alur SPJ transport lokal", posisi: posisiAlur(sub, "monitoring"), onPilih: () => undefined, ringkas: true }));
    expect(awal).toContain("Tahap 1 dari 2 · Kelengkapan SPJ");
    expect(awal).toContain('aria-label="Buka tahap 2 · Unduh SPJ"');
    expect(awal.match(/<svg/g)?.length).toBe(2);
    expect(awal).not.toContain("Lihat seluruh tahap");
    expect(awal).not.toContain("Kelengkapan per petugas.");
    const akhir = renderToStaticMarkup(e(PenunjukAlur, { nama: "Alur SPJ transport lokal", posisi: posisiAlur(sub, "unduh"), onPilih: () => undefined, ringkas: true }));
    expect(akhir).toContain("Ini langkah terakhir di tahap ini.");
    const nav = renderToStaticMarkup(e(NavAlur, { posisi: posisiAlur(sub, "unduh"), onPilih: () => undefined, judul: "Langkah dalam SPJ transport lokal" }));
    expect(nav).toContain("Langkah dalam SPJ transport lokal");
    expect(nav).toContain("Langkah terakhir di tahap ini");
    expect(nav).not.toContain("Tahap terakhir alur");
    expect(nav).toContain(">Sebelumnya<");
  });
});

