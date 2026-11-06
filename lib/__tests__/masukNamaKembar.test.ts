// (6 Nov 2026) Saran login: kecamatan hanya untuk nama kembar; label Magang; nama asli tidak berubah.
import { describe, expect, it } from "vitest";
import { cariNama, cocokkanNama, idNamaKembar, jadikanSaran, ketAkun, ketSaran, type AkunNama } from "@/lib/sigapMasukNama";

const daftar: AkunNama[] = [
  { id: 136, nama: "Desi Ratna Sari", jenis: "mitra", alamat_kecamatan: "PANTAI CERMIN" },
  { id: 781, nama: "Desi Ratna Sari", jenis: "mitra", alamat_kecamatan: "HILIRAN GUMANTI" },
  { id: 5, nama: "Budi Santoso, S.Si.", jenis: "organik", alamat_kecamatan: "KUBUNG" },
  { id: 6, nama: "Citra Dewi", jenis: "mitra", alamat_kecamatan: "LEMBAH GUMANTI" },
  { id: 788, nama: "Nurul", jenis: "organik", alamat_kecamatan: null, magang: true },
  { id: 299, nama: "Iqbal Widia Saputra", jenis: "mitra", alamat_kecamatan: "X KOTO DIATAS", magang: true },
  { id: 40, nama: "Sri Wahyuni", jenis: "mitra", alamat_kecamatan: "KUBUNG" },
  { id: 41, nama: "Sri Wahyuni, S.E.", jenis: "organik", alamat_kecamatan: null },
];

describe("idNamaKembar", () => {
  it("hanya akun dengan nama (tanpa gelar) sama", () => {
    const k = idNamaKembar(daftar);
    expect([...k].sort((a, b) => a - b)).toEqual([40, 41, 136, 781]);
  });
  it("tanpa kembar -> kosong", () => {
    expect(idNamaKembar([daftar[2], daftar[3]]).size).toBe(0);
  });
});

describe("ketSaran / cariNama", () => {
  it("kembar diberi kecamatan berhuruf kapital kata; akun lain tidak", () => {
    const s = cariNama(daftar, "desi");
    expect(s.map((x) => x.ket).sort()).toEqual(["Mitra · Hiliran Gumanti", "Mitra · Pantai Cermin"]);
    expect(s.every((x) => x.nama === "Desi Ratna Sari")).toBe(true); // nama asli tetap
    expect(cariNama(daftar, "citra")[0].ket).toBe("Mitra");
    expect(cariNama(daftar, "budi")[0].ket).toBe("Pegawai");
  });
  it("kembar tanpa kecamatan -> keterangan biasa", () => {
    expect(cariNama(daftar, "sri wahyuni").find((x) => x.id === 41)?.ket).toBe("Pegawai");
    expect(cariNama(daftar, "sri wahyuni").find((x) => x.id === 40)?.ket).toBe("Mitra · Kubung");
  });
  it("magang diberi label Magang", () => {
    expect(ketAkun({ jenis: "organik", magang: true })).toBe("Magang");
    expect(ketAkun({ jenis: "mitra", magang: true })).toBe("Magang");
    expect(ketAkun({ jenis: "organik", magang: false })).toBe("Pegawai");
    expect(cariNama(daftar, "nurul")[0].ket).toBe("Magang");
    expect(ketSaran(daftar[5], new Set())).toBe("Magang");
  });
  it("kembar dihitung dari daftar penuh, bukan hanya kandidat", () => {
    const hasil = cocokkanNama(daftar, "Desi Ratna Sari");
    expect(hasil.jenis).toBe("ambigu");
    if (hasil.jenis === "ambigu") {
      const s = jadikanSaran(daftar, [hasil.kandidat[0]]);
      expect(s[0].ket).toMatch(/^Mitra · /);
    }
  });
  it("cocokkanNama tetap memakai nama asli (tanpa kecamatan)", () => {
    const h = cocokkanNama(daftar, "Citra Dewi");
    expect(h.jenis).toBe("tepat");
  });
});

import { bentukDaftarPegawai } from "@/lib/pegawaiOrganik";
describe("penanda magang di daftar pegawai", () => {
  it("akun di luar daftar membawa penanda magang", () => {
    const baris = bentukDaftarPegawai([], [
      { id: 788, nama: "Nurul", nip: null, aktif: true, alamat_kecamatan: null, magang: true },
      { id: 5, nama: "Budi", nip: null, aktif: true, alamat_kecamatan: null, magang: null },
    ], Date.UTC(2026, 10, 6));
    expect(baris.find((b) => b.akun_id === 788)?.magang).toBe(true);
    expect(baris.find((b) => b.akun_id === 5)?.magang).toBe(false);
  });
});

import { kunciPin } from "@/lib/sigapMasukNama";
describe("kunci PIN per akun", () => {
  it("dua akun bernama sama punya kunci berbeda", () => {
    expect(kunciPin(136)).not.toBe(kunciPin(781));
    expect(kunciPin(136)).toBe("sigap_pin:id:136");
  });
});
