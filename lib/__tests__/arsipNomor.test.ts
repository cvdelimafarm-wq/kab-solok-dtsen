import { describe, expect, it } from "vitest";
import { celahUrut, contohNomor, JENIS_ARSIP_LANJUTAN, kkaSah, periksaFormat, pilihKka, ringkasRentang, rujukanLanjutan, rujukanPenugasan, susunNomor, tahunDariTanggal, uraiNomor } from "@/lib/arsip/nomor";

const ST = "{keamanan}-{urut}/{unit}/{kka}/{tahun}";

describe("susunNomor (sama dengan fungsi SQL arsip_susun_nomor)", () => {
  it("surat tugas: nomor berikutnya setelah 1450 pada data nyata", () => {
    expect(susunNomor(ST, { keamanan: "B", urut: 1451, unit: "13030", kka: "VS.330", tahun: 2026 })).toBe("B-1451/13030/VS.330/2026");
  });
  it("naskah khusus: nomor dan tahun saja", () => {
    expect(susunNomor("{urut}/{tahun}", { urut: 7, tahun: 2026 })).toBe("7/2026");
  });
  it("token berlapis nol dan unit/kka kosong tidak merusak pola", () => {
    expect(susunNomor("{urut3}/SPK/{tahun}", { urut: 7, tahun: 2026 })).toBe("007/SPK/2026");
    expect(susunNomor("{urut4}/{tahun}", { urut: 7, tahun: 2026 })).toBe("0007/2026");
    expect(susunNomor("{keamanan}-{urut}/{unit}/{kka}/{tahun}", { urut: 1, tahun: 2026 })).toBe("-1///2026");
  });
  it("{urut} tidak bentrok dengan {urut3}", () => {
    expect(susunNomor("{urut}-{urut3}", { urut: 5, tahun: 2026 })).toBe("5-005");
  });
});

describe("periksaFormat", () => {
  it("pola bawaan semua kategori sah", () => {
    expect(periksaFormat(ST)).toBeNull();
    expect(periksaFormat("{urut}/{unit}/{kka}/{tahun}")).toBeNull();
    expect(periksaFormat("{urut}/{tahun}")).toBeNull();
    expect(periksaFormat("{urut3}/SPK/{tahun}")).toBeNull();
  });
  it("menolak tanpa {urut}, tanpa {tahun}, token asing, kurung tak berpasangan, karakter non-ASCII", () => {
    expect(periksaFormat("{unit}/{tahun}")).toMatch(/\{urut\}/);
    expect(periksaFormat("{urut}/{unit}")).toMatch(/\{tahun\}/);
    expect(periksaFormat("{urut}/{bulan}/{tahun}")).toMatch(/Token tidak dikenal: \{bulan\}/);
    expect(periksaFormat("{urut}/{tahun}{")).toMatch(/berpasangan/);
    expect(periksaFormat("{urut}/Ünit/{tahun}")).toMatch(/huruf, angka/);
    expect(periksaFormat("a")).toMatch(/5 sampai 120/);
  });
});

describe("kode arsip dan pemilihan", () => {
  it("kkaSah", () => {
    for (const k of ["VS.330", "SS.330", "VS.230", "KU.200", "KA.410.1"]) expect(kkaSah(k)).toBe(true);
    for (const k of ["vs.330", "VS330", "V.330", "VS.33", ""]) expect(kkaSah(k)).toBe(false);
  });
  it("pilihKka: eksplisit mengalahkan kegiatan, kegiatan mengalahkan bawaan", () => {
    expect(pilihKka("SS.330", "VS.330", "VS.230")).toBe("SS.330");
    expect(pilihKka("", "VS.330", "VS.230")).toBe("VS.330");
    expect(pilihKka(null, undefined, "VS.230")).toBe("VS.230");
    expect(pilihKka(" ", null, null)).toBeNull();
  });
});

describe("uraiNomor", () => {
  it("nomor surat tugas nyata", () => {
    expect(uraiNomor("B-1285/13030/VS.330/2026")).toEqual({ keamanan: "B", urut: 1285, unit: "13030", kka: "VS.330", tahun: 2026 });
    expect(uraiNomor("B-1232/13030/SS.330/2026")).toMatchObject({ urut: 1232, kka: "SS.330" });
  });
  it("tanpa derajat keamanan dan naskah khusus", () => {
    expect(uraiNomor("12/13030/KU.200/2026")).toEqual({ keamanan: null, urut: 12, unit: "13030", kka: "KU.200", tahun: 2026 });
    expect(uraiNomor("7/2026")).toEqual({ keamanan: null, urut: 7, unit: null, kka: null, tahun: 2026 });
  });
  it("mengembalikan null untuk yang bukan nomor", () => {
    for (const t of ["", "B-1285", "B-12/1303/2026", "b-12/13030/VS.330/2026", "B-12/13030/vs.330/2026"]) expect(uraiNomor(t)).toBeNull();
  });
  it("hasil susunNomor dapat diurai kembali", () => {
    const n = susunNomor(ST, { keamanan: "B", urut: 99, unit: "13030", kka: "VS.330", tahun: 2027 });
    expect(uraiNomor(n)).toMatchObject({ urut: 99, tahun: 2027, kka: "VS.330" });
  });
});

describe("celah nomor", () => {
  it("menemukan nomor yang tidak tercatat dan memangkas daftar", () => {
    const r = celahUrut([1, 2, 4, 5, 8], 8);
    expect(r).toEqual({ celah: [3, 6, 7], total: 3 });
    expect(celahUrut([], 500, 10)).toMatchObject({ total: 500, celah: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
    expect(celahUrut([1, 2, 3], 3)).toEqual({ celah: [], total: 0 });
  });
  it("ringkasRentang", () => {
    expect(ringkasRentang([3, 4, 5, 9, 11, 12])).toBe("3 s.d. 5, 9, 11 s.d. 12");
    expect(ringkasRentang([])).toBe("");
    expect(ringkasRentang([2, 2, 1])).toBe("1 s.d. 2");
  });
});

describe("lain-lain", () => {
  it("tahunDariTanggal memakai teks tanggal, bukan jam peramban", () => {
    expect(tahunDariTanggal("2026-12-31")).toBe(2026);
    expect(tahunDariTanggal("2027-01-01")).toBe(2027);
    expect(tahunDariTanggal("31/12/2026")).toBeNull();
  });
  it("contohNomor untuk pratinjau", () => {
    expect(contohNomor(ST, "B", "13030", "VS.330", 1451, 2026)).toBe("B-1451/13030/VS.330/2026");
    expect(contohNomor(ST, "B", "13030", null, 1, 2026)).toBe("B-1/13030/KKA/2026");
  });
  it("pemetaan dokumen lanjutan dan kunci rujukan stabil", () => {
    expect(JENIS_ARSIP_LANJUTAN).toEqual({ undangan: "undangan", pengantar: "pengantar_nagari", tugas: "st" });
    expect(rujukanLanjutan(7, "undangan", "kelas-1")).toBe("keu_ident_dokumen:7:undangan:kelas-1");
    expect(rujukanPenugasan(123)).toBe("sigap_penugasan:123");
  });
});
