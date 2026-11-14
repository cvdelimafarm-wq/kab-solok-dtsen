// lib/__tests__/laporanPemahaman.test.ts
// (14 Nov 2026) Penjaga Laporan (K6): angka laporan = hasil hitung yang sama; cetak siap A4.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hitungPemahamanTes } from "@/lib/pemahamanTes";
import { htmlLaporan, lembarExcel, ringkasanOtomatis } from "@/lib/laporanPemahaman";

const NOW = Date.parse("2026-11-14T03:00:00Z");
const iso = (m: number) => new Date(NOW - m * 60_000).toISOString();
const opsi = [{ kode: "A", teks: "Satu" }, { kode: "B", teks: "Dua" }];
const soal = [
  { nomor: 1, teks: "Soal <satu>", opsi, kunci: "A" },
  { nomor: 2, teks: "Soal dua", opsi, kunci: "B" },
];
const peserta = [1, 2, 3].map((id) => ({ akun_id: id, nama: `P0${id}`, kelas: 1, tim: "PML A", peran: "ppl" }));
const p = hitungPemahamanTes({
  jenis: "pretest",
  soal,
  sesi: [
    { akun_id: 1, mulai_at: iso(20), batas_at: iso(-5), selesai_at: iso(10), jawaban: { "1": "A", "2": "B" }, skor: 100, skor_awal: 100, skor_terbaik: 100, percobaan: 1 },
    { akun_id: 2, mulai_at: iso(20), batas_at: iso(-5), selesai_at: iso(10), jawaban: { "1": "B", "2": "A" }, skor: 0, skor_awal: 0, skor_terbaik: 0, percobaan: 1 },
  ],
  peserta,
  nilaiLulus: 80,
  nowMs: NOW,
});
const k = { kegiatan: "Pelatihan Uji", tes: "Pretest", cakupan: "3 PPL", dibuat: new Date(NOW) };

describe("Laporan pemahaman", () => {
  it("ringkasan otomatis memakai angka hasil hitung, tanpa nama", () => {
    const t = ringkasanOtomatis(p).join(" ");
    expect(t).toMatch(/2 dari 3 peserta/);
    expect(t).toMatch(/1 peserta lulus \(batas 80\)/);
    expect(t).not.toMatch(/P0[123]/);
  });
  it("lembar Excel: satu baris per orang dan per soal", () => {
    const l = lembarExcel(p, k);
    expect(l.map((x) => x.nama)).toEqual(["Ringkasan", "Nilai peserta", "Soal", "Perlu diingatkan"]);
    expect(l[1].baris.length - 1).toBe(p.ringkas.peserta);
    expect(l[2].baris.length - 1).toBe(p.jumlah_soal);
    expect(l[3].baris.length - 1).toBe(p.perlu_diingatkan.length);
  });
  it("halaman cetak: kepala tabel berulang, baris tidak terbelah, nomor halaman, teks di-escape", () => {
    const h = htmlLaporan(p, k);
    expect(h).toMatch(/thead \{ display: table-header-group; \}/);
    expect(h).toMatch(/tr \{ break-inside: avoid; \}/);
    expect(h).toMatch(/counter\(page\)/);
    expect(h).toMatch(/Soal &lt;satu&gt;/);
    expect(h).not.toMatch(/<satu>/);
  });
  it("layar: mode Laporan dengan Unduh Excel dan Cetak / PDF", () => {
    const komp = readFileSync("app/sigap/pelatihan/monitoring/PemahamanTes.tsx", "utf8");
    expect(komp).toMatch(/\["laporan", "Laporan"\]/);
    expect(komp).toMatch(/Unduh Excel/);
    expect(komp).toMatch(/Cetak \/ PDF/);
  });
});
