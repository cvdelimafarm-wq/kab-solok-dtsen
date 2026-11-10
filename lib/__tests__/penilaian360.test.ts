// lib/__tests__/penilaian360.test.ts
// (10 Nov 2026) Uji aturan murni Penilaian 360: susunan tim, pembacaan isian, rekap, dan kemajuan.
import { describe, expect, it } from "vitest";
import { bacaPenilaian, kemajuan, KRITERIA, petaKeanggotaan, rataBaris, rekapPerOrang, susunTim, type BarisNilai, type Skor } from "@/lib/penilaian360";

const kt = [
  { kelompok: 1, peran: "kortim", akun_id: 10 },
  { kelompok: 1, peran: "pml", akun_id: 11 },
  { kelompok: 2, peran: "kortim", akun_id: 20 },
  { kelompok: 2, peran: "pml", akun_id: 21 },
  // korwil lintas kelompok
  { kelompok: 1, peran: "kortim", akun_id: 99 },
  { kelompok: 2, peran: "kortim", akun_id: 99 },
];
const ppl = [
  { akun_id: 101, atasan_akun_id: 11 },
  { akun_id: 102, atasan_akun_id: 11 },
  { akun_id: 201, atasan_akun_id: 21 },
  { akun_id: 301, atasan_akun_id: null },
  { akun_id: 302, atasan_akun_id: 555 }, // atasan tidak berkelompok
];

describe("susunTim", () => {
  it("PPL melihat kortim, PML, dan sesama PPL satu kelompok, tanpa dirinya", () => {
    const t = susunTim(101, kt, ppl)!;
    expect(t.kelompok).toBe(1);
    expect(t.lintas).toBe(false);
    expect(t.anggota.map((a) => a.akun_id)).toEqual([10, 99, 11, 102]);
    expect(t.anggota.map((a) => a.peran)).toEqual(["kortim", "kortim", "pml", "ppl"]);
  });
  it("tidak memuat orang kelompok lain", () => {
    const ids = susunTim(101, kt, ppl)!.anggota.map((a) => a.akun_id);
    expect(ids).not.toContain(20);
    expect(ids).not.toContain(201);
  });
  it("PML dan kortim satu kelompok", () => {
    expect(susunTim(11, kt, ppl)!.anggota.map((a) => a.akun_id)).toEqual([10, 99, 101, 102]);
    expect(susunTim(10, kt, ppl)!.anggota.map((a) => a.akun_id)).toEqual([99, 11, 101, 102]);
  });
  it("kortim lintas kelompok hanya menilai kortim dan PML", () => {
    const t = susunTim(99, kt, ppl)!;
    expect(t.lintas).toBe(true);
    expect(t.anggota.map((a) => a.akun_id)).toEqual([10, 20, 11, 21]);
  });
  it("PPL tanpa atasan atau atasan tak berkelompok tidak punya tim", () => {
    expect(susunTim(301, kt, ppl)).toBeNull();
    expect(susunTim(302, kt, ppl)).toBeNull();
    expect(susunTim(777, kt, ppl)).toBeNull();
  });
  it("baris peran lain diabaikan dan orang ganda dihitung sekali", () => {
    const peta = petaKeanggotaan([...kt, { kelompok: 1, peran: "ppl", akun_id: 500 }, { kelompok: 1, peran: "pml", akun_id: 10 }], ppl);
    expect(peta.has(500)).toBe(false);
    expect(peta.get(10)).toEqual({ peran: "kortim", kelompok: [1] });
  });
});

const sah = { dinilai: 5, skor: { kinerja: 4, kedisiplinan: 5, tim: 3, kerjasama: 4, komunikasi: 5 }, catatan: "  Rajin   membantu  " };

describe("bacaPenilaian", () => {
  it("menerima isian sah dan merapikan catatan", () => {
    const r = bacaPenilaian(sah);
    expect(r).toEqual({ ok: true, dinilai: 5, skor: sah.skor, catatan: "Rajin membantu" });
  });
  it("catatan kosong menjadi null; angka berupa teks diterima", () => {
    const r = bacaPenilaian({ dinilai: "7", skor: { kinerja: "1", kedisiplinan: 2, tim: 3, kerjasama: 4, komunikasi: 5 }, catatan: "   " });
    expect(r.ok && r.dinilai === 7 && r.catatan === null && r.skor.kinerja === 1).toBe(true);
  });
  it("menolak skor di luar 1-5, pecahan, atau kurang satu kriteria", () => {
    for (const bad of [0, 6, 2.5, -1, "x", null]) {
      expect(bacaPenilaian({ ...sah, skor: { ...sah.skor, tim: bad } }).ok).toBe(false);
    }
    const { komunikasi: _k, ...kurang } = sah.skor;
    expect(bacaPenilaian({ ...sah, skor: kurang }).ok).toBe(false);
  });
  it("menolak rekan tidak sah, badan bukan objek, dan catatan terlalu panjang", () => {
    expect(bacaPenilaian({ ...sah, dinilai: 0 }).ok).toBe(false);
    expect(bacaPenilaian({ ...sah, dinilai: "abc" }).ok).toBe(false);
    expect(bacaPenilaian(null).ok).toBe(false);
    expect(bacaPenilaian("x").ok).toBe(false);
    expect(bacaPenilaian({ ...sah, catatan: "a".repeat(301) }).ok).toBe(false);
    expect(bacaPenilaian({ ...sah, catatan: "a".repeat(300) }).ok).toBe(true);
    expect(bacaPenilaian({ ...sah, catatan: 5 }).ok).toBe(false);
  });
  it("lima kriteria sesuai permintaan", () => {
    expect(KRITERIA.map((k) => k.label)).toEqual(["Kinerja", "Kedisiplinan", "Membangun tim", "Kerja sama", "Komunikasi"]);
  });
});

const skor = (n: number): Skor => ({ kinerja: n, kedisiplinan: n, tim: n, kerjasama: n, komunikasi: n });
const nilai = (penilai: number, dinilai: number, s: Skor): BarisNilai => ({ penilai_akun_id: penilai, dinilai_akun_id: dinilai, ...s });

describe("rekapPerOrang", () => {
  it("rata-rata per kriteria dan keseluruhan, urut tertinggi", () => {
    const r = rekapPerOrang([
      nilai(1, 9, skor(5)), nilai(2, 9, skor(4)), nilai(3, 9, { ...skor(3), kinerja: 5 }),
      nilai(1, 8, skor(2)),
    ]);
    expect(r.map((x) => x.akun_id)).toEqual([9, 8]);
    expect(r[0].penilai).toBe(3);
    expect(r[0].per.kinerja).toBe(4.7);
    expect(r[0].per.tim).toBe(4);
    expect(r[0].rata).toBe(4.1);
    expect(r[1].rata).toBe(2);
  });
  it("penilaian diri sendiri tidak dihitung", () => {
    expect(rekapPerOrang([nilai(9, 9, skor(5))])).toEqual([]);
  });
  it("tanpa data = kosong", () => {
    expect(rekapPerOrang([])).toEqual([]);
  });
  it("rataBaris", () => {
    expect(rataBaris({ kinerja: 5, kedisiplinan: 4, tim: 3, kerjasama: 2, komunikasi: 1 })).toBe(3);
  });
});

describe("kemajuan", () => {
  it("menghitung yang sudah dan sisa, abaikan penilaian orang yang sudah keluar tim", () => {
    expect(kemajuan([1, 2, 3], [2, 99])).toEqual({ total: 3, sudah: 1, sisa: 2, lengkap: false });
    expect(kemajuan([1, 2], [1, 2])).toEqual({ total: 2, sudah: 2, sisa: 0, lengkap: true });
  });
  it("tim kosong tidak dianggap lengkap", () => {
    expect(kemajuan([], [])).toEqual({ total: 0, sudah: 0, sisa: 0, lengkap: false });
  });
});
