import { describe, expect, it } from "vitest";
import { KOLOM_TEMPLAT, pecahKataKunci, petaKolom, petaSoalDariBaris, templatSoal } from "../sigapQcImpor";

const baris = (o: Record<string, unknown> = {}) => ({ Kode: "", Paket: 1, "Judul Paket": "Dasar", Nomor: 1, Pertanyaan: "Siapa yang mengisi kuesioner ini?", A: "PML", B: "PPL", C: "Admin", D: "Wali", Kunci: "B", Pembahasan: "Karena PPL.", "Kata Kunci": "PPL; kuesioner", ...o });

describe("petaKolom", () => {
  it("mengenali nama kolom tanpa membedakan huruf dan tanda baca", () => {
    const p = petaKolom(["KODE SOAL", "No.", "Soal", "Pilihan A", "opsi_b", "C", "D", "Kunci Jawaban", "Penjelasan", "Kata-kunci", "Judul Paket"]);
    expect(p).toMatchObject({ id: "KODE SOAL", nomor: "No.", pertanyaan: "Soal", A: "Pilihan A", B: "opsi_b", kunci: "Kunci Jawaban", penjelasan: "Penjelasan", kata_kunci: "Kata-kunci", judul_paket: "Judul Paket" });
  });
});

describe("pecahKataKunci", () => {
  it("memisah dengan titik koma, garis tegak, atau baris baru; membuang duplikat dan kosong", () => {
    expect(pecahKataKunci("a; b | c\nd;;a")).toEqual(["a", "b", "c", "d"]);
    expect(pecahKataKunci("")).toEqual([]);
  });
});

describe("petaSoalDariBaris", () => {
  it("memetakan baris sah; kode kosong dibuat otomatis per kegiatan", () => {
    const h = petaSoalDariBaris([baris(), baris({ Nomor: 2, Pertanyaan: "Pertanyaan kedua apa ini?" })], { kegiatanId: 2 });
    expect(h.galat).toEqual([]);
    expect(h.soal.map((s) => s.id)).toEqual(["K2-P01-01", "K2-P01-02"]);
    expect(h.soal[0]).toMatchObject({ paket: 1, nomor: 1, kunci: "B", judul_paket: "Dasar", kata_kunci: ["PPL", "kuesioner"], penjelasan: "Karena PPL." });
    expect(h.soal[0].opsi).toEqual({ A: "PML", B: "PPL", C: "Admin", D: "Wali" });
  });
  it("nomor kosong diisi berurutan per paket", () => {
    const h = petaSoalDariBaris([baris({ Nomor: "" }), baris({ Nomor: "", Pertanyaan: "Pertanyaan kedua apa ini?" }), baris({ Paket: 2, Nomor: "", Pertanyaan: "Paket dua pertanyaan pertama?" })], { kegiatanId: 3 });
    expect(h.soal.map((s) => s.id)).toEqual(["K3-P01-01", "K3-P01-02", "K3-P02-01"]);
  });
  it("kunci boleh huruf kecil atau 'B. teks'; kunci salah menjadi galat dengan nomor baris Excel", () => {
    const h = petaSoalDariBaris([baris({ Kunci: "c" }), baris({ Kunci: "B. PPL", Nomor: 2, Pertanyaan: "Pertanyaan kedua apa ini?" }), baris({ Kunci: "E", Nomor: 3, Pertanyaan: "Pertanyaan ketiga apa ini?" })], { kegiatanId: 2 });
    expect(h.soal.map((s) => s.kunci)).toEqual(["C", "B"]);
    expect(h.galat).toHaveLength(1);
    expect(h.galat[0].baris).toBe(4);
    expect(h.galat[0].pesan).toContain("Kunci");
  });
  it("kode ganda dalam berkas ditolak; baris kosong dilewati", () => {
    const h = petaSoalDariBaris([baris({ Kode: "X-1" }), baris({ Kode: "X-1", Pertanyaan: "Pertanyaan kedua apa ini?" }), { Kode: "", Pertanyaan: "", A: "", B: "", C: "", D: "", Kunci: "" }], { kegiatanId: 2 });
    expect(h.soal).toHaveLength(1);
    expect(h.galat).toEqual([{ baris: 3, pesan: "Kode X-1 sudah dipakai baris lain dalam berkas." }]);
    expect(h.dilewati).toBe(1);
  });
  it("kolom wajib tidak ada -> satu galat yang menyebut kolomnya", () => {
    const h = petaSoalDariBaris([{ Pertanyaan: "Apa kabar semuanya?", A: "a", B: "b", C: "c" }], { kegiatanId: 2 });
    expect(h.soal).toEqual([]);
    expect(h.galat[0].pesan).toContain("D");
    expect(h.galat[0].pesan).toContain("Kunci");
  });
  it("berkas kosong", () => {
    expect(petaSoalDariBaris([], { kegiatanId: 2 }).galat[0].pesan).toContain("tidak berisi");
  });
  it("pilihan jawaban sama persis ditolak", () => {
    const h = petaSoalDariBaris([baris({ A: "sama", B: "Sama" })], { kegiatanId: 2 });
    expect(h.soal).toEqual([]);
    expect(h.galat[0].pesan).toContain("sama persis");
  });
});

describe("templatSoal", () => {
  it("judul kolom templat dikenali semua oleh petaKolom, dan contohnya lolos validasi", () => {
    const t = templatSoal();
    expect(t[0]).toEqual([...KOLOM_TEMPLAT]);
    const objek = t.slice(1).map((r) => Object.fromEntries(t[0].map((j, i) => [j, r[i]])));
    const h = petaSoalDariBaris(objek, { kegiatanId: 2 });
    expect(h.galat).toEqual([]);
    expect(h.soal).toHaveLength(2);
  });
});
