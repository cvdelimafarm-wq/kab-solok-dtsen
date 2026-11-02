import { describe, expect, it } from "vitest";
import { gabungPenerimaIzin, pesanIzinDibuka, pesanIzinDiminta, pesanIzinDiputuskan, URL_PENGELOLA, URL_PESERTA } from "../sigapIzinPesan";

describe("pesan izin buka kunci", () => {
  it("diminta: nama depan, tahap, alasan; mengarah ke Hari ini", () => {
    const p = pesanIzinDiminta("Ani Lestari, S.Si", "posttest", "Kendala   HP / sinyal", 9);
    expect(p.judul).toBe("Permintaan buka kunci Posttest");
    expect(p.isi).toBe("Ani Lestari meminta Posttest dibuka. Alasan: Kendala HP / sinyal");
    expect(p.url).toBe(URL_PENGELOLA);
    expect(p.tag).toBe("izin-minta-9");
  });
  it("diputuskan: setuju menyebut batas 23.59 WIB, tolak menyarankan langkah berikutnya", () => {
    const ya = pesanIzinDiputuskan(true, "pretest", "Budi, M.Si", 3);
    expect(ya.judul).toBe("Pretest dibuka");
    expect(ya.isi).toContain("23.59 WIB");
    expect(ya.isi).toContain("Budi menyetujui");
    expect(ya.url).toBe(URL_PESERTA);
    const tidak = pesanIzinDiputuskan(false, "pretest", "Budi", 3);
    expect(tidak.judul).toBe("Permintaan Pretest ditolak");
    expect(tidak.isi).toContain("hubungi panitia/instruktur");
  });
  it("dibuka langsung: tag per peserta dan tahap", () => {
    const p = pesanIzinDibuka("posttest", "Citra", 12);
    expect(p.judul).toBe("Posttest dibuka untuk Anda");
    expect(p.tag).toBe("izin-buka-12-posttest");
  });
  it("batas panjang judul 80 dan isi 240 dipatuhi walau alasan sangat panjang", () => {
    const p = pesanIzinDiminta("X".repeat(300), "pretest", "a".repeat(500));
    expect(p.judul.length).toBeLessThanOrEqual(80);
    expect(p.isi.length).toBeLessThanOrEqual(240);
    expect(p.isi.endsWith("…")).toBe(true);
  });
  it("tahap tak dikenal dan nama kosong tidak membuat pesan rusak", () => {
    const p = pesanIzinDiminta("", "entah", "alasan");
    expect(p.judul).toContain("tahapan");
    expect(p.isi.startsWith("Peserta meminta")).toBe(true);
  });
});

describe("gabungPenerimaIzin", () => {
  it("unik, valid, tanpa pelaku, terurut", () => {
    expect(gabungPenerimaIzin([[3, 1, 3, null], [2, undefined, 0, -4, 1.5], [5]], 5)).toEqual([1, 2, 3]);
    expect(gabungPenerimaIzin([], null)).toEqual([]);
  });
});
