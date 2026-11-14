// lib/__tests__/pemahamanHitung.test.ts
// (14 Nov 2026) Penjaga langkah 2 templat monitoring pemahaman: satu sumber hitung, angka yang sama sama di semua tampilan.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hitungPemahaman } from "@/lib/pemahamanHitung";
import { susunPetugasQc } from "@/lib/sigapQcMonitor";
import type { QcRekapTim } from "@/lib/sigapQc";
import type { RincianQc } from "@/lib/sigapQcMonitor";

const ppl = (akun_id: number, nama: string, percobaan: number, lulus: boolean, skor: number | null) => ({ akun_id, nama, percobaan, skor_awal: skor, skor_terbaik: skor, lulus, terlambat: false, status: "" });

// PPL 3 tercatat di dua tim (KK-nya di dua PML); PPL 4 peserta tetapi tidak ada di rekap (belum punya tim)
const rekap: QcRekapTim[] = [
  { pml_akun_id: 10, pml_nama: "PML A", pml_sendiri: { percobaan: 1, lulus: true, skor_terbaik: 100 }, jumlah_ppl: 2, sudah: 2, belum_mengisi: 0, lulus: 1, rata_awal: 80, rata_terbaik: 90, ppl: [ppl(1, "Satu", 1, true, 100), ppl(3, "Tiga", 2, false, 60)], salah: [] },
  { pml_akun_id: 20, pml_nama: "PML B", pml_sendiri: { percobaan: 0, lulus: false, skor_terbaik: null }, jumlah_ppl: 2, sudah: 1, belum_mengisi: 1, lulus: 0, rata_awal: 60, rata_terbaik: 60, ppl: [ppl(2, "Dua", 0, false, null), ppl(3, "Tiga", 2, false, 60)], salah: [] },
];
const rincian: RincianQc = {
  soal: {},
  percobaan: {
    1: [{ ke: 1, skor: 100, benar: 5, jumlah: 5, terlambat: false, selesai_at: "2026-11-14T01:00:00Z", salah: [] }],
    3: [
      { ke: 1, skor: 40, benar: 2, jumlah: 5, terlambat: true, selesai_at: "2026-11-14T01:00:00Z", salah: [] },
      { ke: 2, skor: 60, benar: 3, jumlah: 5, terlambat: true, selesai_at: "2026-11-14T02:00:00Z", salah: [] },
    ],
    10: [{ ke: 1, skor: 100, benar: 5, jumlah: 5, terlambat: false, selesai_at: "2026-11-14T01:00:00Z", salah: [] }],
  },
};
const pesertaMentah = [
  { akun_id: 10, nama: "PML A", peran: "pml", pml_akun_id: null, pml_nama: null },
  { akun_id: 20, nama: "PML B", peran: "pml", pml_akun_id: null, pml_nama: null },
  { akun_id: 1, nama: "Satu", peran: "ppl", pml_akun_id: 10, pml_nama: "PML A" },
  { akun_id: 2, nama: "Dua", peran: "ppl", pml_akun_id: 20, pml_nama: "PML B" },
  { akun_id: 3, nama: "Tiga", peran: "ppl", pml_akun_id: 10, pml_nama: "PML A" },
  { akun_id: 4, nama: "Empat", peran: "ppl", pml_akun_id: null, pml_nama: null },
];
const percobaanMentah = [
  { akun_id: 1, ke: 1, skor: 100, benar: 5, jumlah: 5, terlambat: false, selesai_at: "2026-11-14T01:00:00Z" },
  { akun_id: 3, ke: 1, skor: 40, benar: 2, jumlah: 5, terlambat: true, selesai_at: "2026-11-14T01:00:00Z" },
  { akun_id: 3, ke: 2, skor: 60, benar: 3, jumlah: 5, terlambat: true, selesai_at: "2026-11-14T02:00:00Z" },
  { akun_id: 10, ke: 1, skor: 100, benar: 5, jumlah: 5, terlambat: false, selesai_at: "2026-11-14T01:00:00Z" },
];
const { petugas, monitoring } = susunPetugasQc({ peserta: pesertaMentah, percobaan: percobaanMentah, langganan: [], kirim: [], sesi: [], tundaAkun: [], nilaiLulus: 100, rilisAt: null, now: new Date("2026-11-14T03:00:00Z") });
const h = hitungPemahaman({ rekap, rincian, peserta: petugas, nilaiLulus: 100, kolom: 4, jumlahSoal: 5, batasJam: "12:00" });

describe("hitungPemahaman: satu sumber hitung", () => {
  it("orang dihitung sekali walau di dua tim, dan peserta tanpa tim tetap terhitung", () => {
    expect(h.baris.map((b) => b.akun_id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 10, 20]);
    expect(h.ringkas.peserta).toBe(6);
    expect(h.baris.find((b) => b.akun_id === 3)?.pml).toBe("PML A / PML B");
  });

  it("KPI, status infografis, sebaran, dan tabel berasal dari baris yang sama", () => {
    const r = h.ringkas;
    expect(r.mengisi).toBe(h.baris.filter((b) => b.percobaan > 0).length);
    expect(r.lulus).toBe(h.status.lulus.length);
    expect(r.belum_lulus).toBe(h.status.belumLulus.length);
    expect(r.belum).toBe(h.status.belum.length);
    expect(r.lulus + r.belum_lulus + r.belum).toBe(r.peserta);
    expect(h.sebaran_percobaan.reduce((a, t) => a + t.jumlah, 0)).toBe(r.peserta);
    expect(h.sebaran_percobaan[0].jumlah).toBe(r.belum);
    expect(h.sebaran_pertama.reduce((a, t) => a + t.jumlah, 0)).toBe(r.peserta);
    expect(r.terlambat).toBe(h.status.terlambat.length);
  });

  it("rincian per peran menjumlah ke total", () => {
    const { pml, ppl: pp } = h.ringkas.per_peran;
    expect(pml.peserta + pp.peserta).toBe(h.ringkas.peserta);
    expect(pml.mengisi + pp.mengisi).toBe(h.ringkas.mengisi);
    expect(pml.lulus + pp.lulus).toBe(h.ringkas.lulus);
    expect(pml).toEqual({ peserta: 2, mengisi: 1, belum: 1, lulus: 1, belum_lulus: 0 });
    expect(pp).toEqual({ peserta: 4, mengisi: 2, belum: 2, lulus: 1, belum_lulus: 1 });
  });

  it("sama dengan hitungan pemantauan push (daftar peserta yang sama)", () => {
    expect(h.ringkas.peserta).toBe(monitoring.peserta);
    expect(h.ringkas.mengisi).toBe(monitoring.sudah_mengisi);
    expect(h.ringkas.lulus).toBe(monitoring.lulus);
  });

  it("definisi tertulis untuk lulus, terlambat, percobaan pertama, dan nilai terbaik", () => {
    expect(h.definisi.lulus).toMatch(/nilai 100/);
    expect(h.definisi.terlambat).toMatch(/12\.00|12:00/);
    expect(h.definisi.pertama).toMatch(/pertama/);
    expect(h.definisi.terbaik).toMatch(/tertinggi/);
  });

  it("belum ada yang mengisi: semua belum, tanpa pembagian nol yang menyesatkan", () => {
    const k = hitungPemahaman({ rekap: [], rincian: undefined, peserta: [{ akun_id: 1, nama: "A", peran: "ppl" }], nilaiLulus: 80, kolom: 2, jumlahSoal: 0 });
    expect(k.ringkas).toMatchObject({ peserta: 1, mengisi: 0, belum: 1, lulus: 0, rata_pertama: null });
    expect(k.definisi.lulus).toMatch(/80 atau lebih/);
  });
});

describe("pemasangan: layar membaca hasil yang sama", () => {
  it("server mengirim `pemahaman` di hasil QC SPDT dan Kelola Pendataan", () => {
    const src = readFileSync("lib/portal/qc.ts", "utf8");
    expect(src.match(/hitungPemahaman\(/g)?.length).toBe(2);
  });
  it("KPI SPDT dan Pascabencana membaca ringkas, infografis menerima `hasil`", () => {
    const spdt = readFileSync("app/sigap/spdt/QcSpdt.tsx", "utf8");
    const psp = readFileSync("app/sigap/kelola/pendataan/QcPemahaman.tsx", "utf8");
    expect(spdt).toMatch(/pem!\.ringkas/);
    expect(spdt).toMatch(/hasil=\{pem/);
    expect(spdt).not.toMatch(/susunBarisQc\(/);
    expect(psp).toMatch(/pem\.ringkas\.per_peran/);
    expect(psp).toMatch(/hasil=\{pem\}/);
    expect(psp).not.toMatch(/susunBarisQc\(/);
  });
});
