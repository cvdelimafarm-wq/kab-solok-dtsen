// lib/__tests__/pemahamanTes.test.ts
// (14 Nov 2026) Penjaga langkah 3: satu fungsi hitung monitoring tes pelatihan (Hari H dan Evaluasi).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { hitungPemahamanTes, MENIT_MACET, type SesiTesMasuk } from "@/lib/pemahamanTes";

const NOW = Date.parse("2026-11-14T03:00:00Z");
const iso = (menitLalu: number) => new Date(NOW - menitLalu * 60_000).toISOString();
const opsi = [
  { kode: "A", teks: "Satu" },
  { kode: "B", teks: "Dua" },
  { kode: "C", teks: "Tiga" },
];
const soal = [
  { nomor: 1, teks: "Soal satu", opsi, kunci: "A", topik: "Konsep" },
  { nomor: 2, teks: "Soal dua", opsi, kunci: "B", topik: "Konsep" },
  { nomor: 3, teks: "Soal tiga", opsi, kunci: "C", topik: "Blok IV" },
];
const peserta = [1, 2, 3, 4, 5, 6].map((id) => ({ akun_id: id, nama: `P0${id}`, kelas: 1, tim: "PML A", peran: "ppl" }));
const sesi: SesiTesMasuk[] = [
  // 1: selesai sekali, nilai 100
  { akun_id: 1, mulai_at: iso(30), batas_at: iso(-10), selesai_at: iso(20), jawaban: { "1": "A", "2": "B", "3": "C" }, jawaban_waktu: { "1": { t: iso(29), u: iso(29), n: 1 }, "2": { t: iso(27), u: iso(27), n: 1 }, "3": { t: iso(21), u: iso(21), n: 1 } }, skor: 100, skor_awal: 100, skor_terbaik: 100, percobaan: 1 },
  // 2: sudah mengulang; percobaan pertama (arsip) salah soal 3 memilih B; sesi sekarang benar semua
  { akun_id: 2, mulai_at: iso(10), batas_at: iso(-20), selesai_at: iso(5), jawaban: { "1": "A", "2": "B", "3": "C" }, skor: 100, skor_awal: 66.67, skor_terbaik: 100, percobaan: 2 },
  // 3: selesai, salah soal 3 memilih B dan soal 2 memilih A -> nilai 33
  { akun_id: 3, mulai_at: iso(30), batas_at: iso(-10), selesai_at: iso(15), jawaban: { "1": "A", "2": "A", "3": "B" }, skor: 33.33, skor_awal: 33.33, skor_terbaik: 33.33, percobaan: 1 },
  // 4: sedang mengerjakan, diam 5 menit di soal 2 -> macet
  { akun_id: 4, mulai_at: iso(8), batas_at: iso(-20), selesai_at: null, jawaban: { "1": "A" }, jawaban_waktu: { "1": { t: iso(5), u: iso(5), n: 1 } }, skor: null, skor_awal: null, skor_terbaik: null, percobaan: 1 },
  // 5: waktu habis
  { akun_id: 5, mulai_at: iso(60), batas_at: iso(5), selesai_at: null, jawaban: {}, skor: null, skor_awal: null, skor_terbaik: null, percobaan: 1 },
  // 6: belum mulai (tanpa sesi)
];
const arsipPertama = [{ akun_id: 2, jawaban: { "1": "A", "2": "B", "3": "B" }, mulai_at: iso(25), selesai_at: iso(12), skor: 66.67 }];
const h = hitungPemahamanTes({ jenis: "posttest", soal, sesi, arsipPertama, peserta: [...peserta, peserta[0]], nilaiLulus: 80, nowMs: NOW, pembanding: new Map([[1, 60], [3, 50]]) });
const o = (id: number) => h.orang.find((x) => x.akun_id === id)!;

describe("hitungPemahamanTes", () => {
  it("status per orang dan ringkas menjumlah ke peserta (orang ganda dihitung sekali)", () => {
    expect(h.orang.length).toBe(6);
    expect([1, 2, 3, 4, 5, 6].map((id) => o(id).status)).toEqual(["selesai", "selesai", "selesai", "mengerjakan", "terlewat", "belum"]);
    const r = h.ringkas;
    expect(r.selesai + r.mengerjakan + r.belum + r.terlewat).toBe(r.peserta);
    expect(r.lulus + r.belum_lulus).toBe(r.selesai);
    expect(r).toMatchObject({ peserta: 6, selesai: 3, mengerjakan: 1, belum: 1, terlewat: 1, lulus: 1, macet: 1 });
  });

  it("nilai = percobaan pertama; statistik soal memakai jawaban percobaan pertama (arsip)", () => {
    expect(o(2).nilai).toBe(66.67);
    expect(o(2).terbaik).toBe(100);
    expect(o(2).jawaban["3"]).toBe("B");
    const s3 = h.soal.find((s) => s.nomor === 3)!;
    expect(s3).toMatchObject({ menjawab: 3, benar: 1, salah: 2, pct_benar: 33 });
    expect(s3.keliru_terbanyak).toEqual({ kode: "B", jumlah: 2 });
    expect(s3.perlu_diperiksa).toBe(true);
    expect(s3.salah_akun.sort()).toEqual([2, 3]);
    expect(h.soal.find((s) => s.nomor === 1)!.perlu_diperiksa).toBe(false);
  });

  it("sedang mengerjakan: kemajuan, soal sekarang, dan macet", () => {
    expect(o(4)).toMatchObject({ dijawab: 1, kemajuan_pct: 33, soal_sekarang: 2, macet: true });
    expect(o(4).menit_diam).toBeGreaterThanOrEqual(MENIT_MACET);
  });

  it("pergerakan terhadap pretest dan lama per soal", () => {
    expect(o(1).naik).toBe(40);
    expect(o(3).naik).toBeCloseTo(-16.7, 1);
    expect(h.ada_pembanding).toBe(true);
    expect(h.ada_waktu).toBe(true);
    expect(o(1).lama_soal["3"]).toBe(360);
  });

  it("topik terlemah urut dari persen benar terendah; sebaran menjumlah ke peserta", () => {
    expect(h.topik.map((t) => t.topik)).toEqual(["Blok IV", "Konsep"]);
    expect(h.sebaran.reduce((a, t) => a + t.jumlah, 0)).toBe(h.ringkas.peserta);
  });

  it("Perlu diingatkan: belum mulai, macet, waktu habis, di bawah batas", () => {
    const k = new Map(h.perlu_diingatkan.map((p) => [p.akun_id, p.keadaan]));
    expect(k.get(6)).toBe("Belum mulai");
    expect(k.get(4)).toMatch(/Macet di soal 2/);
    expect(k.get(5)).toMatch(/Waktu habis/);
    expect(k.get(3)).toMatch(/di bawah batas 80/);
    expect(k.get(2)).toMatch(/di bawah batas 80/);
    expect(k.has(1)).toBe(false);
  });

  it("tanpa topik dan tanpa pembanding: kartu terkait tidak tampil", () => {
    const k = hitungPemahamanTes({ jenis: "pretest", soal: soal.map((s) => ({ ...s, topik: null })), sesi: [], peserta, nilaiLulus: 70, nowMs: NOW });
    expect(k.topik).toEqual([]);
    expect(k.ada_pembanding).toBe(false);
    expect(k.ringkas).toMatchObject({ peserta: 6, belum: 6, rata: null });
  });
});

describe("pemasangan: hak lihat di server", () => {
  it("rute pemahaman membatasi data ke cakupan pemantau", () => {
    const src = readFileSync("app/api/sigap/pelatihan/pemahaman/route.ts", "utf8");
    expect(src).toMatch(/cakupanLihat\(pengguna, simpul\)/);
    expect(src).toMatch(/\.in\("akun_id", ids\.slice/);
    expect(src).toMatch(/periksaGerbang/);
  });
});

describe("pemasangan: layar monitoring pelatihan", () => {
  it("Monitoring memasang PemahamanTes dengan mode Hari H dan Evaluasi", () => {
    const page = readFileSync("app/sigap/pelatihan/monitoring/page.tsx", "utf8");
    const komp = readFileSync("app/sigap/pelatihan/monitoring/PemahamanTes.tsx", "utf8");
    expect(page).toMatch(/<PemahamanTes \/>/);
    expect(komp).toMatch(/"hari_h", "Hari H"/);
    expect(komp).toMatch(/"evaluasi", "Evaluasi"/);
    expect(komp).toMatch(/Perlu diingatkan/);
    expect(komp).toMatch(/KepalaKolom/);
  });
});
