import { describe, expect, it } from "vitest";
import {
  KOSONG, SKOR_BENAR, SKOR_SALAH, hasilKelas, hasilPeserta, hitungPoin, jejakNilai, konversiPeriode, kunciIv1, kunciSel, nilaiSatuan,
  petakanVariasi, petunjukSalahLetak, satuanCakupan, satuanLuarCakupan, satuanPerluTanda, sesiTuntasDitandai, tandaPeserta, teksVariasi, type IsianRoleplay, type PesertaIsian,
} from "@/lib/vanguard/roleplay/penilaian";

// (8 Nov 2026) roleplay bersama kelas: pemetaan variasi dan skor +1 / -0,3 / 0.
const beras = (k1: number, k2: number): IsianRoleplay => ({ iv1: [{ r: 2, k1, k2 }] });
const P = (akun_id: number, isian: IsianRoleplay | null): PesertaIsian => ({ akun_id, isian });

describe("tanda tangan dan pemetaan variasi", () => {
  it("satu rincian dinilai utuh: banyaknya atau nilai beda = variasi beda; nama/satuan tulisan sendiri tidak ikut", () => {
    const a = tandaPeserta({ iv1: [{ r: 2, k1: 2, k2: 30000, nama: "BERAS", satuan: "KG" }] }).get(kunciIv1(2));
    const b = tandaPeserta({ iv1: [{ r: 2, k1: 2, k2: 30000, nama: "beras premium", satuan: "kilo" }] }).get(kunciIv1(2));
    const c = tandaPeserta({ iv1: [{ r: 2, k1: 3, k2: 30000 }] }).get(kunciIv1(2));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it("entri tanpa satu pun angka dianggap kosong; nilai kotak 0 dianggap terisi", () => {
    expect(tandaPeserta({ iv1: [{ r: 2 }] }).size).toBe(0);
    expect(tandaPeserta({ nilai: { a1_uang: 0 } }).get(kunciSel("a1_uang"))).toBe("0");
  });
  it("sumber (K7) dan ART menjadi bagian tanda tangan", () => {
    const x = tandaPeserta({ iv1: [{ r: 190, art: 1, sumber: 2, k2: 15000, k1: 1 }] }).get(kunciIv1(190));
    const y = tandaPeserta({ iv1: [{ r: 190, art: 2, sumber: 2, k2: 15000, k1: 1 }] }).get(kunciIv1(190));
    const z = tandaPeserta({ iv1: [{ r: 190, art: 1, sumber: 1, k2: 15000, k1: 1 }] }).get(kunciIv1(190));
    expect(new Set([x, y, z]).size).toBe(3);
  });
  it("pemetaan: jumlah per variasi, 'Tidak diisi' ikut sebagai variasi, urut terbanyak", () => {
    const peserta = [P(1, beras(2, 30000)), P(2, beras(2, 30000)), P(3, beras(2, 32000)), P(4, null), P(5, beras(2, 30000))];
    const v = petakanVariasi(kunciIv1(2), peserta);
    expect(v.map((x) => x.jumlah)).toEqual([3, 1, 1]);
    expect(v[0].akun.sort()).toEqual([1, 2, 5]);
    expect(v.some((x) => x.tanda === KOSONG && x.akun[0] === 4)).toBe(true);
    expect(v[v.length - 1].tanda).toBe(KOSONG); // pada jumlah sama, "Tidak diisi" paling bawah
  });
  it("satuan yang perlu ditandai = yang diisi minimal satu peserta; semua kosong tidak dinilai", () => {
    const peserta = [P(1, beras(2, 30000)), P(2, null)];
    expect(satuanPerluTanda([kunciIv1(2), kunciIv1(3)], peserta)).toEqual([kunciIv1(2)]);
  });
  it("tombol Lanjut aktif hanya bila semua satuan terisi sudah ditandai", () => {
    const peserta = [P(1, { iv1: [{ r: 2, k1: 1, k2: 1000 }, { r: 3, k1: 1, k2: 2000 }] })];
    const satuan = [kunciIv1(2), kunciIv1(3)];
    expect(sesiTuntasDitandai(satuan, peserta, new Map([[kunciIv1(2), ["x"]]]))).toBe(false);
    expect(sesiTuntasDitandai(satuan, peserta, new Map([[kunciIv1(2), ["x"]], [kunciIv1(3), []]]))).toBe(true);
  });
  it("cakupan: IV.1 menurut rentang R; blok V-VII memuat kotak blok itu", () => {
    expect(satuanCakupan({ bagian: "iv1", dari: 1, sampai: 4 })).toEqual(["r2", "r3", "r4"]);
    expect(satuanCakupan({ bagian: "VI" })).toEqual(["s:vi_g1"]);
    expect(satuanCakupan({ bagian: "VII" }).length).toBe(10);
  });
});

describe("skor", () => {
  const k = kunciIv1(2);
  const benarTanda = tandaPeserta(beras(2, 30000)).get(k) as string;
  it("benar +1; salah -0,3; kosong padahal harus diisi 0", () => {
    expect(nilaiSatuan(k, benarTanda, [benarTanda])).toMatchObject({ hasil: "benar", skor: SKOR_BENAR });
    expect(nilaiSatuan(k, tandaPeserta(beras(2, 32000)).get(k), [benarTanda])).toMatchObject({ hasil: "salah", skor: SKOR_SALAH });
    expect(nilaiSatuan(k, undefined, [benarTanda])).toMatchObject({ hasil: "kosong", skor: 0 });
  });
  it("beberapa variasi boleh sama-sama benar; yang tidak dicentang salah walau terbanyak", () => {
    const lain = tandaPeserta(beras(2, 32000)).get(k) as string;
    expect(nilaiSatuan(k, lain, [benarTanda, lain]).hasil).toBe("benar");
    expect(nilaiSatuan(k, benarTanda, [lain]).hasil).toBe("salah");
  });
  it("'Tidak diisi' yang dicentang benar: kosong +1, isian +/- salah -0,3", () => {
    expect(nilaiSatuan(k, undefined, [KOSONG])).toMatchObject({ hasil: "benar", skor: 1 });
    expect(nilaiSatuan(k, benarTanda, [KOSONG]).hasil).toBe("salah");
  });
  it("kotak rupiah: selisih Rp1 (pembulatan) masih sama", () => {
    const s = kunciSel("a1_uang");
    expect(nilaiSatuan(s, "1000000", ["1000001"]).hasil).toBe("benar");
    expect(nilaiSatuan(s, "1000000", ["1000002"]).hasil).toBe("salah");
  });
  it("poin = maks(0, 100 x skor / satuan dinilai); belum ada yang dinilai = 0", () => {
    expect(hitungPoin(8.5, 10)).toBe(85);
    expect(hitungPoin(-2, 10)).toBe(0);
    expect(hitungPoin(1, 0)).toBe(0);
    expect(hitungPoin(2, 3)).toBe(66.7);
  });
  it("hasil peserta: satuan belum ditandai tidak dihitung; luar cakupan -0,3 dan tidak menambah pembagi", () => {
    const cakupan = [kunciIv1(2), kunciIv1(3), kunciIv1(4)];
    const tanda = new Map<string, string[]>([[kunciIv1(2), [benarTanda]], [kunciIv1(3), [KOSONG]]]); // R4 belum ditandai
    const isian: IsianRoleplay = { iv1: [{ r: 2, k1: 2, k2: 30000 }, { r: 3, k1: 1, k2: 5000 }, { r: 4, k1: 1, k2: 100 }, { r: 50, k1: 1, k2: 100 }] };
    const h = hasilPeserta(7, isian, cakupan, tanda);
    expect(h.dinilai).toBe(2);
    expect(h).toMatchObject({ benar: 1, salah: 1, kosong: 0 });
    expect(h.luar).toEqual([kunciIv1(50)]);
    expect(h.skor).toBeCloseTo(1 - 0.3 - 0.3, 5);
    expect(h.poin).toBe(20);
  });
  it("urutan kelas: poin tertinggi dulu", () => {
    const cakupan = [kunciIv1(2)];
    const tanda = new Map([[kunciIv1(2), [benarTanda]]]);
    const r = hasilKelas([P(1, beras(2, 32000)), P(2, beras(2, 30000)), P(3, null)], cakupan, tanda);
    expect(r.map((x) => x.akun_id)).toEqual([2, 3, 1]);
    expect(r.map((x) => x.poin)).toEqual([100, 0, 0]);
  });
  it("luar cakupan dihitung dari seluruh cakupan roleplay", () => {
    expect(satuanLuarCakupan({ iv1: [{ r: 5, k2: 1 }], nilai: { vi_g1: 5 } }, [kunciIv1(5)])).toEqual([kunciSel("vi_g1")]);
  });
});

describe("bantuan letak nilai", () => {
  it("konversi periode: x12, bagi 12, x30/7, x7/30", () => {
    expect(konversiPeriode(1_200_000, 100_000)).toBe("x12");
    expect(konversiPeriode(100_000, 1_200_000)).toBe("bagi12");
    expect(konversiPeriode(300_000, 70_000)).toBe("x30/7");
    expect(konversiPeriode(70_000, 300_000)).toBe("x7/30");
    expect(konversiPeriode(123, 456)).toBeNull();
  });
  it("jejak nilai: menemukan nilai benar yang salah letak di satuan lain", () => {
    const isian: IsianRoleplay = { nilai: { a1_uang: 0, a2_uang: 2_500_000 } };
    expect(jejakNilai(isian, 2_500_000, kunciSel("a1_uang"))).toEqual([{ kunci: kunciSel("a2_uang"), tanda: "2500000" }]);
    const p = petunjukSalahLetak(isian, kunciSel("a1_uang"), ["2500000"]);
    expect(p).toHaveLength(1);
    expect(p[0].dari.kunci).toBe(kunciSel("a2_uang"));
  });
  it("teks variasi mudah dibaca", () => {
    expect(teksVariasi("r2", KOSONG)).toBe("Tidak diisi");
    expect(teksVariasi(kunciSel("a1_uang"), "1500000")).toContain("1.500.000");
    expect(teksVariasi("r2", tandaPeserta(beras(2, 30000)).get("r2") as string)).toContain("beli 2");
  });
});
