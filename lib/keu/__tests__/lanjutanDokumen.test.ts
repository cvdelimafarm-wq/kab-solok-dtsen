// lib/keu/__tests__/lanjutanDokumen.test.ts
//
// (25 Okt 2026, tahap 29) Uji penyusun dokumen turunan: tanggal Indonesia, undangan per kelas, surat pengantar nagari, surat tugas atau SPK, dan hambatan penerbitan.

import { describe, expect, it } from "vitest";
import vektor from "./lanjutan.vektor.json";
import { awalForm, normalisasi } from "../identifikasi";
import type { IsiLanjutan } from "../lanjutan";
import { bangunDokumen, bangunPengantar, bangunTugas, bangunUndangan, daftarKunci, hariTanggal, rentangHariTanggal, tanggalPanjang, tempatKelas, teksInstruktur, type KonteksDokumen } from "../lanjutanDokumen";

const salin = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
function ktx(ubah?: (i: IsiLanjutan) => void, status: "draf" | "final" = "final"): KonteksDokumen {
  const f = awalForm(); f.nama = "UJI Survei"; f.periode = "Triwulanan"; f.keList = ["Triwulan I"]; f.instrumen = "FASIH";
  const isi = salin(vektor.base) as IsiLanjutan;
  ubah?.(isi);
  return { namaSurvei: "UJI Survei", tahun: 2026, isi, form: normalisasi(f), upd: null, status };
}
const meta = { nomor: "B-12/1303/2026", tanggal: "2026-02-20", ttd: { nama: "Ani Putri", jabatan: "Ketua Tim" }, terbit: true };

describe("tanggal Indonesia", () => {
  it("panjang dan hari", () => {
    expect(tanggalPanjang("2026-03-02")).toBe("2 Maret 2026");
    expect(hariTanggal("2026-03-02")).toBe("Senin, 2 Maret 2026");
    expect(tanggalPanjang("")).toBe("");
    expect(rentangHariTanggal("2026-03-02", "2026-03-03")).toBe("Senin, 2 Maret 2026 s.d. Selasa, 3 Maret 2026");
    expect(rentangHariTanggal("2026-03-02", "2026-03-02")).toBe("Senin, 2 Maret 2026");
    expect(rentangHariTanggal("", "")).toBe("(tanggal belum ditetapkan)");
  });
});

describe("undangan", () => {
  it("memuat tanggal, tempat, metode, OH, dan daftar peserta bernama", () => {
    const k = ktx(); const d = bangunUndangan(k, k.isi.kelas[0], meta);
    expect(d.konsep).toBe(false); expect(d.hambatan).toEqual([]);
    expect(d.nomor).toBe("B-12/1303/2026"); expect(d.tanggalSurat).toBe("20 Februari 2026");
    expect(d.rincian).toContainEqual(["Hari/tanggal", "Senin, 2 Maret 2026 s.d. Selasa, 3 Maret 2026"]);
    expect(d.rincian).toContainEqual(["Tempat", "Hotel dalam kota: Hotel Contoh, Arosuka"]);
    expect(d.rincian).toContainEqual(["Jumlah OH", "2 hari"]);
    expect(d.tabel?.baris).toHaveLength(4);
    expect(d.tabel?.baris[0]).toEqual(["1", "Ani Putri", "PML", "Organik"]);
  });
  it("daring: tempat 'secara daring'", () => {
    const k = ktx((i) => { i.kelas[0].metode = "Daring"; });
    expect(tempatKelas(k.isi.kelas[0])).toBe("Secara daring (dalam jaringan)");
  });
  it("kelas Perkiraan dan tanggal kosong menahan penerbitan; lanjutan Draf juga", () => {
    const k = ktx((i) => { i.kelas[0].fix = false; i.kelas[0].mulai = ""; }, "draf");
    const d = bangunUndangan(k, k.isi.kelas[0], { ...meta, terbit: false });
    expect(d.konsep).toBe(true);
    expect(d.hambatan.length).toBe(3);
    expect(d.rincian[0][1]).toBe("(tanggal belum ditetapkan)");
  });
});

describe("surat pengantar nagari", () => {
  it("wilayah per baris, jadwal pendataan, dan daftar petugas", () => {
    const k = ktx(); const d = bangunPengantar(k, meta);
    expect(d.kepada).toEqual(["Yth. Wali Nagari", "Nagari Contoh A", "Nagari Contoh B", "di tempat"]);
    expect(d.rincian.find((r) => r[0] === "Jadwal pendataan")?.[1]).toContain("Triwulan I: ");
    expect(d.tabel?.baris).toHaveLength(4);
    expect(d.hambatan).toEqual([]);
  });
  it("wilayah kosong dan petugas menyusul", () => {
    const k = ktx((i) => { i.wilayah = ""; i.petugas[3].nama = ""; i.petugas[3].menyusul = true; }, "draf");
    const d = bangunPengantar(k, { ...meta, terbit: false });
    expect(d.hambatan).toContain("Wilayah tugas belum diisi");
    expect(d.rincian.find((r) => r[0] === "Petugas")?.[1]).toContain("1 lainnya menyusul");
  });
});

describe("surat tugas atau SPK", () => {
  it("organik = surat tugas, mitra = SPK dengan sumber mitra", () => {
    const k = ktx();
    const a = bangunTugas(k, k.isi.petugas[0], 1, meta);
    expect(a.judul).toBe("SURAT TUGAS");
    expect(a.rincian).toContainEqual(["Jabatan dalam tim", "Ketua"]);
    const b = bangunTugas(k, k.isi.petugas[2], 3, meta);
    expect(b.judul).toBe("SURAT PERJANJIAN KERJA (SPK)");
    expect(b.rincian).toContainEqual(["Sumber mitra", "Lewat seleksi"]);
    expect(b.pembuka).toContain("Ani Putri selaku Ketua Tim");
  });
  it("nama menyusul menahan penerbitan", () => {
    const k = ktx((i) => { i.petugas[1].nama = ""; i.petugas[1].menyusul = true; }, "draf");
    const d = bangunTugas(k, k.isi.petugas[1], 2, { ...meta, terbit: false });
    expect(d.hambatan.some((h) => h.includes("nama belum diisi"))).toBe(true);
    expect(d.kepada[0]).toContain("nama menyusul");
  });
});

describe("daftar kunci dan penyusunan menurut jenis", () => {
  it("kunci per jenis", () => {
    const k = ktx();
    expect(daftarKunci("undangan", k.isi).map((x) => x.kunci)).toEqual(["k1"]);
    expect(daftarKunci("pengantar", k.isi).map((x) => x.kunci)).toEqual(["semua"]);
    expect(daftarKunci("tugas", k.isi).map((x) => x.kunci)).toEqual(["p1", "p2", "p3", "p4"]);
  });
  it("kunci tidak dikenal menghasilkan null", () => {
    const k = ktx();
    expect(bangunDokumen("undangan", "kx", k, meta)).toBeNull();
    expect(bangunDokumen("tugas", "px", k, meta)).toBeNull();
    expect(bangunDokumen("pengantar", "lain", k, meta)).toBeNull();
    expect(bangunDokumen("pengantar", "semua", k, meta)?.jenis).toBe("pengantar");
  });
});

describe("nama instruktur pada undangan dan surat tugas", () => {
  const ubahIns = (i: IsiLanjutan) => { i.kelas[0].instruktur = [{ nama: "Budi Santoso", level: "Innas", asal: "Internal BPS", jam: 6 }, { nama: "  ", level: "", asal: "", jam: 0 }, { nama: "Sari", level: "", asal: "Eksternal", jam: 0 }]; };
  it("teksInstruktur: hanya yang bernama, dengan level, asal, dan jam bila ada", () => {
    const k = ktx(ubahIns);
    expect(teksInstruktur(k.isi.kelas[0])).toEqual(["Budi Santoso (Innas, Internal BPS, 6 jam)", "Sari (Eksternal)"]);
    expect(teksInstruktur(ktx().isi.kelas[0])).toEqual([]);
  });
  it("undangan memuat baris Pengajar hanya bila ada instruktur bernama", () => {
    const k = ktx(ubahIns);
    expect(bangunUndangan(k, k.isi.kelas[0], meta).rincian).toContainEqual(["Pengajar", "Budi Santoso (Innas, Internal BPS, 6 jam); Sari (Eksternal)"]);
    const k0 = ktx();
    expect(bangunUndangan(k0, k0.isi.kelas[0], meta).rincian.some((r) => r[0] === "Pengajar")).toBe(false);
  });
  it("surat tugas petugas memuat pelatihan yang diikuti beserta pengajar; tanpa peran atau tanpa kelas tidak ada barisnya", () => {
    const k = ktx(ubahIns);
    const d = bangunTugas(k, k.isi.petugas[0], 1, meta);
    const baris = d.rincian.find((r) => r[0] === "Pelatihan yang diikuti")![1];
    expect(baris).toContain("pengajar Budi Santoso");
    expect(baris).toContain("Senin, 2 Maret 2026");
    const k2 = ktx((i) => { i.kelas = []; });
    expect(bangunTugas(k2, k2.isi.petugas[0], 1, meta).rincian.some((r) => r[0] === "Pelatihan yang diikuti")).toBe(false);
  });
});
