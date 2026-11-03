// Menguji lib/ringkasanPengelola.ts: ringkasan tab Hari ini untuk akun yang bukan peserta (instruktur / panitia).
import { describe, expect, it } from "vitest";
import { SAPAAN_PENGELOLA, catatanPerhatian, persen, type RingkasanMon } from "../ringkasanPengelola";

const dasar: RingkasanMon = { total: 40, undangan_terima: 30, undangan_tolak: 0, pretest_selesai: 0, posttest_selesai: 0, hadir: 0 };

describe("catatan perhatian", () => {
  it("semua lancar = kosong", () => {
    expect(catatanPerhatian(dasar)).toEqual([]);
    expect(catatanPerhatian({ ...dasar, materi_wajib: 2, materi_belum: 0, terkunci: 0, izin_menunggu: 0 })).toEqual([]);
  });
  it("permintaan buka kunci didahulukan, lalu terkunci, tolak undangan, materi", () => {
    const c = catatanPerhatian({ ...dasar, izin_menunggu: 2, terkunci: 5, undangan_tolak: 1, materi_wajib: 1, materi_belum: 3 });
    expect(c.map((x) => x.teks)).toEqual([
      "2 permintaan buka kunci menunggu keputusan.",
      "5 orang terkunci menunggu tahapan sebelumnya.",
      "1 orang menolak undangan.",
      "3 orang belum menuntaskan materi wajib.",
    ]);
    expect(c[2].nada).toBe("bad");
  });
  it("materi belum tuntas tidak dicatat bila pelatihan tidak punya materi wajib", () => {
    expect(catatanPerhatian({ ...dasar, materi_wajib: 0, materi_belum: 4 })).toEqual([]);
  });
});

describe("persen dan sapaan", () => {
  it("persen dibulatkan, dibatasi 0-100, total 0 aman", () => {
    expect(persen(1, 3)).toBe(33);
    expect(persen(5, 4)).toBe(100);
    expect(persen(0, 0)).toBe(0);
  });
  it("sapaan menyebut peran", () => {
    expect(SAPAAN_PENGELOLA.instruktur.judul).toContain("instruktur");
    expect(SAPAAN_PENGELOLA.panitia.ket).toContain("seluruh peserta");
  });
});
