import { describe, expect, it } from "vitest";
import { ambilLaporan, kembalikan, pelacakBaru, tikPelacak } from "../pelacakVideo";

const jalan = (p = pelacakBaru(), dari = 0, sampai = 5) => {
  for (let t = dari; t <= sampai; t++) p = tikPelacak(p, t, true, true, 1);
  return p;
};

describe("tikPelacak", () => {
  it("memutar terus: satu bagian terbuka, belum ada yang ditutup", () => {
    const p = jalan(pelacakBaru(), 0, 5);
    expect(p).toEqual({ mulai: 0, terakhir: 5, tunda: [] });
  });
  it("jeda menutup bagian", () => {
    const p = tikPelacak(jalan(pelacakBaru(), 0, 5), 5, false, true, 1);
    expect(p).toEqual({ mulai: null, terakhir: null, tunda: [[0, 5]] });
  });
  it("tab disembunyikan menutup bagian; bagian < 1 detik dibuang", () => {
    const p = tikPelacak(tikPelacak(pelacakBaru(), 10, true, true, 1), 10.4, true, false, 1);
    expect(p.tunda).toEqual([]);
    const q = tikPelacak(jalan(pelacakBaru(), 0, 3), 3, true, false, 1);
    expect(q.tunda).toEqual([[0, 3]]);
  });
  it("kecepatan di atas 1,25x tidak dihitung; 1,25x dihitung", () => {
    expect(tikPelacak(pelacakBaru(), 5, true, true, 1.5).mulai).toBeNull();
    expect(tikPelacak(pelacakBaru(), 5, true, true, 2).mulai).toBeNull();
    expect(tikPelacak(pelacakBaru(), 5, true, true, 1.25).mulai).toBe(5);
  });
  it("lompat maju (geser ke akhir) menutup bagian lama dan tidak menghitung lompatannya", () => {
    let p = jalan(pelacakBaru(), 0, 4);
    p = tikPelacak(p, 80, true, true, 1);
    expect(p.tunda).toEqual([[0, 4]]);
    expect(p).toMatchObject({ mulai: 80, terakhir: 80 });
  });
  it("mundur (putar ulang) memulai bagian baru", () => {
    let p = jalan(pelacakBaru(), 10, 15);
    p = tikPelacak(p, 3, true, true, 1);
    expect(p.tunda).toEqual([[10, 15]]);
    expect(p.mulai).toBe(3);
  });
  it("posisi tidak sah menutup bagian", () => {
    expect(tikPelacak(jalan(pelacakBaru(), 0, 5), NaN, true, true, 1).mulai).toBeNull();
    expect(tikPelacak(jalan(pelacakBaru(), 0, 5), -1, true, true, 1).mulai).toBeNull();
  });
  it("tidak mengubah masukan", () => {
    const p = jalan(pelacakBaru(), 0, 5);
    const salin = JSON.stringify(p);
    tikPelacak(p, 6, false, true, 1);
    expect(JSON.stringify(p)).toBe(salin);
  });
});

describe("ambilLaporan", () => {
  it("bagian terbuka dikirim sampai posisi terakhir lalu awalnya dimajukan", () => {
    const { kirim, sisa } = ambilLaporan(jalan(pelacakBaru(), 0, 5));
    expect(kirim).toEqual([[0, 5]]);
    expect(sisa).toMatchObject({ mulai: 5, terakhir: 5 });
    // tik berikutnya melanjutkan tanpa celah dan tanpa menghitung dobel
    const lanjut = jalan(sisa, 6, 10);
    expect(ambilLaporan(lanjut).kirim).toEqual([[5, 10]]);
  });
  it("tidak ada yang layak dikirim: kosong", () => {
    expect(ambilLaporan(pelacakBaru()).kirim).toEqual([]);
    expect(ambilLaporan(tikPelacak(pelacakBaru(), 5, true, true, 1)).kirim).toEqual([]);
  });
  it("paksaTutup menutup bagian terbuka", () => {
    const { kirim, sisa } = ambilLaporan(jalan(pelacakBaru(), 0, 5), true);
    expect(kirim).toEqual([[0, 5]]);
    expect(sisa).toEqual({ mulai: null, terakhir: null, tunda: [] });
  });
  it("paling banyak 6 bagian per kirim, sisanya menunggu", () => {
    let p = pelacakBaru();
    for (let i = 0; i < 9; i++) p = tikPelacak(tikPelacak(tikPelacak(p, i * 10, true, true, 1), i * 10 + 2, true, true, 1), i * 10 + 2, false, true, 1);
    const a = ambilLaporan(p);
    expect(a.kirim).toHaveLength(6);
    expect(a.sisa.tunda).toHaveLength(3);
    expect(ambilLaporan(a.sisa).kirim).toHaveLength(3);
  });
  it("kembalikan: kirim gagal -> bagian kembali ke depan antrean, antrean dibatasi", () => {
    const sisa = kembalikan({ mulai: null, terakhir: null, tunda: [[20, 25]] }, [[0, 5]]);
    expect(sisa.tunda).toEqual([[0, 5], [20, 25]]);
    const banyak = kembalikan(pelacakBaru(), Array.from({ length: 100 }, (_, i) => [i, i + 2] as [number, number]), 60);
    expect(banyak.tunda).toHaveLength(60);
  });
});
