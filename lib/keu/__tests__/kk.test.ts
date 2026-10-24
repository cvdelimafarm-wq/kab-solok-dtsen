import { describe, expect, it } from "vitest";
import {
  adaMerah, argsBaruTulis, argsKeputusan, argsPenggenap, bacaAngka, bolehHapus, bolehPasangkan, isianBaruKosong, kelompokAkun, kurangKro, n, periksaGeseran, periksaIsianBaru,
  periksaKeputusan, periksaPasangan, periksaPenggenap, sisaTerhadapPagu, susunKertas, totalKertas, uraianPenggenap, urutkanPeriksa, uraianTerkunci, type BarisKk, type BarisPeriksa, type Kecukupan,
} from "../kk";

const B = (o: Partial<BarisKk> & { id: number }): BarisKk => ({
  jadwal_id: 1, ro_kode: "2906.BMA.005", kro: "2906.BMA", detail_id: o.id, pok_kunci: `k${o.id}`, komponen_kode: "052", akun_semula: "524113", akun_menjadi: "524113",
  uraian_semula: `U${o.id}`, uraian_menjadi: `U${o.id}`, vol_semula: 1, vol_menjadi: 1, sat_semula: "OK", sat_menjadi: "OK", harga_semula: 100, harga_menjadi: 100,
  jumlah_semula: 100, jumlah_menjadi: 100, selisih: 0, pindah_dari: null, pindah_ke: null, penggenap: false, baru: false, prioritas_kode: null, rab_item_id: null, catatan: "", urut: o.id, pemicu: null, ...o,
});

describe("susunKertas dan total", () => {
  const baris = [
    B({ id: 3, komponen_kode: "052", akun_semula: "521211", akun_menjadi: "521211", jumlah_semula: 300, jumlah_menjadi: 300 }),
    B({ id: 1, komponen_kode: "051", akun_semula: "521811", akun_menjadi: "521811", jumlah_semula: 1000, jumlah_menjadi: 900, selisih: -100, pemicu: "P-01" }),
    B({ id: 2, komponen_kode: "051", akun_semula: "521811", akun_menjadi: "521811", jumlah_semula: 50, jumlah_menjadi: "50" }),
    B({ id: 9, detail_id: null, baru: true, komponen_kode: "051", akun_semula: null, akun_menjadi: "521811", jumlah_semula: 0, jumlah_menjadi: 80, pemicu: "P-06" }),
    B({ id: 10, detail_id: null, baru: true, penggenap: true, komponen_kode: "052", akun_semula: null, akun_menjadi: "524113", jumlah_semula: 0, jumlah_menjadi: 20 }),
  ];
  it("mengelompokkan komponen lalu akun dan menjumlah", () => {
    const k = susunKertas(baris);
    expect(k.map((x) => x.komponen)).toEqual(["051", "052"]);
    expect(k[0].akun).toHaveLength(1);
    expect(k[0].akun[0].baris.map((x) => x.id)).toEqual([1, 2, 9]);
    expect(k[0]).toMatchObject({ semula: 1050, menjadi: 1030, selisih: -20 });
    expect(k[1].akun.map((a) => a.akun)).toEqual(["521211", "524113"]);
  });
  it("totalKertas menghitung perubahan, baru, dan penggenap", () => {
    expect(totalKertas(baris)).toEqual({ semula: 1350, menjadi: 1350, selisih: 0, nBerubah: 2, nBaru: 1, nPenggenap: 1, totalPenggenap: 20 });
    expect(sisaTerhadapPagu(baris)).toBe(0);
    expect(sisaTerhadapPagu(baris.slice(1, 3))).toBe(-0 + 0 + (1050 - 950));
  });
  it("kosong", () => { expect(susunKertas([])).toEqual([]); expect(sisaTerhadapPagu([])).toBe(0); });
});

describe("hak tampilan baris", () => {
  it("pasangan hanya baris POK semula bervolume tanpa pasangan; hapus hanya baris baru", () => {
    expect(bolehPasangkan(B({ id: 1 }))).toBe(true);
    expect(bolehPasangkan(B({ id: 1, pindah_ke: 5 }))).toBe(false);
    expect(bolehPasangkan(B({ id: 1, vol_menjadi: 0 }))).toBe(false);
    expect(bolehPasangkan(B({ id: 9, detail_id: null }))).toBe(false);
    expect(bolehHapus(B({ id: 9, detail_id: null }))).toBe(true);
    expect(bolehHapus(B({ id: 1 }))).toBe(false);
    expect(uraianTerkunci(B({ id: 1 }))).toBe(true);
    expect(uraianTerkunci(B({ id: 9, detail_id: null }))).toBe(false);
  });
});

describe("angka dan isian", () => {
  it("bacaAngka", () => {
    expect(bacaAngka("1.234.567")).toBe(1234567);
    expect(bacaAngka("1.234,5")).toBe(1234.5);
    expect(bacaAngka("12,5")).toBe(12.5);
    expect(bacaAngka("48000")).toBe(48000);
    expect(bacaAngka("")).toBeNull();
    expect(bacaAngka("abc")).toBeNull();
    expect(bacaAngka("1.2.3")).toBeNull();
    expect(bacaAngka("-5")).toBeNull();
    expect(n("7")).toBe(7);
    expect(n(null)).toBe(0);
  });
  const sat = ["OK", "PAKET", "DOK"];
  it("periksaIsianBaru", () => {
    const ok = { komponen: "052", akun: "524113", uraian: "Transport", vol: "2", sat: "ok", harga: "50.000" };
    expect(periksaIsianBaru(ok, ["051", "052"], sat)).toEqual([]);
    expect(periksaIsianBaru({ ...isianBaruKosong("999") }, ["051"], sat)).toHaveLength(6);
    expect(periksaIsianBaru({ ...ok, akun: "5241" }, ["052"], sat)).toEqual(["Akun harus 6 angka."]);
    expect(periksaIsianBaru({ ...ok, vol: "0" }, ["052"], sat)).toEqual(["Volume harus lebih dari 0."]);
    expect(periksaIsianBaru({ ...ok, sat: "XX" }, ["052"], sat)).toEqual(["Satuan harus salah satu satuan baku."]);
    expect(argsBaruTulis(5, "2906.BMA.005", ok)).toMatchObject({ jadwal_id: 5, komponen_kode: "052", akun_menjadi: "524113", vol_menjadi: 2, sat_menjadi: "OK", harga_menjadi: 50000 });
  });
  it("penggenap", () => {
    expect(uraianPenggenap("524113", "x")).toBe("Perjalanan dinas Kabupaten (Dana penggenap)");
    expect(uraianPenggenap("521211", "Belanja Barang Operasional Lainnya")).toBe("Belanja Barang Operasional Lainnya Kabupaten (Dana penggenap)");
    expect(uraianPenggenap("521211", null)).toBe("Akun 521211 Kabupaten (Dana penggenap)");
    expect(periksaPenggenap("521211", "052", 100, ["052"])).toEqual([]);
    expect(periksaPenggenap("511111", "052", 100, ["052"])).toEqual(["Dana penggenap hanya untuk akun 52xxxx."]);
    expect(periksaPenggenap("521211", "052", 0, ["051"])).toHaveLength(2);
    expect(argsPenggenap(2, "R", "052", "524113", null, 500)).toMatchObject({ penggenap: true, vol_menjadi: 1, sat_menjadi: "PAKET", harga_menjadi: 500 });
  });
  it("periksaPasangan", () => {
    const b = B({ id: 1, vol_menjadi: 4, akun_semula: "521211", uraian_semula: "Konsumsi" });
    expect(periksaPasangan("524113", "", 2, b)).toEqual([]);
    expect(periksaPasangan("", "Konsumsi rapat", 4, b)).toEqual([]);
    expect(periksaPasangan("521211", "Konsumsi", 1, b)).toEqual(["Isi akun atau redaksi yang berbeda dari semula."]);
    expect(periksaPasangan("524113", "", 5, b)[0]).toMatch(/paling banyak 4/);
    expect(periksaPasangan("12", "ab", null, b).length).toBe(3);
  });
});

describe("pemeriksaan dan keputusan", () => {
  const P = (kode: string, tingkat: BarisPeriksa["tingkat"], objek: string | null = null): BarisPeriksa => ({ jadwal_id: 1, kode, tingkat, objek, pesan: "", nilai: 0 });
  it("urutkan dan adaMerah", () => {
    const u = urutkanPeriksa([P("R-15", "hijau"), P("R-03", "merah"), P("R-07", "kuning"), P("R-01", "hijau")]);
    expect(u.map((x) => x.kode)).toEqual(["R-03", "R-07", "R-01", "R-15"]);
    expect(adaMerah(u)).toBe(true);
    expect(adaMerah([P("R-01", "hijau")])).toBe(false);
  });
  const C = (kro: string, kelompok: string, kurang: number): Kecukupan => ({ jadwal_id: 1, kro, kelompok, n_item: 1, rab: 0, pok: 0, k: 0, status: "Kurang", kurang, kurang_dari_k: 0 });
  it("kurangKro menjumlah kelompok", () => expect(kurangKro([C("2906.BMA", "524", 100), C("2906.BMA", "52L", 50), C("2903.BMA", "524", 7)], "2906.BMA")).toBe(150));
  it("periksaKeputusan", () => {
    expect(periksaKeputusan("tunda", "", 0)).toEqual([]);
    expect(periksaKeputusan("semua", "", 0)).toEqual(["KRO ini tidak memiliki kekurangan terhadap RAB."]);
    expect(periksaKeputusan("semua", "", 10)).toEqual([]);
    expect(periksaKeputusan("sebagian", "", 10)).toEqual(["Jumlah yang diterima harus lebih dari 0."]);
    expect(periksaKeputusan("sebagian", "11", 10)[0]).toMatch(/melebihi/);
    expect(periksaKeputusan("sebagian", "5", 10)).toEqual([]);
    expect(argsKeputusan(3, "2906.BMA", "sebagian", "5", " cat ")).toEqual({ p_jadwal: 3, p_kro: "2906.BMA", p_keputusan: "sebagian", p_jumlah: 5, p_catatan: "cat" });
    expect(argsKeputusan(3, "2906.BMA", "semua", "5", "")).toMatchObject({ p_jumlah: null });
  });
  it("kelompokAkun dan geseran", () => {
    expect(kelompokAkun("511111")).toBe("51");
    expect(kelompokAkun("524113")).toBe("524");
    expect(kelompokAkun("521211")).toBe("52L");
    expect(kelompokAkun("532111")).toBe("53");
    expect(kelompokAkun("123")).toBeNull();
    const a = B({ id: 1, akun_menjadi: "524113" }), b = B({ id: 2, akun_menjadi: "524114" }), c = B({ id: 3, akun_menjadi: "521211" });
    expect(periksaGeseran(a, b, "1000")).toEqual([]);
    expect(periksaGeseran(a, c, "1000")).toEqual(["Geseran hanya dalam kelompok belanja yang sama."]);
    expect(periksaGeseran(a, a, "1000")).toContain("Donor dan penerima harus berbeda.");
    expect(periksaGeseran(a, b, "0")).toContain("Jumlah harus bilangan bulat lebih dari 0.");
    expect(periksaGeseran(undefined, b, "1")).toEqual(["Pilih baris donor dan penerima."]);
  });
});
