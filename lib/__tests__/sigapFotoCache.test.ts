import { describe, expect, it } from "vitest";
import { BATAS_AWAL, BATAS_MAKS, batasDaftar, galatSinyal, jalurFotoSaya, potongDaftar, teksProgresKirim, umurTeks } from "../sigapFotoCache";

describe("batasDaftar (server)", () => {
  it("tanpa parameter atau tidak sah -> batas lama (100), aman untuk klien lama", () => {
    expect(batasDaftar(null)).toBe(BATAS_MAKS);
    expect(batasDaftar(undefined)).toBe(BATAS_MAKS);
    expect(batasDaftar("")).toBe(BATAS_MAKS);
    expect(batasDaftar("abc")).toBe(BATAS_MAKS);
    expect(batasDaftar("-5")).toBe(BATAS_MAKS);
    expect(batasDaftar("2.5")).toBe(BATAS_MAKS);
    expect(batasDaftar("0")).toBe(BATAS_MAKS);
  });
  it("nilai sah dipakai, dibatasi paling banyak 100", () => {
    expect(batasDaftar("30")).toBe(30);
    expect(batasDaftar("1")).toBe(1);
    expect(batasDaftar("100")).toBe(100);
    expect(batasDaftar("5000")).toBe(BATAS_MAKS);
  });
});

describe("potongDaftar", () => {
  it("kelebihan satu baris -> adaLagi", () => {
    const r = potongDaftar([1, 2, 3, 4], 3);
    expect(r.daftar).toEqual([1, 2, 3]);
    expect(r.adaLagi).toBe(true);
  });
  it("tepat atau kurang dari batas -> tidak ada lagi", () => {
    expect(potongDaftar([1, 2, 3], 3)).toEqual({ daftar: [1, 2, 3], adaLagi: false });
    expect(potongDaftar([], 3)).toEqual({ daftar: [], adaLagi: false });
    expect(potongDaftar(null, 3)).toEqual({ daftar: [], adaLagi: false });
  });
});

describe("jalurFotoSaya", () => {
  it("dua kunci berbeda", () => {
    expect(jalurFotoSaya(false)).toBe(`/api/sigap/foto?batas=${BATAS_AWAL}`);
    expect(jalurFotoSaya(true)).toBe(`/api/sigap/foto?batas=${BATAS_MAKS}`);
    expect(jalurFotoSaya(false)).not.toBe(jalurFotoSaya(true));
  });
});

describe("galatSinyal", () => {
  it("offline pasti sinyal", () => {
    expect(galatSinyal("apa saja", false)).toBe(true);
    expect(galatSinyal(null, false)).toBe(true);
  });
  it("pesan gagal sambung dikenali", () => {
    expect(galatSinyal("Failed to fetch", true)).toBe(true);
    expect(galatSinyal("Load failed")).toBe(true);
    expect(galatSinyal("NetworkError when attempting to fetch resource.")).toBe(true);
    expect(galatSinyal("Tidak ada sambungan.")).toBe(true);
  });
  it("penolakan server bukan sinyal", () => {
    expect(galatSinyal("Gagal (500)", true)).toBe(false);
    expect(galatSinyal("Anda tidak berhak melihat foto ini.", true)).toBe(false);
    expect(galatSinyal(null, true)).toBe(false);
    expect(galatSinyal(undefined)).toBe(false);
  });
});

describe("umurTeks", () => {
  const t = 1_800_000_000_000;
  it("rentang waktu", () => {
    expect(umurTeks(t, t + 20_000)).toBe("baru saja");
    expect(umurTeks(t, t + 5 * 60_000)).toBe("5 menit lalu");
    expect(umurTeks(t, t + 3 * 3_600_000 + 100)).toBe("3 jam lalu");
    expect(umurTeks(t, t + 2 * 86_400_000)).toBe("2 hari lalu");
  });
  it("tidak sah atau mundur", () => {
    expect(umurTeks(0, t)).toBe("belum pernah");
    expect(umurTeks(NaN, t)).toBe("belum pernah");
    expect(umurTeks(t + 10_000, t)).toBe("baru saja");
  });
});

describe("teksProgresKirim", () => {
  it("tanpa data kemajuan", () => {
    expect(teksProgresKirim(null)).toBe("Mengirim…");
    expect(teksProgresKirim(NaN)).toBe("Mengirim…");
  });
  it("persen dibulatkan ke bawah dan tidak pernah 100% sebelum selesai", () => {
    expect(teksProgresKirim(0)).toBe("Mengunggah 0%…");
    expect(teksProgresKirim(0.456)).toBe("Mengunggah 45%…");
    expect(teksProgresKirim(0.999)).toBe("Mengunggah 99%…");
    expect(teksProgresKirim(-1)).toBe("Mengunggah 0%…");
  });
  it("semua byte sampai -> server memproses", () => {
    expect(teksProgresKirim(1)).toBe("Memproses di server…");
    expect(teksProgresKirim(1.2)).toBe("Memproses di server…");
  });
});
