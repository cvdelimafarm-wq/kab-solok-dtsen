import { describe, expect, it } from "vitest";
import { bacaKegiatanSiaran, kegiatanDariAudit, tagSiaran } from "@/lib/siaranPetugas";

// (29 Okt 2026) Siaran per survei: fungsi murni penyaring kegiatan.
describe("bacaKegiatanSiaran", () => {
  it("kosong = Pascabencana (undefined)", () => {
    expect(bacaKegiatanSiaran(undefined)).toBeUndefined();
    expect(bacaKegiatanSiaran(null)).toBeUndefined();
    expect(bacaKegiatanSiaran("")).toBeUndefined();
  });
  it("bilangan bulat positif diterima, dari teks maupun angka", () => {
    expect(bacaKegiatanSiaran("2")).toBe(2);
    expect(bacaKegiatanSiaran(" 12 ")).toBe(12);
    expect(bacaKegiatanSiaran(7)).toBe(7);
  });
  it("tidak sah ditolak (null), tidak jatuh diam-diam ke Pascabencana", () => {
    for (const v of ["0", "-1", "1.5", "abc", "2abc", "99999999", 0, -3, 2.5, NaN, {}, []]) expect(bacaKegiatanSiaran(v)).toBeNull();
  });
});

describe("kegiatanDariAudit", () => {
  it("baris lama tanpa kegiatan = Pascabencana", () => {
    expect(kegiatanDariAudit({ judul: "x" }, 1)).toBe(1);
    expect(kegiatanDariAudit(null, 1)).toBe(1);
    expect(kegiatanDariAudit({ kegiatan: "abc" }, 1)).toBe(1);
  });
  it("membaca detail.kegiatan", () => {
    expect(kegiatanDariAudit({ kegiatan: 2 }, 1)).toBe(2);
    expect(kegiatanDariAudit({ kegiatan: "2" }, 1)).toBe(2);
    expect(kegiatanDariAudit({ kegiatan: 1 }, 1)).toBe(1);
  });
});

describe("tagSiaran", () => {
  it("Pascabencana tetap tag lama, survei lain diberi akhiran", () => {
    expect(tagSiaran("siaran-pendataan", 1, 1)).toBe("siaran-pendataan");
    expect(tagSiaran("siaran-pendataan", 2, 1)).toBe("siaran-pendataan-k2");
    expect(tagSiaran("siaran-pendataan-satu", 2, 1)).toBe("siaran-pendataan-satu-k2");
  });
});
