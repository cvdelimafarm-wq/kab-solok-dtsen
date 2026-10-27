import { describe, expect, it } from "vitest";
import {
  CONTOH_STRUKTUR,
  bacaKuesioner,
  bacaNilai,
  diperiksaBawaan,
  hitungStruktur,
  kategoriPetugas,
  pecahJudulAspek,
  periksaJawaban,
  tanggalLembarValid,
  tulisLembar,
  type StrukturKuesioner,
} from "../sigapQcKuesioner";
import berkas from "./fixtures/kuesionerQcKorwil.json";

const nyata = () => bacaKuesioner(berkas.kuesioner, berkas.kriteria);

describe("pecahJudulAspek / bacaNilai", () => {
  it("memisahkan judul dan 'untuk'", () => {
    expect(pecahJudulAspek("Identifikasi SLS  (untuk: PML)")).toEqual({ judul: "Identifikasi SLS", untuk: "PML", peran: ["pml"] });
    expect(pecahJudulAspek("Pemahaman keluarga terdampak (R4)  (untuk: PPL keluarga)")).toMatchObject({ judul: "Pemahaman keluarga terdampak (R4)", peran: ["ppl"] });
    expect(pecahJudulAspek("SOP, progres, dan etika  (untuk: PML & PPL)").peran).toEqual(["pml", "ppl"]);
    expect(pecahJudulAspek("Tanpa untuk").peran).toEqual(["pml", "ppl"]);
  });
  it("membaca pasangan teks = nilai", () => {
    expect(bacaNilai("Semua = 1; Sebagian belum = 2; Belum = 3")).toEqual([{ teks: "Semua", nilai: 1 }, { teks: "Sebagian belum", nilai: 2 }, { teks: "Belum", nilai: 3 }]);
    expect(bacaNilai("0 = 1; 1 = 2; 2 atau lebih = 3").map((x) => x.nilai)).toEqual([1, 2, 3]);
    expect(bacaNilai("tanpa pasangan")).toEqual([]);
  });
});

describe("bacaKuesioner: berkas nyata Kuesioner QC Korwil PSP", () => {
  it("terbaca tanpa galat: 12 aspek, 44 pertanyaan", () => {
    const r = nyata();
    expect(r.galat).toEqual([]);
    expect(r.struktur.aspek.map((a) => a.kode)).toEqual(Array.from({ length: 12 }, (_, i) => `QC-${i + 1}`));
    expect(hitungStruktur(r.struktur)).toEqual({ aspek: 12, soal: 44 });
  });
  it("aspek: judul, untuk, kriteria", () => {
    const [a1, , , , , , , , a9, a10] = nyata().struktur.aspek;
    expect(a1).toMatchObject({ judul: "Identifikasi SLS", peran: ["pml"] });
    expect(a1.kriteria[0]).toContain("Semua SLS teridentifikasi");
    expect(a9.peran).toEqual(["ppl"]);
    expect(a10.peran).toEqual(["pml"]);
  });
  it("pertanyaan O dengan nilai dari baris Nilai, T dengan kunci", () => {
    const a = nyata().struktur.aspek;
    const q11 = a[0].soal[0];
    expect(q11).toMatchObject({ no: "1.1", jenis: "O" });
    expect(q11.opsi).toEqual([{ teks: "Semua", nilai: 1 }, { teks: "Sebagian belum", nilai: 2 }, { teks: "Belum", nilai: 3 }]);
    const q12 = a[0].soal[1];
    expect(q12.jenis).toBe("T");
    expect(q12.opsi.map((o) => o.nilai)).toEqual([1, 2, 3]);
    expect(q12.kunci).toContain("Terdampak");
    const q31 = a[2].soal[0];
    expect(q31.opsi.map((o) => o.teks)).toEqual(["Ya", "Sebagian menumpuk/di luar SLS", "Tidak"]);
    const q93 = a[8].soal[2];
    expect(q93.opsi).toEqual([{ teks: "Ya", nilai: 1 }, { teks: "Tidak ada kasus khusus", nilai: 1 }, { teks: "Tidak", nilai: 2 }]);
    expect(a[1].soal.filter((s) => s.jenis === "N")).toHaveLength(4);
  });
});

describe("bacaKuesioner: galat", () => {
  const dasar = () => ({ k: berkas.kuesioner.map((r) => [...r]), r: berkas.kriteria.map((x) => [...x]) });
  it("judul kolom tidak ada", () => {
    expect(bacaKuesioner([["a", "b"]], []).galat[0].pesan).toContain("judul kolom");
  });
  it("lembar kriteria hilang", () => {
    const g = bacaKuesioner(berkas.kuesioner, null).galat;
    expect(g.some((x) => x.lembar === "Kriteria Penilaian")).toBe(true);
  });
  it("pilihan tanpa nilai dan jenis salah", () => {
    const { k, r } = dasar();
    const iNilai = r.findIndex((x) => String(x[1]).startsWith("Nilai 1.1:"));
    r.splice(iNilai, 1);
    const iJenis = k.findIndex((x) => x[0] === "1.3");
    k[iJenis][1] = "X";
    const g = bacaKuesioner(k, r).galat;
    expect(g.some((x) => x.pesan.includes("1.1") && x.pesan.includes("belum ada nilainya"))).toBe(true);
    expect(g.some((x) => x.pesan.includes("1.3") && x.pesan.includes("jenis"))).toBe(true);
  });
  it("nomor ganda, di luar aspek, pilihan kurang", () => {
    const g = bacaKuesioner(
      [["No", "Jenis", "Pertanyaan", "Pilihan jawaban"], ["9.1", "T", "Di luar aspek", "Benar / Salah"], ["QC-1", "", "A  (untuk: PML)", ""], ["1.1", "T", "Satu pilihan", "Benar"], ["1.2", "T", "Dobel A", "Benar / Kurang tepat / Salah"], ["1.2", "T", "Dobel B", "Benar / Kurang tepat / Salah"]],
      [["QC-1", "A", "x", "y", "z", "PML"]],
    ).galat.map((x) => x.pesan);
    expect(g.some((p) => p.includes("di luar aspek"))).toBe(true);
    expect(g.some((p) => p.includes("minimal 2"))).toBe(true);
    expect(g.some((p) => p.includes("dua kali"))).toBe(true);
  });
  it("aspek tanpa pertanyaan bernilai", () => {
    const g = bacaKuesioner([["No", "Jenis", "Pertanyaan", "Pilihan jawaban"], ["QC-1", "", "A (untuk: PML)", ""], ["1.1", "N", "Jumlah", "Isi angka"]], [["QC-1", "A"]]).galat;
    expect(g.some((x) => x.pesan.includes("tidak punya pertanyaan bernilai"))).toBe(true);
  });
});

describe("tulisLembar: bolak-balik", () => {
  it("contoh templat terbaca kembali sama persis", () => {
    const l = tulisLembar(CONTOH_STRUKTUR);
    const r = bacaKuesioner(l.kuesioner, l.kriteria);
    expect(r.galat).toEqual([]);
    expect(r.struktur).toEqual(CONTOH_STRUKTUR);
  });
  it("berkas nyata: tulis lalu baca = struktur yang sama", () => {
    const s = nyata().struktur;
    const l = tulisLembar(s);
    expect(bacaKuesioner(l.kuesioner, l.kriteria).struktur).toEqual(s);
  });
});

describe("kategoriPetugas / diperiksaBawaan", () => {
  it("aturan kategori", () => {
    expect(kategoriPetugas(0, 0, 0)).toBe("Belum dinilai");
    expect(kategoriPetugas(5, 2, 0)).toBe("Baik");
    expect(kategoriPetugas(5, 3, 0)).toBe("Cukup");
    expect(kategoriPetugas(5, 0, 1)).toBe("Perlu pembinaan");
    expect(kategoriPetugas(5, 9, 1)).toBe("Perlu pembinaan");
  });
  it("aspek bawaan menurut peran", () => {
    const s = nyata().struktur;
    const pml = diperiksaBawaan(s, "pml");
    const ppl = diperiksaBawaan(s, "ppl");
    expect(pml["QC-1"]).toBe(true);
    expect(pml["QC-2"]).toBe(false);
    expect(ppl["QC-2"]).toBe(true);
    expect(ppl["QC-10"]).toBe(false);
    expect(pml["QC-12"] && ppl["QC-12"]).toBe(true);
    expect(Object.values(diperiksaBawaan(s, null)).every(Boolean)).toBe(true);
  });
});

describe("periksaJawaban", () => {
  const S: StrukturKuesioner = CONTOH_STRUKTUR;
  it("skor aspek = nilai terburuk; kategori dari hitungan", () => {
    const r = periksaJawaban(S, { diperiksa: { "QC-1": true, "QC-2": true }, jawab: { "1.1": "Ya", "1.2": "salah", "1.3": "12", "2.1": "Tidak ada" } });
    expect(r.galat).toEqual({});
    expect(r.jawaban.jawab).toEqual({ "1.1": "Ya", "1.2": "Salah", "1.3": 12, "2.1": "Tidak ada" });
    expect(r.kesimpulan.aspek.map((a) => a.skor)).toEqual([3, 1]);
    expect(r.kesimpulan).toMatchObject({ sesuai: 1, perlu_perbaikan: 0, tidak_sesuai: 1, diperiksa: 2, kategori: "Perlu pembinaan", qc_ulang: true, lengkap: true });
  });
  it("aspek tidak diperiksa dibuang; angka tidak dinilai", () => {
    const r = periksaJawaban(S, { diperiksa: { "QC-1": true, "QC-2": false }, jawab: { "1.1": "Ya", "1.2": "Benar", "1.3": 5, "2.1": "Ada" } });
    expect(r.jawaban.jawab["2.1"]).toBeUndefined();
    expect(r.kesimpulan).toMatchObject({ diperiksa: 1, kategori: "Baik", qc_ulang: false, lengkap: true });
  });
  it("belum lengkap tetap boleh disimpan; galat bila nilai tidak valid", () => {
    const sebagian = periksaJawaban(S, { diperiksa: { "QC-1": true }, jawab: { "1.1": "Ya" } });
    expect(sebagian.galat).toEqual({});
    expect(sebagian.kesimpulan.lengkap).toBe(false);
    const buruk = periksaJawaban(S, { diperiksa: { "QC-1": true }, jawab: { "1.1": "Entah", "1.3": "abc" } });
    expect(Object.keys(buruk.galat).sort()).toEqual(["1.1", "1.3"]);
    expect(buruk.kesimpulan.lengkap).toBe(false);
  });
  it("kosong sama sekali -> galat umum", () => {
    expect(periksaJawaban(S, { diperiksa: { "QC-1": true }, jawab: {} }).galat["_"]).toContain("minimal satu");
    expect(periksaJawaban(S, null).galat["_"]).toBeDefined();
  });
  it("kategori Cukup: 3 aspek skor 2 tanpa skor 3 (berkas nyata)", () => {
    const s = nyata().struktur;
    const diperiksa: Record<string, boolean> = {};
    const jawab: Record<string, string> = {};
    for (const a of s.aspek.slice(0, 4)) {
      diperiksa[a.kode] = true;
      const q = a.soal.find((x) => x.jenis !== "N")!;
      jawab[q.no] = (a.kode === "QC-4" ? q.opsi.find((o) => o.nilai === 1) : q.opsi.find((o) => o.nilai === 2))!.teks;
    }
    const r = periksaJawaban(s, { diperiksa, jawab });
    expect(r.kesimpulan).toMatchObject({ sesuai: 1, perlu_perbaikan: 3, tidak_sesuai: 0, kategori: "Cukup" });
  });
});

describe("tanggalLembarValid", () => {
  it("tanggal", () => {
    expect(tanggalLembarValid("2026-10-27", "2026-10-27")).toBe(true);
    expect(tanggalLembarValid("2026-10-28", "2026-10-27")).toBe(false);
    expect(tanggalLembarValid("27-10-2026", "2026-10-27")).toBe(false);
    expect(tanggalLembarValid(null, "2026-10-27")).toBe(false);
  });
});
