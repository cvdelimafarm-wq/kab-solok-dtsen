import { describe, expect, it } from "vitest";
import {
  alasanBentrok,
  cariBentrok,
  jamWib,
  kalimatJam,
  kunciLangkah,
  nilaiJam,
  pasangIsi,
  peranRingkas,
  rencanaUrutJam,
  sebutFoto,
  slotBermasalah,
  tukarIsi,
  type IsiNomor,
} from "../sigapUrutanFoto";

// jam WIB hh.mm pada 20 Okt 2026 -> epoch ms (WIB = UTC+7)
const wib = (h: number, m: number, d = 0) => Date.UTC(2026, 9, 20, h - 7, m, d);
const isi = (...jam: ([number, number] | null)[]): IsiNomor[] =>
  jam.flatMap((j, i) => (j === null ? [] : [{ slot: i + 1, fotoId: 100 + i + 1, ms: wib(j[0], j[1]) }]));

describe("jamWib", () => {
  it("mengubah ke WIB dengan titik", () => {
    expect(jamWib(wib(13, 48))).toBe("13.48");
    expect(jamWib(wib(7, 5))).toBe("07.05");
  });
});

describe("cariBentrok: hanya soal urutan jam", () => {
  it("urutan jam benar -> tidak ada peringatan (kasus PPL Yola: 12.45 lalu 12.57)", () => {
    expect(cariBentrok(isi([12, 30], [12, 45], [12, 57], [13, 40], [14, 5]))).toEqual([]);
  });
  it("foto 4 (13.55) lebih akhir dari foto 5 (13.48) -> bentrok 4 dan 5", () => {
    const x = isi([12, 0], [12, 30], [13, 0], [13, 55], [13, 48]);
    expect(cariBentrok(x)).toEqual([{ kecil: 4, besar: 5 }]);
    expect([...slotBermasalah(cariBentrok(x))].sort()).toEqual([4, 5]);
  });
  it("jam yang sama (menit sama) tidak dianggap salah, walau detiknya berlawanan", () => {
    const x: IsiNomor[] = [
      { slot: 1, fotoId: 1, ms: wib(10, 0, 50) },
      { slot: 2, fotoId: 2, ms: wib(10, 0, 5) },
    ];
    expect(cariBentrok(x)).toEqual([]);
  });
  it("selisih satu menit pada urutan terbalik tetap bentrok", () => {
    expect(cariBentrok(isi([10, 1], [10, 0]))).toEqual([{ kecil: 1, besar: 2 }]);
  });
  it("unggahan manual (tanpa jam) dan nomor kosong tidak dinilai", () => {
    const x: IsiNomor[] = [
      { slot: 1, fotoId: 1, ms: wib(9, 0) },
      { slot: 2, fotoId: null, ms: null },
      { slot: 5, fotoId: 5, ms: wib(8, 0) },
    ];
    expect(cariBentrok(x)).toEqual([{ kecil: 1, besar: 5 }]);
    expect(cariBentrok([{ slot: 1, fotoId: null, ms: null }, { slot: 2, fotoId: 2, ms: wib(8, 0) }])).toEqual([]);
  });
  it("pasangan berdekatan didahulukan", () => {
    const b = cariBentrok(isi([13, 0], [12, 0], [11, 0]));
    expect(b[0]).toEqual({ kecil: 1, besar: 2 });
    expect(b).toHaveLength(3);
  });
});

describe("alasanBentrok", () => {
  it("satu kalimat per pasangan, memuat jam kedua foto", () => {
    const x = isi([12, 0], [12, 30], [13, 0], [13, 55], [13, 48]);
    expect(alasanBentrok(cariBentrok(x), x)).toEqual({ baris: ["Jam foto 4 (13.55) lebih akhir dari foto 5 (13.48)"], sisa: 0 });
  });
  it("paling banyak tiga baris, sisanya +N lagi", () => {
    const x = isi([14, 0], [13, 0], [12, 0], [11, 0], [10, 0]); // 10 pasangan
    const r = alasanBentrok(cariBentrok(x), x);
    expect(r.baris).toHaveLength(3);
    expect(r.sisa).toBe(7);
  });
});

describe("kalimatJam: akibat tukar terhadap aturan jam", () => {
  const sebelum = isi([12, 0], [12, 30], [13, 0], [13, 55], [13, 48]);
  it("tukar yang membetulkan -> urutan jam sesuai dan peringatan hilang", () => {
    const sesudah = tukarIsi(sebelum, 4, 5);
    expect(cariBentrok(sesudah)).toEqual([]);
    expect(kalimatJam(nilaiJam(sebelum), nilaiJam(sesudah), "ditukar")).toBe("Setelah ditukar, urutan jam sesuai dan peringatan ⚠ hilang.");
  });
  it("tukar yang masih menyisakan terbalik -> sebut fotonya", () => {
    const s = isi([12, 0], [12, 0], [13, 0], [13, 55], [13, 48]); // foto 1 dan 2 berjam sama
    const sesudah = tukarIsi(s, 1, 2); // 4 & 5 tetap terbalik
    expect(kalimatJam(nilaiJam(s), nilaiJam(sesudah), "ditukar")).toBe("Urutan jam masih terbalik pada foto 4 dan 5.");
  });
  it("tukar yang merusak urutan -> akan menjadi terbalik (tetap boleh)", () => {
    const s = isi([12, 0], [12, 30], [13, 0], [13, 10], [13, 20]);
    const sesudah = tukarIsi(s, 1, 5);
    expect(kalimatJam(nilaiJam(s), nilaiJam(sesudah), "ditukar")).toMatch(/^Urutan jam akan menjadi terbalik pada foto /);
  });
  it("sudah sesuai dan tetap sesuai", () => {
    const s = isi([12, 0], [12, 30]);
    expect(kalimatJam(nilaiJam(s), nilaiJam(tukarIsi(s, 1, 1)), "ditukar")).toBe("Setelah ditukar, urutan jam tetap sesuai.");
  });
  it("kurang dari dua foto berjam -> tidak ada kalimat", () => {
    const s: IsiNomor[] = [{ slot: 1, fotoId: 1, ms: wib(9, 0) }];
    expect(kalimatJam(nilaiJam(s), nilaiJam(s), "ditukar")).toBeNull();
  });
  it("tiga foto terlibat disebut dengan koma", () => {
    expect(sebutFoto([{ kecil: 1, besar: 2 }, { kecil: 1, besar: 3 }])).toBe("foto 1, 2, dan 3");
  });
});

describe("tukarIsi dan pasangIsi", () => {
  it("tukar dua nomor terisi", () => {
    const t = tukarIsi(isi([10, 0], [11, 0]), 1, 2);
    expect(t.find((x) => x.slot === 1)?.fotoId).toBe(102);
    expect(t.find((x) => x.slot === 2)?.fotoId).toBe(101);
  });
  it("tukar dengan nomor kosong = pindah", () => {
    const t = tukarIsi(isi([10, 0], null, [12, 0]), 1, 2);
    expect(t.map((x) => x.slot).sort()).toEqual([2, 3]);
  });
  it("pasang foto cadangan: foto lama keluar, tidak pernah dobel", () => {
    const t = pasangIsi(isi([10, 0], [11, 0]), 2, { fotoId: 900, ms: wib(10, 30) });
    expect(t).toHaveLength(2);
    expect(t.find((x) => x.slot === 2)?.fotoId).toBe(900);
    expect(t.some((x) => x.fotoId === 102)).toBe(false);
  });
});

describe("rencanaUrutJam", () => {
  it("sudah berurutan -> tidak ada langkah", () => {
    const r = rencanaUrutJam(isi([10, 0], [11, 0], [12, 0], [13, 0], [14, 0]));
    expect(r.langkah).toEqual([]);
    expect(r.berubah).toEqual([]);
  });
  it("urutan acak -> terurut terawal ke terakhir, tanpa bentrok tersisa", () => {
    const x = isi([13, 0], [10, 0], [14, 0], [11, 0], [12, 0]);
    const r = rencanaUrutJam(x);
    expect(r.akhir.map((a) => a.fotoId)).toEqual([102, 104, 105, 101, 103]);
    expect(cariBentrok(r.akhir)).toEqual([]);
    // menjalankan langkah satu per satu pada susunan awal menghasilkan susunan yang sama
    let cur = x;
    for (const [a, b] of r.langkah) cur = tukarIsi(cur, a, b);
    expect(cur.sort((p, q) => p.slot - q.slot).map((p) => p.fotoId)).toEqual(r.akhir.map((a) => a.fotoId));
    expect(r.langkah.length).toBeLessThanOrEqual(4);
  });
  it("jam sama (menit sama) mempertahankan urutan lama", () => {
    const x: IsiNomor[] = [
      { slot: 1, fotoId: 11, ms: wib(10, 5) },
      { slot: 2, fotoId: 12, ms: wib(10, 0, 40) },
      { slot: 3, fotoId: 13, ms: wib(10, 0, 10) },
    ];
    const r = rencanaUrutJam(x);
    expect(r.akhir.map((a) => a.fotoId)).toEqual([12, 13, 11]); // 12 dan 13 sama-sama 10.00 -> 12 tetap di depan 13
  });
  it("unggahan manual dan nomor kosong tidak bergeser", () => {
    const x: IsiNomor[] = [
      { slot: 1, fotoId: 11, ms: wib(12, 0) },
      { slot: 2, fotoId: null, ms: null },
      { slot: 3, fotoId: 13, ms: wib(9, 0) },
      { slot: 5, fotoId: 15, ms: wib(10, 0) },
    ];
    const r = rencanaUrutJam(x);
    expect(r.akhir.find((a) => a.slot === 2)?.fotoId).toBeNull();
    expect(r.akhir.filter((a) => a.fotoId !== null).map((a) => [a.slot, a.fotoId])).toEqual([[1, 13], [3, 15], [5, 11]]);
    expect(r.berubah.map((b) => b.slot)).toEqual([1, 3, 5]);
  });
  it("kunciLangkah stabil", () => {
    expect(kunciLangkah([[1, 3], [2, 4]])).toBe("1-3,2-4");
  });
});

describe("peranRingkas", () => {
  it("pendataan dan pelatihan", () => {
    expect(peranRingkas(null, 3)).toBe("Mendata");
    expect(peranRingkas("pelatihan", 3)).toBe("Pelatihan");
    expect(peranRingkas("pelatihan", 5)).toBe("Tiba di kediaman");
    expect(peranRingkas(null, 9)).toBe("Foto 9");
  });
});
