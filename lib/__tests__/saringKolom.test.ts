import { describe, expect, it } from "vitest";
import { alihNilai, bersihkanKolom, jumlahSaringan, nilaiUnik, setBanyakNilai, setUrut, STATUS_AWAL, terapkan, type DefKolom } from "../saringKolom";

type R = { nama: string; kec: string | null; umur: number | null };
const data: R[] = [
  { nama: "Budi", kec: "Kubung", umur: 30 },
  { nama: "Ani", kec: "Gunung Talang", umur: 25 },
  { nama: "Citra", kec: null, umur: null },
  { nama: "Dedi", kec: "Kubung", umur: 41 },
];
const kolom: DefKolom<R>[] = [
  { id: "nama", label: "Nama", nilai: (r) => r.nama },
  { id: "kec", label: "Kecamatan", nilai: (r) => r.kec },
  { id: "umur", label: "Umur", nilai: (r) => (r.umur === null ? null : `${r.umur} th`), urut: (r) => r.umur },
];

describe("saringKolom", () => {
  it("tanpa saringan: semua baris, urutan asli", () => {
    expect(terapkan(data, kolom, STATUS_AWAL).map((r) => r.nama)).toEqual(["Budi", "Ani", "Citra", "Dedi"]);
  });

  it("menyembunyikan nilai yang tidak dicentang", () => {
    const st = alihNilai(STATUS_AWAL, "kec", "Kubung");
    expect(terapkan(data, kolom, st).map((r) => r.nama)).toEqual(["Ani", "Citra"]);
    expect(jumlahSaringan(st)).toBe(1);
  });

  it("nilai kosong dikelompokkan sebagai kosong dan bisa disembunyikan", () => {
    const st = alihNilai(STATUS_AWAL, "kec", "");
    expect(terapkan(data, kolom, st).map((r) => r.nama)).toEqual(["Budi", "Ani", "Dedi"]);
  });

  it("melepas centang yang sama mengembalikan keadaan semula", () => {
    const st = alihNilai(alihNilai(STATUS_AWAL, "kec", "Kubung"), "kec", "Kubung");
    expect(jumlahSaringan(st)).toBe(0);
    expect(terapkan(data, kolom, st)).toHaveLength(4);
  });

  it("urut naik/turun memakai kunci urut (angka), kosong tetap di akhir", () => {
    expect(terapkan(data, kolom, setUrut(STATUS_AWAL, "umur", "naik")).map((r) => r.nama)).toEqual(["Ani", "Budi", "Dedi", "Citra"]);
    expect(terapkan(data, kolom, setUrut(STATUS_AWAL, "umur", "turun")).map((r) => r.nama)).toEqual(["Dedi", "Budi", "Ani", "Citra"]);
    expect(terapkan(data, kolom, setUrut(setUrut(STATUS_AWAL, "umur", "naik"), "umur", null)).map((r) => r.nama)).toEqual(["Budi", "Ani", "Citra", "Dedi"]);
  });

  it("urut teks ala abjad Indonesia dan stabil untuk nilai sama", () => {
    const hasil = terapkan(data, kolom, setUrut(STATUS_AWAL, "kec", "naik")).map((r) => r.nama);
    expect(hasil).toEqual(["Ani", "Budi", "Dedi", "Citra"]);
  });

  it("daftar nilai unik mengikuti saringan kolom lain, bukan saringan kolomnya sendiri", () => {
    const st = alihNilai(alihNilai(STATUS_AWAL, "nama", "Ani"), "kec", "Kubung");
    // kolom kec: saringan nama (sembunyikan Ani) berlaku, saringan kec sendiri tidak
    expect(nilaiUnik(data, kolom, st, "kec")).toEqual([
      { nilai: "Kubung", jumlah: 2 },
      { nilai: "", jumlah: 1 },
    ]);
  });

  it("daftar nilai unik terurut menurut kunci urut dan kosong di akhir", () => {
    expect(nilaiUnik(data, kolom, STATUS_AWAL, "umur").map((x) => x.nilai)).toEqual(["25 th", "30 th", "41 th", ""]);
  });

  it("setBanyakNilai: lepas semua yang terlihat lalu centang kembali", () => {
    const semua = ["Budi", "Ani", "Citra", "Dedi"];
    const lepas = setBanyakNilai(STATUS_AWAL, "nama", semua, false);
    expect(terapkan(data, kolom, lepas)).toHaveLength(0);
    const pulih = setBanyakNilai(lepas, "nama", ["Ani", "Dedi"], true);
    expect(terapkan(data, kolom, pulih).map((r) => r.nama)).toEqual(["Ani", "Dedi"]);
    expect(jumlahSaringan(setBanyakNilai(pulih, "nama", semua, true))).toBe(0);
  });

  it("bersihkanKolom menghapus saringan satu kolom saja", () => {
    const st = alihNilai(alihNilai(STATUS_AWAL, "nama", "Ani"), "kec", "Kubung");
    const b = bersihkanKolom(st, "nama");
    expect(jumlahSaringan(b)).toBe(1);
    expect(b.sembunyi.kec).toEqual(["Kubung"]);
  });
});
