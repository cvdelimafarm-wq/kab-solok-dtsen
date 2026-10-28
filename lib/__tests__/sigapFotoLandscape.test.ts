import { describe, it, expect } from "vitest";
import { fotoWajibLandscape, fotoLandscape, perluMiringkanHp, fotoTertahanTegak, TEKS_LANDSCAPE } from "../sigapFotoLandscape";

describe("fotoWajibLandscape", () => {
  it("hanya nomor 3 pada pendataan", () => {
    expect(fotoWajibLandscape(3, "pendataan")).toBe(true);
    expect(fotoWajibLandscape(3, null)).toBe(true);
    expect(fotoWajibLandscape(3, undefined)).toBe(true);
    expect(fotoWajibLandscape(3, "lainnya")).toBe(true);
  });
  it("nomor lain tidak wajib", () => {
    for (const n of [1, 2, 4, 5]) expect(fotoWajibLandscape(n, "pendataan")).toBe(false);
    expect(fotoWajibLandscape(null, "pendataan")).toBe(false);
    expect(fotoWajibLandscape(undefined)).toBe(false);
  });
  it("pelatihan tidak dikenai aturan", () => {
    expect(fotoWajibLandscape(3, "pelatihan")).toBe(false);
  });
});

describe("fotoLandscape", () => {
  it("lebar >= tinggi = landscape", () => {
    expect(fotoLandscape(1920, 1080)).toBe(true);
    expect(fotoLandscape(1000, 1000)).toBe(true);
    expect(fotoLandscape(1080, 1920)).toBe(false);
  });
  it("ukuran tak valid tidak menahan", () => {
    expect(fotoLandscape(0, 0)).toBe(true);
    expect(fotoLandscape(NaN, 100)).toBe(true);
  });
});

describe("perluMiringkanHp", () => {
  const dasar = { nomor: 3, jenis: "pendataan", sensorAda: true, layarLebar: false };
  it("HP tegak atau terbalik pada foto 3 -> perlu", () => {
    expect(perluMiringkanHp({ ...dasar, arah: 0 })).toBe(true);
    expect(perluMiringkanHp({ ...dasar, arah: 2 })).toBe(true);
  });
  it("HP sudah miring ke kiri/kanan -> tidak perlu", () => {
    expect(perluMiringkanHp({ ...dasar, arah: 1 })).toBe(false);
    expect(perluMiringkanHp({ ...dasar, arah: -1 })).toBe(false);
  });
  it("layar sudah landscape -> tidak perlu", () => {
    expect(perluMiringkanHp({ ...dasar, layarLebar: true, arah: 0 })).toBe(false);
  });
  it("tanpa sensor -> tidak diblokir di kamera", () => {
    expect(perluMiringkanHp({ ...dasar, sensorAda: false, arah: 0 })).toBe(false);
  });
  it("nomor lain atau pelatihan -> tidak perlu", () => {
    expect(perluMiringkanHp({ ...dasar, nomor: 2, arah: 0 })).toBe(false);
    expect(perluMiringkanHp({ ...dasar, nomor: null, arah: 0 })).toBe(false);
    expect(perluMiringkanHp({ ...dasar, jenis: "pelatihan", arah: 0 })).toBe(false);
  });
});

describe("fotoTertahanTegak", () => {
  it("foto 3 tegak tertahan; landscape lolos", () => {
    expect(fotoTertahanTegak({ nomor: 3, jenis: "pendataan", lebar: 1080, tinggi: 1920 })).toBe(true);
    expect(fotoTertahanTegak({ nomor: 3, jenis: "pendataan", lebar: 1920, tinggi: 1080 })).toBe(false);
  });
  it("nomor lain / pelatihan / tanpa nomor tidak tertahan", () => {
    expect(fotoTertahanTegak({ nomor: 1, jenis: "pendataan", lebar: 1080, tinggi: 1920 })).toBe(false);
    expect(fotoTertahanTegak({ nomor: 3, jenis: "pelatihan", lebar: 1080, tinggi: 1920 })).toBe(false);
    expect(fotoTertahanTegak({ nomor: null, jenis: "pendataan", lebar: 1080, tinggi: 1920 })).toBe(false);
  });
});

describe("redaksi", () => {
  it("memuat nomor dan label", () => {
    expect(TEKS_LANDSCAPE.isiModal(3, "Saat mendata")).toBe("Foto 3 (Saat mendata) wajib landscape. Silakan miringkan HP ke kiri atau ke kanan.");
    expect(TEKS_LANDSCAPE.isiModal(3)).toBe("Foto 3 wajib landscape. Silakan miringkan HP ke kiri atau ke kanan.");
    expect(TEKS_LANDSCAPE.galatTegak(3)).toContain("Foto 3");
  });
});
