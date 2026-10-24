import { describe, expect, it } from "vitest";
import {
  adalahJenis, argsLampiran, efektif, hariAcuanCepat, hariKerja, hitungTenggat, lampiranUntuk, rekapLampiran, ringkasSurat, sifatDari, sisaHariKerja, susunSurat,
  type MasterLampiran,
} from "../lampiran";

describe("hari kerja dan tenggat", () => {
  it("hari kerja: akhir pekan dan libur bukan hari kerja", () => {
    expect(hariKerja("2026-10-26")).toBe(true);   // Senin
    expect(hariKerja("2026-10-24")).toBe(false);  // Sabtu
    expect(hariKerja("2026-10-25")).toBe(false);  // Minggu
    expect(hariKerja("2026-12-24")).toBe(false);  // cuti bersama
    expect(hariKerja("2026-12-25")).toBe(false);  // Natal
    expect(hariKerja("2027-03-10")).toBe(false);  // Idulfitri 2027
    expect(hariKerja("2027-03-16")).toBe(true);   // Selasa sesudah cuti bersama
    expect(hariKerja("2027-08-17")).toBe(false);  // Proklamasi
  });
  it("efektif: dimajukan ke hari kerja terakhir (27 Des 2026 Minggu, 24-25 libur -> 23 Des)", () => {
    expect(efektif("2026-12-27")).toBe("2026-12-23");
    expect(efektif("2026-10-31")).toBe("2026-10-30");
    expect(efektif("2026-11-30")).toBe("2026-11-30");
  });
  it("sisa hari kerja", () => {
    expect(sisaHariKerja("2026-10-24", "2026-10-30")).toBe(5);
    expect(sisaHariKerja("2026-10-24", "2026-12-23")).toBe(43);
    expect(sisaHariKerja("2026-10-30", "2026-10-30")).toBe(0);
    expect(sisaHariKerja("2026-10-31", "2026-10-30")).toBe(-1);
  });
  it("tenggat POK: batas lunak, 43 hari kerja, aman, catatan dimajukan", () => {
    const t = hitungTenggat("pok", "2026-12-27", "2026-10-24");
    expect(t).toMatchObject({ efektif: "2026-12-23", sisa: 43, warna: "aman", lunak: true, ada: true });
    expect(t.catatan).toContain("dimajukan");
  });
  it("warna: mendekati (<=10), mendesak (<=3), lewat", () => {
    expect(hitungTenggat("dipa_dja", "2026-10-30", "2026-10-24").warna).toBe("kuning"); // 5 hari
    expect(hitungTenggat("dipa_dja", "2026-10-30", "2026-10-27").warna).toBe("merah");  // 3 hari
    const l = hitungTenggat("dipa_dja", "2026-10-30", "2026-11-02");
    expect(l.warna).toBe("lewat"); expect(l.sisa).toBe(-1); expect(l.catatan).toContain("Pasal 179");
    expect(hitungTenggat("dipa_djpb", "2026-11-30", "2026-10-24").warna).toBe("aman");
  });
  it("tanggal batas kosong atau rusak: tidak error", () => {
    expect(hitungTenggat("pok", null, "2026-10-24").ada).toBe(false);
    expect(hitungTenggat("pok", "bukan", "2026-10-24").ada).toBe(false);
    expect(hitungTenggat("pok", "2026-12-27", "kemarin").ada).toBe(false);
  });
  it("hari acuan cepat mengikuti tahun anggaran", () => {
    expect(hariAcuanCepat(2027)[0]).toEqual({ iso: "2027-10-27", nama: "27 Okt" });
    expect(hariAcuanCepat(2026)).toHaveLength(4);
  });
  it("adalahJenis", () => { expect(adalahJenis("pok")).toBe(true); expect(adalahJenis("x")).toBe(false); expect(adalahJenis(null)).toBe(false); });
});

const m = (kode: string, urut: number, uraian: string, pok: string, adm: string, djpb: string, dja: string): MasterLampiran =>
  ({ kode, urut, uraian, dasar: "d", pok, administrasi: adm, dipa_djpb: djpb, dipa_dja: dja, aktif: true });
const master: MasterLampiran[] = [
  m("L02", 2, "Surat usulan KPA", "Tidak (KPA memutuskan)", "Ya", "Ya, ke Kanwil", "Ya, ke Eselon I"),
  m("L01", 1, "Data dalam Sistem Informasi", "Ya", "Ya", "Ya", "Ya"),
  m("L05", 5, "Persetujuan Menteri", "Tidak", "Tidak", "Tidak", "Bila antar-Program"),
  { ...m("L99", 99, "Nonaktif", "Ya", "Ya", "Ya", "Ya"), aktif: false },
];

describe("lampiran", () => {
  it("sifat dari teks ketentuan", () => {
    expect(sifatDari("Ya")).toBe("wajib"); expect(sifatDari("Ya, ke Kanwil")).toBe("wajib");
    expect(sifatDari("Tidak")).toBe("tidak"); expect(sifatDari("Tidak (KPA memutuskan)")).toBe("tidak");
    expect(sifatDari("Bila diminta")).toBe("kondisional"); expect(sifatDari("Perhatikan, catat tautan")).toBe("kondisional"); expect(sifatDari("")).toBe("kondisional");
  });
  it("lampiran untuk jenis: urut, tanpa yang nonaktif, status dari catatan", () => {
    const l = lampiranUntuk(master, [{ jadwal_id: 7, kode: "L01", status: "ada", nomor: "N-1", tanggal: "2026-10-20", catatan: "" }], "dipa_djpb");
    expect(l.map((x) => x.kode)).toEqual(["L01", "L02", "L05"]);
    expect(l[0]).toMatchObject({ sifat: "wajib", ada: true, nomor: "N-1", bisa: true });
    expect(l[1]).toMatchObject({ sifat: "wajib", ada: false });
    expect(l[2]).toMatchObject({ sifat: "tidak", bisa: false });
    expect(lampiranUntuk(master, [], "pok")[1].sifat).toBe("tidak");
    expect(lampiranUntuk(master, [], "dipa_dja")[2].sifat).toBe("kondisional");
  });
  it("rekap: menunjuk lampiran wajib yang belum ada", () => {
    const l = lampiranUntuk(master, [{ jadwal_id: 7, kode: "L01", status: "ada", nomor: "", tanggal: null, catatan: "" }], "dipa_djpb");
    expect(rekapLampiran(l)).toMatchObject({ kurang: ["L02"], warna: "kuning", teks: "1 lampiran wajib belum ada: L02" });
    const l2 = lampiranUntuk(master, [{ jadwal_id: 7, kode: "L01", status: "ada", nomor: "", tanggal: null, catatan: "" }, { jadwal_id: 7, kode: "L02", status: "ada", nomor: "", tanggal: null, catatan: "" }], "dipa_djpb");
    expect(rekapLampiran(l2).warna).toBe("hijau");
    expect(rekapLampiran([]).warna).toBe("hijau");
  });
  it("argumen pencatatan dibersihkan", () => {
    expect(argsLampiran(7, "L01", true, "  N-9 ", "2026-10-20", " cat ")).toEqual({ p_jadwal: 7, p_kode: "L01", p_status: "ada", p_nomor: "N-9", p_tanggal: "2026-10-20", p_catatan: "cat" });
    expect(argsLampiran(7, "L01", false, "", "bukan-tanggal").p_tanggal).toBeNull();
    expect(argsLampiran(7, "L01", true, "x".repeat(300)).p_nomor).toHaveLength(120);
  });
});

describe("draf surat", () => {
  const baris = [
    { ro_kode: "2903.BMA.008", jumlah_semula: 100, jumlah_menjadi: 300 }, { ro_kode: "2903.BMA.009", jumlah_semula: 500, jumlah_menjadi: 300 },
    { ro_kode: "2903.BMA.009", jumlah_semula: 50, jumlah_menjadi: 50 }, { ro_kode: "2900.BMA.005", jumlah_semula: 10, jumlah_menjadi: 0 },
  ];
  it("ringkas: seluruh baris atau satu KRO", () => {
    expect(ringkasSurat(baris, null)).toEqual({ nBaris: 3, nRo: 3, kro: ["2900.BMA", "2903.BMA"], semula: 660, menjadi: 650, selisih: -10 });
    expect(ringkasSurat(baris, "2903.BMA")).toEqual({ nBaris: 2, nRo: 2, kro: ["2903.BMA"], semula: 650, menjadi: 650, selisih: 0 });
    expect(ringkasSurat([], null)).toMatchObject({ nBaris: 0, kro: [], selisih: 0 });
  });
  it("isi surat memuat jenis, KRO, angka, dan daftar lampiran wajib atau tercatat", () => {
    const l = lampiranUntuk(master, [{ jadwal_id: 7, kode: "L01", status: "ada", nomor: "N-1", tanggal: null, catatan: "" }], "dipa_djpb");
    const s = susunSurat("dipa_djpb", ringkasSurat(baris, "2903.BMA"), l, "KRO 2903.BMA");
    expect(s).toContain("Usulan Revisi DIPA jalur DJPb (Kanwil)");
    expect(s).toContain("Kepala Kantor Wilayah");
    expect(s).toContain("KRO 2903.BMA");
    expect(s).toContain("2 baris detail pada 2 RO");
    expect(s).toContain("1. Data dalam Sistem Informasi (terlampir, N-1)");
    expect(s).toContain("2. Surat usulan KPA (belum ada)");
    expect(s).not.toContain("Persetujuan Menteri");
    expect(susunSurat("pok", ringkasSurat([], null), [], "x")).toContain("Keputusan KPA");
    expect(susunSurat("pok", ringkasSurat([], null), [], "x")).toContain("[belum ada lampiran yang tercatat]");
  });
});

describe("tenggat 2027 yang jatuh pada libur", () => {
  it("dimajukan ke hari kerja terakhir sebelumnya", () => {
    expect(efektif("2027-03-10")).toBe("2027-03-05");  // Rabu libur Idulfitri; mundur melewati cuti bersama 9 Mar dan Nyepi 8 Mar ke Jumat 5 Mar
    expect(efektif("2027-01-02")).toBe("2026-12-31");  // Sabtu; Jumat 1 Jan libur
  });
});
