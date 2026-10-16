// (16 Okt 2026) Uji aturan Kolam Wilayah Kerja: syarat >70%, tambahan >=50%, maks 2, teks modal, dan pengelompokan kecamatan > nagari.
import { describe, expect, it } from "vitest";
import {
  jumlahBebas,
  kelompokKolam,
  lolosTambahan,
  lolosWilayah,
  MAKS_PILIH_KOLAM,
  namaItemKolam,
  perluTambahan,
  perluWilayah,
  periksaAturanKolam,
  persen,
  pesanTolak,
  teksDariAlasan,
  type ItemKolam,
  type ProgresKolam,
} from "../kolamWilayah";

const P = (ekstra: Partial<ProgresKolam> = {}): ProgresKolam => ({ awal_total: 1031, awal_didata: 274, tambahan_sub: 0, tambahan_total: 0, tambahan_didata: 0, ...ekstra });
const IT = (id: string, kec: string, nag: string, sls: string, sub: string, ekstra: Partial<ItemKolam> = {}): ItemKolam => ({
  idsubsls: id, kecamatan: kec, nagari: nag, sls, sub_sls: sub, kk: 50, didata: 0, diambil_pml_id: null, diambil_nama: null, diambil_at: null, ...ekstra,
});

describe("syarat wilayah awal (lebih dari 70%)", () => {
  it("tepat 70% belum lolos, di atasnya lolos", () => {
    expect(lolosWilayah(P({ awal_total: 100, awal_didata: 70 }))).toBe(false);
    expect(lolosWilayah(P({ awal_total: 100, awal_didata: 71 }))).toBe(true);
    expect(lolosWilayah(P({ awal_total: 1031, awal_didata: 721 }))).toBe(false); // 69,9%
    expect(lolosWilayah(P({ awal_total: 1031, awal_didata: 722 }))).toBe(true); // 70,03%
  });
  it("tanpa daftar KK sama sekali belum lolos", () => {
    expect(lolosWilayah(P({ awal_total: 0, awal_didata: 0 }))).toBe(false);
  });
  it("KK yang dibutuhkan sesuai pembulatan", () => {
    expect(perluWilayah(1031)).toBe(722);
    expect(perluWilayah(100)).toBe(71);
    expect(perluWilayah(372)).toBe(261); // 260,4 -> 261
  });
});

describe("syarat tambahan dari kolam (sekurangnya 50%)", () => {
  it("belum pernah mengambil -> lolos", () => {
    expect(lolosTambahan(P())).toBe(true);
  });
  it("tepat 50% lolos, di bawahnya tidak", () => {
    expect(lolosTambahan(P({ tambahan_sub: 2, tambahan_total: 228, tambahan_didata: 114 }))).toBe(true);
    expect(lolosTambahan(P({ tambahan_sub: 2, tambahan_total: 228, tambahan_didata: 113 }))).toBe(false);
  });
  it("sudah mengambil tetapi daftar KK kosong -> tidak lolos", () => {
    expect(lolosTambahan(P({ tambahan_sub: 1, tambahan_total: 0, tambahan_didata: 0 }))).toBe(false);
  });
  it("KK yang dibutuhkan dibulatkan ke atas", () => {
    expect(perluTambahan(228)).toBe(114);
    expect(perluTambahan(229)).toBe(115);
  });
});

describe("periksaAturanKolam: urutan PPL -> wilayah -> tambahan -> maks", () => {
  const lolos = P({ awal_total: 1031, awal_didata: 804 });
  it("PPL selalu ditolak lebih dulu", () => {
    expect(periksaAturanKolam({ bisaPilih: false, progres: P(), jumlahDipilih: 0 })).toBe("ppl");
  });
  it("wilayah belum 70%", () => {
    expect(periksaAturanKolam({ bisaPilih: true, progres: P(), jumlahDipilih: 0 })).toBe("wilayah");
  });
  it("tambahan belum 50%", () => {
    expect(periksaAturanKolam({ bisaPilih: true, progres: P({ awal_didata: 804, tambahan_sub: 2, tambahan_total: 228, tambahan_didata: 46 }), jumlahDipilih: 0 })).toBe("tambahan");
  });
  it("maks 2 sekali pilih", () => {
    expect(MAKS_PILIH_KOLAM).toBe(2);
    expect(periksaAturanKolam({ bisaPilih: true, progres: lolos, jumlahDipilih: 1 })).toBeNull();
    expect(periksaAturanKolam({ bisaPilih: true, progres: lolos, jumlahDipilih: 2 })).toBe("maks");
  });
  it("lolos semua", () => {
    expect(periksaAturanKolam({ bisaPilih: true, progres: lolos, jumlahDipilih: 0 })).toBeNull();
  });
});

describe("teks modal", () => {
  it("wilayah memuat persen, KK sekarang, dan kekurangan", () => {
    const m = pesanTolak("wilayah", P({ awal_total: 1031, awal_didata: 274 }));
    expect(m.judul).toContain("belum cukup selesai");
    expect(m.angka?.judul).toBe("Tim Anda saat ini 26,6%");
    expect(m.angka?.teks).toContain("274 dari 1.031 KK");
    expect(m.angka?.teks).toContain("kurang 448 KK");
    expect(m.angka?.syarat).toBe(70);
  });
  it("tambahan memuat jumlah Sub SLS yang diambil dan kekurangan KK", () => {
    const m = pesanTolak("tambahan", P({ tambahan_sub: 2, tambahan_total: 228, tambahan_didata: 46 }));
    expect(m.isi).toContain("2 Sub SLS");
    expect(m.angka?.teks).toContain("kurang 68 KK");
    expect(m.angka?.syarat).toBe(50);
  });
  it("diambil menyebut tim dan waktu", () => {
    const m = pesanTolak("diambil", undefined, { nama: "Ilham", waktu: "pada 16 Okt 14.20", sub: "Jorong Bukik Kili Sub 01" });
    expect(m.isi).toContain("Jorong Bukik Kili Sub 01");
    expect(m.isi).toContain("Tim Ilham");
    expect(m.isi).toContain("16 Okt 14.20");
  });
  it("PPL menyebut PML tim", () => {
    expect(pesanTolak("ppl", undefined, { pml: "Lia angraini" }).isi).toContain("Lia Angraini");
  });
  it("alasan dari server diterjemahkan", () => {
    expect(teksDariAlasan("maks")).toContain("Maksimal 2");
    expect(teksDariAlasan("wilayah", P({ awal_total: 100, awal_didata: 10 }))).toContain("10%");
    expect(teksDariAlasan("diambil")).toContain("sudah dipilih");
    expect(teksDariAlasan("aneh")).toBe("Pilihan ditolak.");
  });
});

describe("pengelompokan kecamatan > nagari", () => {
  const item = [
    IT("1", "KUBUNG", "SELAYO", "JORONG LURAH NAN TIGO", "08", { kk: 130 }),
    IT("2", "KUBUNG", "SELAYO", "JORONG GALANGGANG TANGAH", "02", { kk: 98 }),
    IT("3", "KUBUNG", "SELAYO", "JORONG GALANGGANG TANGAH", "01", { kk: 60 }),
    IT("4", "KUBUNG", "KOTO BARU", "JORONG BUKIK KILI", "01", { kk: 146, diambil_pml_id: 458, diambil_nama: "Ilham", diambil_at: "2026-10-16T07:20:00Z" }),
    IT("5", "JUNJUNG SIRIH", "PANINGGAHAN", "JORONG A", "05", { kk: 80 }),
  ];
  it("urut kecamatan, nagari, lalu SLS dan sub", () => {
    const g = kelompokKolam(item);
    expect(g.map((k) => k.kecamatan)).toEqual(["JUNJUNG SIRIH", "KUBUNG"]);
    const kub = g[1];
    expect(kub.nagari.map((n) => n.nagari)).toEqual(["KOTO BARU", "SELAYO"]);
    expect(kub.nagari[1].item.map((i) => i.idsubsls)).toEqual(["3", "2", "1"]);
  });
  it("jumlah Sub SLS, KK, dan yang masih bebas per nagari dan kecamatan", () => {
    const kub = kelompokKolam(item)[1];
    expect(kub.sub).toBe(4);
    expect(kub.bebas).toBe(3);
    expect(kub.nagari[0]).toMatchObject({ nagari: "KOTO BARU", sub: 1, kk: 146, bebas: 0 });
    expect(kub.nagari[1]).toMatchObject({ nagari: "SELAYO", sub: 3, kk: 288, bebas: 3 });
  });
  it("jumlahBebas dan nama item", () => {
    expect(jumlahBebas(item)).toBe(4);
    expect(namaItemKolam(item[1])).toBe("Jorong Galanggang Tangah Sub 02");
  });
  it("persen satu desimal", () => {
    expect(persen(274, 1031)).toBe(26.6);
    expect(persen(0, 0)).toBe(0);
  });
});
