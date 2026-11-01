import { describe, expect, it } from "vitest";
import { KASUS_BERNILAI } from "../vanguard/kasus";
import { MAKS_PETUNJUK, MAKS_SEL, barisKesalahan, barisPercobaan, bacaMuatan, modeMasuk, ringkasLemah, ringkasPercobaan, ringkasRiwayat } from "../vanguard/rekam";
import type { Kasus } from "../vanguard/tipe";

/** Kasus bernilai dengan kunci tidak kosong dan sedikitnya satu kotak yang harus kosong di blok yang sama. */
const kasus: Kasus = KASUS_BERNILAI.find((k) => Object.keys(k.kunci).length >= 1 && !k.nol && !k.lengkap)!;
const sebagaiMuatan = (isian: Record<string, number>, lebih: Record<string, unknown> = {}) => ({ kegiatan: 5, kasus: kasus.kode, isian, petunjuk: 0, lihatJawaban: false, durasiDtk: 30, ...lebih });

describe("mode masuk", () => {
  it("ditentukan cara masuk: ada kegiatan = tercatat, selain itu bebas", () => {
    expect(modeMasuk(5)).toBe("tercatat");
    expect(modeMasuk(null)).toBe("bebas");
    expect(modeMasuk(undefined)).toBe("bebas");
    expect(modeMasuk(0)).toBe("bebas");
    expect(modeMasuk(-3)).toBe("bebas");
    expect(modeMasuk(1.5)).toBe("bebas");
  });
});

describe("bacaMuatan", () => {
  it("menerima muatan sah dan membuang nilai nol", () => {
    const [k0] = Object.keys(kasus.kunci);
    const r = bacaMuatan(sebagaiMuatan({ ...kasus.kunci, e_tidak_ada_nol: 0 } as Record<string, number>));
    // sel tak dikenal ditolak walau nilainya nol
    expect(r.ok).toBe(false);
    const ok = bacaMuatan(sebagaiMuatan({ ...kasus.kunci }));
    expect(ok.ok).toBe(true);
    if (ok.ok) { expect(ok.muatan.isian[k0]).toBe(kasus.kunci[k0]); expect(ok.muatan.kasus).toBe(kasus.kode); expect(ok.kasus.kode).toBe(kasus.kode); }
  });
  it("kode kasus huruf kecil dinormalkan", () => {
    const r = bacaMuatan(sebagaiMuatan({}, { kasus: kasus.kode.toLowerCase() }));
    expect(r.ok).toBe(true);
  });
  it("menolak bentuk salah", () => {
    for (const x of [null, "x", [], 5]) expect(bacaMuatan(x).ok).toBe(false);
    expect(bacaMuatan(sebagaiMuatan({}, { kegiatan: null })).ok).toBe(false);
    expect(bacaMuatan(sebagaiMuatan({}, { kegiatan: 0 })).ok).toBe(false);
    expect(bacaMuatan(sebagaiMuatan({}, { kegiatan: "5" })).ok).toBe(false);
    expect(bacaMuatan(sebagaiMuatan({}, { kasus: "ZZZ" })).ok).toBe(false);
    expect(bacaMuatan(sebagaiMuatan({}, { kasus: 7 })).ok).toBe(false);
    expect(bacaMuatan({ ...sebagaiMuatan({}), isian: [] }).ok).toBe(false);
  });
  it("menolak nilai tak wajar: negatif, pecahan, NaN, string, terlalu besar", () => {
    const [k0] = Object.keys(kasus.kunci);
    for (const v of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "100", null, 9_000_000_000_001]) expect(bacaMuatan(sebagaiMuatan({ [k0]: v as number })).ok).toBe(false);
  });
  it("menolak sel tak dikenal dan isian berlebihan", () => {
    expect(bacaMuatan(sebagaiMuatan({ "__proto__x": 1 })).ok).toBe(false);
    const banyak: Record<string, number> = {};
    for (let i = 0; i <= MAKS_SEL; i++) banyak[`x${i}`] = 1;
    expect(bacaMuatan(sebagaiMuatan(banyak)).ok).toBe(false);
  });
  it("petunjuk dan durasi berbatas", () => {
    expect(bacaMuatan(sebagaiMuatan({}, { petunjuk: MAKS_PETUNJUK })).ok).toBe(true);
    expect(bacaMuatan(sebagaiMuatan({}, { petunjuk: MAKS_PETUNJUK + 1 })).ok).toBe(false);
    expect(bacaMuatan(sebagaiMuatan({}, { petunjuk: -1 })).ok).toBe(false);
    expect(bacaMuatan(sebagaiMuatan({}, { durasiDtk: 86_401 })).ok).toBe(false);
    expect(bacaMuatan(sebagaiMuatan({}, { durasiDtk: -1 })).ok).toBe(false);
    expect(bacaMuatan(sebagaiMuatan({}, { lihatJawaban: "ya" })).ok).toBe(false);
    const r = bacaMuatan({ kegiatan: 5, kasus: kasus.kode, isian: {} });
    expect(r.ok && r.muatan.petunjuk === 0 && r.muatan.durasiDtk === 0 && r.muatan.lihatJawaban === false).toBe(true);
  });
});

describe("ringkasPercobaan: penilaian ulang di server", () => {
  it("jawaban sama dengan kunci = benar; bintang menurun menurut petunjuk dan percobaan", () => {
    const m = { isian: { ...kasus.kunci }, petunjuk: 0, lihatJawaban: false };
    expect(ringkasPercobaan(kasus, m, 1)).toMatchObject({ benar: true, bintang: 3, jmlSalah: 0, jmlFatal: 0, kesalahan: [] });
    expect(ringkasPercobaan(kasus, m, 2).bintang).toBe(2);
    expect(ringkasPercobaan(kasus, m, 9).bintang).toBe(1);
    expect(ringkasPercobaan(kasus, { ...m, petunjuk: 1 }, 1).bintang).toBe(2);
  });
  it("lihat jawaban tidak pernah benar dan bernilai nol bintang", () => {
    const r = ringkasPercobaan(kasus, { isian: { ...kasus.kunci }, petunjuk: 0, lihatJawaban: true }, 1);
    expect(r.benar).toBe(false);
    expect(r.bintang).toBe(0);
  });
  it("salah: kotak kosong = belum_diisi; kotak lebih = harus_kosong (fatal)", () => {
    const [k0] = Object.keys(kasus.kunci);
    const kosong = { ...kasus.kunci }; delete kosong[k0];
    const r1 = ringkasPercobaan(kasus, { isian: kosong, petunjuk: 0, lihatJawaban: false }, 1);
    expect(r1.benar).toBe(false);
    expect(r1.bintang).toBe(0);
    expect(r1.kesalahan.some((x) => x.sel === k0 && x.jenis === "belum_diisi" && x.tingkat === "berat" && x.nilai_petugas === 0 && x.nilai_benar === kasus.kunci[k0])).toBe(true);
    expect(r1.jmlSalah).toBe(r1.kesalahan.length);
    expect(r1.jmlFatal).toBe(r1.kesalahan.filter((x) => x.tingkat === "fatal").length);
  });
  it("percobaan kosong total pada kasus berkunci dihitung salah semua kotak kuncinya", () => {
    const r = ringkasPercobaan(kasus, { isian: {}, petunjuk: 0, lihatJawaban: false }, 1);
    expect(r.benar).toBe(false);
    expect(r.kesalahan.length).toBeGreaterThanOrEqual(Object.keys(kasus.kunci).length);
  });
  it("barisPercobaan dan barisKesalahan menyusun baris untuk tabel", () => {
    const b = bacaMuatan(sebagaiMuatan({}));
    if (!b.ok) throw new Error("muatan harus sah");
    const r = ringkasPercobaan(kasus, b.muatan, 2);
    const p = barisPercobaan(77, b.muatan, r, 2);
    expect(p).toMatchObject({ kegiatan_id: 5, akun_id: 77, kasus: kasus.kode, versi: 1, mode: "latihan", nomor: 2, benar: false, bintang: 0, jml_salah: r.jmlSalah });
    const ks = barisKesalahan(901, 77, b.muatan, r);
    expect(ks).toHaveLength(r.kesalahan.length);
    for (const k of ks) expect(k).toMatchObject({ percobaan_id: 901, kegiatan_id: 5, akun_id: 77, kasus: kasus.kode });
  });
});

describe("ringkasLemah", () => {
  it("menghitung per jenis, terbanyak dulu, seri menurut nama", () => {
    expect(ringkasLemah([{ jenis: "alternatif" }, { jenis: "jebakan" }, { jenis: "jebakan" }, { jenis: "belum_diisi" }, { jenis: "alternatif" }])).toEqual([{ jenis: "alternatif", jumlah: 2 }, { jenis: "jebakan", jumlah: 2 }, { jenis: "belum_diisi", jumlah: 1 }]);
    expect(ringkasLemah([])).toEqual([]);
  });
});

describe("ringkasRiwayat", () => {
  it("menghitung percobaan, sudah benar, dan bintang terbaik per kasus", () => {
    const r = ringkasRiwayat([
      { kasus: "B01", benar: false, bintang: 0 }, { kasus: "A02", benar: true, bintang: 2 }, { kasus: "B01", benar: true, bintang: 1 }, { kasus: "B01", benar: false, bintang: 0 },
    ]);
    expect(r).toEqual([{ kasus: "A02", percobaan: 1, benar: true, bintang: 2 }, { kasus: "B01", percobaan: 3, benar: true, bintang: 1 }]);
    expect(ringkasRiwayat([])).toEqual([]);
  });
});
