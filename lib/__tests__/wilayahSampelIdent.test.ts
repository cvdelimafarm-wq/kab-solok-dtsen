import { describe, expect, it } from "vitest";
import { judulWilayah, pilihKegiatanPendataan, ringkasNagari, samaDenganAlokasi, teksSuratAman, teksSuratNagari } from "../wilayahSampelIdent";

describe("judulWilayah", () => {
  it("huruf besar jadi judul, angka Romawi tetap", () => {
    expect(judulWilayah("KUBUNG")).toBe("Kubung");
    expect(judulWilayah("X KOTO DIATAS")).toBe("X Koto Diatas");
    expect(judulWilayah("IX KOTO SUNGAI LASI")).toBe("IX Koto Sungai Lasi");
    expect(judulWilayah("  bukit   kanduang ")).toBe("Bukit Kanduang");
  });
});

describe("ringkasNagari", () => {
  const w = [
    { kecamatan: "KUBUNG", nagari: "SELAYO", target: 10 },
    { kecamatan: "KUBUNG", nagari: "SELAYO", target: 8 },
    { kecamatan: "X KOTO DIATAS", nagari: "PASILIHAN", target: 10 },
    { kecamatan: "", nagari: "", target: 10 },
  ];
  it("satu baris per nagari, jumlahkan sub SLS dan target, hitung yang tanpa master", () => {
    const r = ringkasNagari(w);
    expect(r.nagari).toEqual([
      { kecamatan: "Kubung", nagari: "Selayo", sub_sls: 2, target: 18 },
      { kecamatan: "X Koto Diatas", nagari: "Pasilihan", sub_sls: 1, target: 10 },
    ]);
    expect(r.tanpa_master).toBe(1);
  });
  it("nagari kembar beda kecamatan tidak digabung", () => {
    const r = ringkasNagari([{ kecamatan: "A", nagari: "KOTO", target: 1 }, { kecamatan: "B", nagari: "KOTO", target: 1 }]);
    expect(r.nagari).toHaveLength(2);
  });
});

describe("teks surat", () => {
  const n = [{ kecamatan: "Kubung", nagari: "Selayo" }, { kecamatan: "Gunung Talang", nagari: "Batang Barus" }];
  it("satu nagari per baris", () => {
    expect(teksSuratNagari(n)).toBe("Nagari Selayo, Kecamatan Kubung\nNagari Batang Barus, Kecamatan Gunung Talang");
  });
  it("dipotong di batas baris bila melebihi 2000 huruf", () => {
    const banyak = Array.from({ length: 200 }, (_, i) => ({ kecamatan: "Kecamatan Panjang Sekali", nagari: `Nagari Nomor ${i}` }));
    const r = teksSuratAman(banyak);
    expect(r.teks.length).toBeLessThanOrEqual(2000);
    expect(r.terpotong).toBeGreaterThan(0);
    expect(r.teks.split("\n").every((b) => b.startsWith("Nagari "))).toBe(true);
  });
  it("tanpa nagari menghasilkan teks kosong", () => {
    expect(teksSuratAman([])).toEqual({ teks: "", terpotong: 0 });
  });
});

describe("samaDenganAlokasi", () => {
  it("abaikan urutan dan spasi", () => {
    expect(samaDenganAlokasi("b \na\n", "a\nb")).toBe(true);
    expect(samaDenganAlokasi("a", "a\nb")).toBe(false);
    expect(samaDenganAlokasi("", "")).toBe(true);
  });
});

describe("pilihKegiatanPendataan", () => {
  const jenis = new Map([[6, { jenis: "pendataan", nama: "Seruti" }], [7, { jenis: "pelatihan", nama: "Pelatihan" }], [1, { jenis: "pendataan", nama: "Lain" }]]);
  it("tertaut ke pelatihan -> ambil pendataan satu induk", () => {
    expect(pilihKegiatanPendataan([7], [{ kegiatan_ids: ["6", "7"] }, { kegiatan_ids: ["1", "3"] }], jenis)).toEqual([{ id: 6, nama: "Seruti" }]);
  });
  it("tertaut langsung ke pendataan tanpa induk", () => {
    expect(pilihKegiatanPendataan([1], [], jenis)).toEqual([{ id: 1, nama: "Lain" }]);
  });
  it("hanya pelatihan tanpa induk -> kosong", () => {
    expect(pilihKegiatanPendataan([7], [], jenis)).toEqual([]);
  });
});
