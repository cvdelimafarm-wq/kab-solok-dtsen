import { describe, expect, it } from "vitest";
import { BATAS_HARI_SUSUN, jendelaSusunFoto, nomorBerikutnya, nomorKosong, ringkasKosong, susunFoto, umurHari, type Kandidat } from "@/lib/sigapFotoSusun";

const k = (id: number, menit: number, o: Partial<Kandidat> = {}): Kandidat => ({ id, ms: Date.UTC(2026, 9, 20, 8, menit), ...o });

describe("nomorBerikutnya / nomorKosong", () => {
  it("foto pertama hari itu = nomor 1, kedua = 2, dst", () => {
    expect(nomorBerikutnya([])).toBe(1);
    expect(nomorBerikutnya([1])).toBe(2);
    expect(nomorBerikutnya([1, 2, 3])).toBe(4);
  });
  it("mengisi lubang terkecil, bukan sesudah nomor tertinggi", () => {
    expect(nomorBerikutnya([1, 3, 5])).toBe(2);
    expect(nomorBerikutnya([2, 3])).toBe(1);
  });
  it("semua terisi -> null; nomor di luar rentang diabaikan", () => {
    expect(nomorBerikutnya([1, 2, 3, 4, 5])).toBeNull();
    expect(nomorBerikutnya([9, 0])).toBe(1);
  });
  it("jumlah nomor mengikuti aturan kegiatan", () => {
    expect(nomorBerikutnya([1, 2, 3], 3)).toBeNull();
    expect(nomorKosong([2, 4])).toEqual([1, 3, 5]);
    expect(ringkasKosong([])).toMatch(/terisi/);
    expect(ringkasKosong([1, 4])).toContain("1, 4");
  });
});

describe("susunFoto", () => {
  it("foto <= nomor kosong: urut waktu ke nomor kosong terkecil", () => {
    const r = susunFoto([k(3, 30), k(1, 10), k(2, 20)], [1, 2, 3, 4, 5]);
    expect(r.dipasang).toEqual([{ id: 1, slot: 1 }, { id: 2, slot: 2 }, { id: 3, slot: 3 }]);
    expect(r.cadangan).toEqual([]);
  });
  it("kasus penugasan 49 (20 Okt): nomor 4 kosong, dua foto -> hanya satu nomor terisi, satu cadangan", () => {
    const r = susunFoto([k(279, 38), k(364, 55)], [4]);
    expect(r.dipasang).toHaveLength(1);
    expect(r.cadangan).toHaveLength(1);
  });
  it("tidak pernah memakai nomor yang tidak diberikan (tidak menimpa nomor terisi)", () => {
    const r = susunFoto([k(1, 1), k(2, 2), k(3, 3)], [2, 5]);
    expect(r.dipasang.map((p) => p.slot).sort()).toEqual([2, 5]);
  });
  it("foto lebih dari 5: nomor 1 = paling awal, nomor 5 = paling akhir, nomor 3 = tengah; sisanya cadangan", () => {
    const foto = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => k(i, i * 10));
    const r = susunFoto(foto, [1, 2, 3, 4, 5]);
    const per = Object.fromEntries(r.dipasang.map((p) => [p.slot, p.id]));
    expect(per[1]).toBe(1);
    expect(per[5]).toBe(9);
    expect(per[3]).toBe(5);
    expect(r.dipasang).toHaveLength(5);
    expect(r.cadangan).toHaveLength(4);
  });
  it("hasil tetap urut waktu menaik terhadap nomor, dan setiap foto dipakai sekali", () => {
    const foto = Array.from({ length: 7 }, (_, i) => k(i + 1, (i + 1) * 5));
    const r = susunFoto(foto, [1, 2, 3, 4, 5]);
    const urut = [...r.dipasang].sort((a, b) => a.slot - b.slot).map((p) => p.id);
    expect([...urut].sort((a, b) => a - b)).toEqual(urut);
    expect(new Set(r.dipasang.map((p) => p.id)).size).toBe(r.dipasang.length);
    expect(r.dipasang.length + r.cadangan.length).toBe(7);
  });
  it("berlebih: foto kuning disisihkan lebih dulu", () => {
    const foto = [k(1, 10), k(2, 20, { kuning: true }), k(3, 30), k(4, 40), k(5, 50), k(6, 60)];
    const r = susunFoto(foto, [1, 2, 3, 4, 5]);
    expect(r.cadangan.map((c) => c.id)).toEqual([2]);
    expect(r.dipasang.map((p) => p.id)).toEqual([1, 3, 4, 5, 6]);
  });
  it("foto kuning tetap dipakai bila tidak berlebih", () => {
    const r = susunFoto([k(1, 10, { kuning: true }), k(2, 20)], [1, 2, 3]);
    expect(r.dipasang).toHaveLength(2);
  });
  it("foto di luar wilayah tidak ditempatkan di nomor 2-4, tetapi boleh di 1 atau 5", () => {
    const r = susunFoto([k(1, 10, { diLuarWilayah: true })], [2, 3, 4]);
    expect(r.dipasang).toEqual([]);
    expect(r.cadangan.map((c) => c.id)).toEqual([1]);
    const r2 = susunFoto([k(1, 10, { diLuarWilayah: true }), k(2, 20)], [1, 2, 3]);
    expect(r2.dipasang).toEqual([{ id: 1, slot: 1 }, { id: 2, slot: 2 }]);
    const r3 = susunFoto([k(1, 10, { diLuarWilayah: true }), k(2, 20)], [2, 5]);
    expect(r3.dipasang).toEqual([{ id: 2, slot: 2 }, { id: 1, slot: 5 }]);
  });
  it("tanpa nomor kosong atau tanpa foto: tidak ada penempatan", () => {
    expect(susunFoto([k(1, 1)], []).dipasang).toEqual([]);
    expect(susunFoto([], [1, 2]).dipasang).toEqual([]);
    expect(susunFoto([k(1, 1)], [0, 6, 1.5]).dipasang).toEqual([]);
  });
  it("deterministik: urutan masukan tidak memengaruhi hasil", () => {
    const foto = [4, 1, 3, 2, 6, 5, 7].map((i) => k(i, i * 3));
    expect(susunFoto(foto, [1, 2, 3, 4, 5])).toEqual(susunFoto([...foto].reverse(), [1, 2, 3, 4, 5]));
  });
});

describe("jendela mengatur nomor foto (umur tanggal)", () => {
  it("umur hari dihitung dari selisih tanggal, termasuk lintas bulan dan tahun", () => {
    expect(umurHari("2026-10-20", "2026-10-20")).toBe(0);
    expect(umurHari("2026-10-20", "2026-10-25")).toBe(5);
    expect(umurHari("2026-09-29", "2026-10-03")).toBe(4);
    expect(umurHari("2026-12-30", "2027-01-02")).toBe(3);
    expect(umurHari("2026-10-26", "2026-10-25")).toBe(-1);
  });
  it("hari ini sampai umur 5 hari boleh; lebih dari 5 hari terkunci; tanggal mendatang belum", () => {
    expect(BATAS_HARI_SUSUN).toBe(5);
    expect(jendelaSusunFoto("2026-10-25", "2026-10-25")).toBe("ok");
    expect(jendelaSusunFoto("2026-10-24", "2026-10-25")).toBe("ok");
    expect(jendelaSusunFoto("2026-10-20", "2026-10-25")).toBe("ok"); // tepat 5 hari: hari terakhir
    expect(jendelaSusunFoto("2026-10-19", "2026-10-25")).toBe("terkunci"); // 6 hari
    expect(jendelaSusunFoto("2026-10-26", "2026-10-25")).toBe("akan_datang");
  });
});
