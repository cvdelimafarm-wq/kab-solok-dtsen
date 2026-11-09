import { describe, expect, it } from "vitest";
import { dokumentasiIdDariPath, pathSalinanKamera, sisaPilih, catatanLampiran, hariKurang, idDariLabel, jenisPengunggah, pilihTanggalBawaan, ringkasPerHari, tanggalEfektif, teksHari, totalDihitung, batasFotoKelas } from "@/lib/sigapFotoHari";

const hari = ["2026-11-09", "2026-11-10"];
const ins = new Set([7]);

describe("sigapFotoHari", () => {
  it("membaca id dari label", () => {
    expect(idDariLabel("Budi (#12)")).toBe(12);
    expect(idDariLabel("Budi")).toBeNull();
    expect(idDariLabel(null)).toBeNull();
  });
  it("membedakan panitia, instruktur, lain", () => {
    expect(jenisPengunggah("A (#7)", ins)).toBe("instruktur");
    expect(jenisPengunggah("B (#8)", ins)).toBe("panitia");
    expect(jenisPengunggah("tanpa id", ins)).toBe("lain");
  });
  it("foto lama tanpa tanggal masuk hari pertama", () => {
    expect(tanggalEfektif(null, hari)).toBe("2026-11-09");
    expect(tanggalEfektif("2026-11-10", hari)).toBe("2026-11-10");
    expect(tanggalEfektif(null, [])).toBeNull();
  });
  it("meringkas per hari dengan rincian pengunggah", () => {
    const r = ringkasPerHari(hari, [
      { tanggal: null, dibuat_oleh: "B (#8)" },
      { tanggal: "2026-11-09", dibuat_oleh: "A (#7)" },
      { tanggal: "2026-11-09", dibuat_oleh: "B (#8)" },
      { tanggal: "2026-11-10", dibuat_oleh: "A (#7)" },
      { tanggal: "2026-12-01", dibuat_oleh: "A (#7)" },
    ], ins);
    expect(r[0]).toMatchObject({ jumlah: 3, panitia: 2, instruktur: 1, kurang: 1 });
    expect(r[1]).toMatchObject({ jumlah: 1, kurang: 3 });
    expect(teksHari(r[0], 1)).toBe("Hari 1 (9 Nov): 3/4 — 2 panitia, 1 instruktur");
    expect(hariKurang(r)).toHaveLength(2);
  });
  it("lebih dari 4 tidak negatif dan tidak menambah total dihitung", () => {
    const f = Array.from({ length: 6 }, () => ({ tanggal: "2026-11-09", dibuat_oleh: "B (#8)" }));
    const r = ringkasPerHari(hari, f, ins);
    expect(r[0].kurang).toBe(0);
    expect(totalDihitung(r)).toBe(4);
  });
  it("catatan lampiran hanya bila kurang", () => {
    const f = Array.from({ length: 4 }, () => ({ tanggal: "2026-11-09", dibuat_oleh: null }));
    expect(catatanLampiran(ringkasPerHari(["2026-11-09"], f, ins))).toBeNull();
    expect(catatanLampiran(ringkasPerHari(hari, f, ins))).toContain("10 Nov kurang 4");
  });
  it("batas dan tanggal bawaan", () => {
    expect(batasFotoKelas(2)).toBe(8);
    expect(batasFotoKelas(0)).toBe(4);
    expect(pilihTanggalBawaan(hari, "2026-11-10")).toBe("2026-11-10");
    expect(pilihTanggalBawaan(hari, "2026-11-20")).toBe("2026-11-09");
    expect(pilihTanggalBawaan([], "2026-11-10")).toBeNull();
  });
  it("jejak foto Kamera pada nama berkas", () => {
    const p = pathSalinanKamera(7, 1, 345, "abc123");
    expect(p).toBe("pelatihan-laporan/7/1/dok345_abc123.jpg");
    expect(dokumentasiIdDariPath(p)).toBe(345);
    expect(pathSalinanKamera(7, 1, 345, "abc", "dok/x/1.PNG")).toBe("pelatihan-laporan/7/1/dok345_abc.png");
    expect(dokumentasiIdDariPath("pelatihan-laporan/7/1/1794_x.jpg")).toBeNull();
    expect(dokumentasiIdDariPath(null)).toBeNull();
  });
  it("sisa pilih mengikuti 4 per hari dan batas kelas", () => {
    expect(sisaPilih(1, 1, 1)).toBe(3);
    expect(sisaPilih(4, 4, 1)).toBe(0);
    expect(sisaPilih(2, 8, 2)).toBe(0);
    expect(sisaPilih(0, 4, 2)).toBe(4);
  });
});
