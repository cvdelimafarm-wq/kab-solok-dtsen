// (29 Okt 2026) Uji tabel hasil QC Pemahaman (lib/sigapQcTabel.ts).
import { describe, expect, it } from "vitest";
import { gabungSoalSalah, hitungStatusQc, jumlahKolomNilai, saringBarisQc, susunBarisQc } from "@/lib/sigapQcTabel";
import type { QcRekapTim } from "@/lib/sigapQc";
import type { RincianQc } from "@/lib/sigapQcMonitor";

const RINCIAN: RincianQc = {
  percobaan: {
    1: [
      { ke: 1, skor: 60, benar: 6, jumlah: 10, terlambat: false, selesai_at: "2026-10-29T03:00:00Z", salah: [{ soal_id: "s1", dipilih: "A" }] },
      { ke: 2, skor: 100, benar: 10, jumlah: 10, terlambat: true, selesai_at: "2026-10-29T03:10:00Z", salah: [] },
    ],
    2: [{ ke: 1, skor: 80, benar: 8, jumlah: 10, terlambat: false, selesai_at: "2026-10-29T03:05:00Z", salah: [] }],
    9: [{ ke: 1, skor: 90, benar: 9, jumlah: 10, terlambat: false, selesai_at: "2026-10-29T03:06:00Z", salah: [] }],
  },
  soal: {},
};

const REKAP: QcRekapTim[] = [
  {
    pml_akun_id: 9,
    pml_nama: "Aprila",
    pml_sendiri: { percobaan: 1, lulus: false, skor_terbaik: 90 },
    jumlah_ppl: 3,
    sudah: 2,
    belum_mengisi: 1,
    lulus: 1,
    rata_awal: 70,
    rata_terbaik: 90,
    ppl: [
      { akun_id: 1, nama: "Ega Andini", percobaan: 2, skor_awal: 60, skor_terbaik: 100, lulus: true, terlambat: false, status: "lulus" },
      { akun_id: 2, nama: "Norlizah", percobaan: 1, skor_awal: 80, skor_terbaik: 80, lulus: false, terlambat: false, status: "belum" },
      { akun_id: 3, nama: "Mirvan", percobaan: 0, skor_awal: null, skor_terbaik: null, lulus: false, terlambat: false, status: "belum" },
    ],
    salah: [
      { soal_id: "s1", pertanyaan: "Soal satu", kunci: "B", kunci_teks: "x", penjelasan: "", jumlah: 2, nama: [] },
      { soal_id: "s2", pertanyaan: "Soal dua", kunci: "C", kunci_teks: "y", penjelasan: "", jumlah: 1, nama: [] },
    ],
  },
  {
    pml_akun_id: 10,
    pml_nama: "Ayu",
    pml_sendiri: null,
    jumlah_ppl: 1,
    sudah: 0,
    belum_mengisi: 1,
    lulus: 0,
    rata_awal: null,
    rata_terbaik: null,
    ppl: [{ akun_id: 4, nama: "Budi", percobaan: 0, skor_awal: null, skor_terbaik: null, lulus: false, terlambat: false, status: "belum" }],
    salah: [{ soal_id: "s1", pertanyaan: "Soal satu", kunci: "B", kunci_teks: "x", penjelasan: "", jumlah: 3, nama: [] }],
  },
];

describe("jumlahKolomNilai", () => {
  it("memakai maksimum percobaan pengaturan, bawaan 4, dan melebar bila ada percobaan lebih banyak", () => {
    expect(jumlahKolomNilai(4)).toBe(4);
    expect(jumlahKolomNilai(NaN)).toBe(4);
    expect(jumlahKolomNilai(1)).toBe(1);
    expect(jumlahKolomNilai(2, { percobaan: { 1: [{ ke: 5, skor: 1, benar: 0, jumlah: 1, terlambat: false, selesai_at: "", salah: [] }] }, soal: {} })).toBe(5);
    expect(jumlahKolomNilai(99)).toBe(10);
  });
});

describe("susunBarisQc", () => {
  const baris = susunBarisQc(REKAP, RINCIAN, 4);
  it("urutan: PML dulu lalu PPL-nya, tim demi tim", () => {
    expect(baris.map((b) => `${b.peran}:${b.nama}`)).toEqual(["PML:Aprila", "PPL:Ega Andini", "PPL:Norlizah", "PPL:Mirvan", "PML:Ayu", "PPL:Budi"]);
  });
  it("nilai per percobaan masuk kolom P1..P4 sesuai nomor percobaan", () => {
    const ega = baris.find((b) => b.nama === "Ega Andini")!;
    expect(ega.nilai).toEqual([60, 100, null, null]);
    expect(ega.percobaan).toBe(2);
    expect(ega.pml).toBe("Aprila");
    expect(ega.terlambat).toBe(true); // percobaan ke-2 terlambat
  });
  it("baris PML: peran PML, tanpa nama PML, nilai dari rincian", () => {
    const pml = baris[0];
    expect(pml.pml).toBeNull();
    expect(pml.nilai).toEqual([90, null, null, null]);
    expect(pml.percobaan).toBe(1);
  });
  it("PML tanpa data sama sekali: percobaan 0 dan semua nilai kosong", () => {
    const tanpa = susunBarisQc([REKAP[1]], RINCIAN, 4);
    expect(tanpa.map((b) => b.nama)).toEqual(["Ayu", "Budi"]);
    for (const b of tanpa) {
      expect(b.percobaan).toBe(0);
      expect(b.nilai).toEqual([null, null, null, null]);
    }
  });
  it("tanpa rincian (API lama): P1 diisi nilai awal", () => {
    const lama = susunBarisQc(REKAP, undefined, 4);
    const ega = lama.find((b) => b.nama === "Ega Andini")!;
    expect(ega.nilai).toEqual([60, null, null, null]);
    expect(ega.percobaan).toBe(2);
  });
  it("kolom lebih sedikit dari percobaan: percobaan di luar kolom tidak merusak", () => {
    const sempit = susunBarisQc(REKAP, RINCIAN, 1);
    expect(sempit.find((b) => b.nama === "Ega Andini")!.nilai).toEqual([60]);
  });
});

describe("saringBarisQc / hitungStatusQc", () => {
  const baris = susunBarisQc(REKAP, RINCIAN, 4);
  it("cari menurut nama petugas atau nama PML", () => {
    expect(saringBarisQc(baris, "ega", "semua").map((b) => b.nama)).toEqual(["Ega Andini"]);
    expect(saringBarisQc(baris, "AYU", "semua").map((b) => b.nama)).toEqual(["Ayu", "Budi"]);
    expect(saringBarisQc(baris, "  ", "semua")).toHaveLength(6);
  });
  it("status belum / tidak lulus / lulus", () => {
    expect(saringBarisQc(baris, "", "belum").map((b) => b.nama)).toEqual(["Mirvan", "Ayu", "Budi"]);
    expect(saringBarisQc(baris, "", "tidak_lulus").map((b) => b.nama)).toEqual(["Aprila", "Norlizah"]);
    expect(saringBarisQc(baris, "", "lulus").map((b) => b.nama)).toEqual(["Ega Andini"]);
  });
  it("hitung per status", () => {
    expect(hitungStatusQc(baris)).toEqual({ semua: 6, belum: 3, tidak_lulus: 2, lulus: 1 });
  });
});

describe("gabungSoalSalah", () => {
  it("menjumlahkan soal yang sama antar tim dan mengurutkan dari terbanyak", () => {
    expect(gabungSoalSalah(REKAP)).toEqual([
      { soal_id: "s1", pertanyaan: "Soal satu", jumlah: 5 },
      { soal_id: "s2", pertanyaan: "Soal dua", jumlah: 1 },
    ]);
  });
});

import { FILTER_KOLOM_KOSONG, daftarJumlahPercobaan, daftarPmlBaris, kolomAdaFilter, namaTakCocok, saringKolom, terapkanFokus, urutkanBaris } from "@/lib/sigapQcTabel";

describe("urut dan filter per kolom", () => {
  const baris = susunBarisQc(REKAP, RINCIAN, 4);
  const nama = (b: typeof baris) => b.map((x) => x.nama);
  it("urut nama naik / turun", () => {
    expect(nama(urutkanBaris(baris, "nama", "asc"))).toEqual(["Aprila", "Ayu", "Budi", "Ega Andini", "Mirvan", "Norlizah"]);
    expect(nama(urutkanBaris(baris, "nama", "desc"))[0]).toBe("Norlizah");
  });
  it("urut jumlah percobaan dan stabil untuk nilai sama", () => {
    expect(nama(urutkanBaris(baris, "percobaan", "desc"))[0]).toBe("Ega Andini");
    expect(nama(urutkanBaris(baris, "percobaan", "asc")).slice(0, 3)).toEqual(["Mirvan", "Ayu", "Budi"]);
  });
  it("urut nilai P1: kosong selalu di bawah, apa pun arahnya", () => {
    const naik = urutkanBaris(baris, "p1", "asc");
    expect(nama(naik).slice(0, 3)).toEqual(["Ega Andini", "Norlizah", "Aprila"]);
    expect(naik.slice(3).every((b) => b.nilai[0] == null)).toBe(true);
    const turun = urutkanBaris(baris, "p1", "desc");
    expect(nama(turun).slice(0, 3)).toEqual(["Aprila", "Norlizah", "Ega Andini"]);
    expect(turun.slice(3).every((b) => b.nilai[0] == null)).toBe(true);
  });
  it("urut pml: baris tanpa PML di bawah", () => {
    const u = urutkanBaris(baris, "pml", "asc");
    expect(u.slice(-2).every((b) => b.pml == null)).toBe(true);
  });
  it("tanpa kolom: urutan asli", () => {
    expect(urutkanBaris(baris, null, "asc")).toBe(baris);
  });
  it("filter peran, pml, percobaan, nilai", () => {
    expect(nama(saringKolom(baris, { ...FILTER_KOLOM_KOSONG, peran: "PML" }, 100))).toEqual(["Aprila", "Ayu"]);
    expect(nama(saringKolom(baris, { ...FILTER_KOLOM_KOSONG, pml: "Aprila" }, 100))).toEqual(["Ega Andini", "Norlizah", "Mirvan"]);
    expect(nama(saringKolom(baris, { ...FILTER_KOLOM_KOSONG, pml: "-" }, 100))).toEqual(["Aprila", "Ayu"]);
    expect(nama(saringKolom(baris, { ...FILTER_KOLOM_KOSONG, percobaan: "0" }, 100))).toEqual(["Mirvan", "Ayu", "Budi"]);
    expect(nama(saringKolom(baris, { ...FILTER_KOLOM_KOSONG, nilai: { 1: "terisi" } }, 100))).toEqual(["Ega Andini"]);
    expect(nama(saringKolom(baris, { ...FILTER_KOLOM_KOSONG, nilai: { 0: "lulus" } }, 80))).toEqual(["Aprila", "Norlizah"]);
    expect(nama(saringKolom(baris, { ...FILTER_KOLOM_KOSONG, nilai: { 0: "belum_lulus" } }, 80))).toEqual(["Ega Andini"]);
    expect(nama(saringKolom(baris, { ...FILTER_KOLOM_KOSONG, nilai: { 0: "kosong" } }, 80))).toEqual(["Mirvan", "Ayu", "Budi"]);
  });
  it("filter nama = cari teks tanpa peduli huruf besar/kecil; kombinasi bersifat DAN", () => {
    expect(nama(saringKolom(baris, { ...FILTER_KOLOM_KOSONG, nama: "  EGA " }, 100))).toEqual(["Ega Andini"]);
    expect(saringKolom(baris, { ...FILTER_KOLOM_KOSONG, nama: "ega", peran: "PML" }, 100)).toEqual([]);
  });
  it("kolomAdaFilter, daftarPmlBaris, daftarJumlahPercobaan", () => {
    expect(kolomAdaFilter(FILTER_KOLOM_KOSONG)).toBe(false);
    expect(kolomAdaFilter({ ...FILTER_KOLOM_KOSONG, nilai: { 0: "semua" } })).toBe(false);
    expect(kolomAdaFilter({ ...FILTER_KOLOM_KOSONG, nilai: { 0: "terisi" } })).toBe(true);
    expect(daftarPmlBaris(baris)).toEqual(["Aprila", "Ayu"]);
    expect(daftarJumlahPercobaan(baris)).toEqual([0, 1, 2]);
  });
});

describe("fokus dari infografis / kartu", () => {
  const baris = susunBarisQc(REKAP, RINCIAN, 4);
  it("memilih menurut akun_id atau nama (tanpa peduli huruf / spasi)", () => {
    expect(terapkanFokus(baris, null)).toBe(baris);
    expect(terapkanFokus(baris, { judul: "x", akun: [1, 4] }).map((b) => b.nama)).toEqual(["Ega Andini", "Budi"]);
    expect(terapkanFokus(baris, { judul: "x", nama: ["  norlizah ", "mirvan"] }).map((b) => b.nama)).toEqual(["Norlizah", "Mirvan"]);
  });
  it("nama yang tidak ada di tabel dilaporkan", () => {
    expect(namaTakCocok(baris, { judul: "x", nama: ["Ega Andini", "Orang Asing"] })).toEqual(["Orang Asing"]);
    expect(namaTakCocok(baris, null)).toEqual([]);
  });
});
