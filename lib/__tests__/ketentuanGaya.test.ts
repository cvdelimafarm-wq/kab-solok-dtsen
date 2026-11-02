// Gaya teks pada butir ketentuan pelatihan: tebal, miring, garis bawah, sorot (penanda sederhana, tanpa HTML).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MAKS_PANJANG_BUTIR, butirBergaya, terapkanGaya } from "../ketentuanPelatihan";
import { uraiSebaris } from "../sigapPengumuman";

const baca = (rel: string) => fs.readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

describe("pengurai: garis bawah", () => {
  it("++teks++ menjadi potongan garis, penanda lain tetap bekerja", () => {
    expect(uraiSebaris("PPL ++WAJIB++ **hadir** __tepat__ ==waktu==")).toEqual([
      { t: "teks", teks: "PPL " },
      { t: "garis", teks: "WAJIB" },
      { t: "teks", teks: " " },
      { t: "tebal", teks: "hadir" },
      { t: "teks", teks: " " },
      { t: "miring", teks: "tepat" },
      { t: "teks", teks: " " },
      { t: "sorot", teks: "waktu" },
    ]);
  });
  it("teks lama tanpa penanda tidak berubah; tautan tetap dikenali", () => {
    expect(uraiSebaris("biasa saja")).toEqual([{ t: "teks", teks: "biasa saja" }]);
    expect(uraiSebaris("[buka](https://contoh.id)")).toEqual([{ t: "tautan", teks: "buka", url: "https://contoh.id" }]);
  });
});

describe("terapkanGaya", () => {
  const T = "PPL WAJIB melakukan pendataan";
  it("membungkus pilihan dan mengembalikan pilihan ke teks di dalam penanda", () => {
    const h = terapkanGaya(T, 4, 9, "tebal");
    expect(h.teks).toBe("PPL **WAJIB** melakukan pendataan");
    expect(h.teks.slice(h.awal, h.akhir)).toBe("WAJIB");
  });
  it("keempat gaya memakai penanda masing-masing", () => {
    expect(terapkanGaya(T, 4, 9, "miring").teks).toContain("__WAJIB__");
    expect(terapkanGaya(T, 4, 9, "garis").teks).toContain("++WAJIB++");
    expect(terapkanGaya(T, 4, 9, "sorot").teks).toContain("==WAJIB==");
  });
  it("spasi di tepi pilihan tidak ikut bergaya", () => {
    const h = terapkanGaya(T, 3, 10, "garis");
    expect(h.teks).toBe("PPL ++WAJIB++ melakukan pendataan");
  });
  it("pilihan terbalik (kanan ke kiri) sama dengan biasa", () => {
    expect(terapkanGaya(T, 9, 4, "tebal").teks).toBe("PPL **WAJIB** melakukan pendataan");
  });
  it("klik lagi mencabut: penanda tepat di luar pilihan atau di dalam pilihan", () => {
    const bergaya = "PPL **WAJIB** melakukan pendataan";
    const luar = terapkanGaya(bergaya, 6, 11, "tebal");
    expect(luar.teks).toBe(T);
    expect(luar.teks.slice(luar.awal, luar.akhir)).toBe("WAJIB");
    const dalam = terapkanGaya(bergaya, 4, 13, "tebal");
    expect(dalam.teks).toBe(T);
  });
  it("tanpa pilihan menyisipkan kata contoh yang terpilih", () => {
    const h = terapkanGaya("Hadir", 5, 5, "sorot");
    expect(h.teks).toBe("Hadir==teks==");
    expect(h.teks.slice(h.awal, h.akhir)).toBe("teks");
  });
  it("gaya lain di dalam pilihan ditolak (tidak bersarang) dan teks tidak berubah", () => {
    const t = "PPL **WAJIB** hadir";
    const h = terapkanGaya(t, 4, 13, "garis");
    expect(h.pesan).toContain("satu gaya");
    expect(h.teks).toBe(t);
    const h2 = terapkanGaya(t, 0, t.length, "miring");
    expect(h2.pesan).toBeTruthy();
  });
  it("melebihi batas panjang ditolak", () => {
    const panjang = "a".repeat(MAKS_PANJANG_BUTIR);
    const h = terapkanGaya(panjang, 0, 5, "tebal");
    expect(h.pesan).toContain("terlalu panjang");
    expect(h.teks).toBe(panjang);
  });
  it("butirBergaya mengenali keempat penanda", () => {
    for (const t of ["**a**", "__a__", "++a++", "==a=="]) expect(butirBergaya(`x ${t} y`)).toBe(true);
    expect(butirBergaya("tanpa penanda")).toBe(false);
  });
});

describe("pemasangan di layar", () => {
  it("modal ketentuan peserta memakai TeksBaris (bukan teks mentah)", () => {
    const h = baca("app/sigap/pelatihan/hari-ini/page.tsx");
    expect(h).toMatch(/<TeksBaris teks=\{b\} \/>/);
    expect(h).not.toMatch(/<li key=\{i\}>\{b\}<\/li>/);
  });
  it("editor butir punya toolbar gaya, pintasan Ctrl+B/I/U, dan pratinjau", () => {
    const t = baca("app/sigap/pelatihan/kelola/tampilan.tsx");
    expect(t).toMatch(/role="toolbar" aria-label="Gaya teks butir"/);
    expect(t).toMatch(/\["tebal", "miring", "garis", "sorot"\]/);
    expect(t).toMatch(/e\.key === "u"/);
    expect(t).toMatch(/Tampil bagi peserta/);
  });
  it("Potongan menampilkan garis bawah dengan elemen u", () => {
    expect(baca("app/sigap/pelatihan/pengumumanUi.tsx")).toMatch(/case "garis":\s+return <u>/);
  });
});
