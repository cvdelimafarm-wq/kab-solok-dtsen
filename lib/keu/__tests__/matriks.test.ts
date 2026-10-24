import { describe, expect, it } from "vitest";
import type { BarisKk } from "../kk";
import {
  aksiMassal, bangunPohon, bukuSelisihItem, gabungKetersediaan, hitungRumus, idDalam, keadaanPilih, kpiMatriks, lolosSaring, nilaiBeda, putarUrut, ratakan, rencanaKembali, roDalamKro, sarankanJenis, ubahPilih,
  type BarisMx, type Ketersediaan,
} from "../matriks";

let seq = 0;
const B = (o: Partial<BarisKk> = {}): BarisKk => ({
  id: ++seq, jadwal_id: 1, ro_kode: "2903.BMA.007", kro: "2903.BMA", detail_id: seq, pok_kunci: null, komponen_kode: "051", akun_semula: "521811", akun_menjadi: "521811",
  uraian_semula: `Item ${seq}`, uraian_menjadi: `Item ${seq}`, vol_semula: 1, vol_menjadi: 1, sat_semula: "OK", sat_menjadi: "OK", harga_semula: 100, harga_menjadi: 100,
  jumlah_semula: 100, jumlah_menjadi: 100, selisih: 0, pindah_dari: null, pindah_ke: null, penggenap: false, baru: false, prioritas_kode: null, rab_item_id: null, catatan: "", urut: seq, pemicu: null, ...o,
});
const MX = (b: BarisKk, k?: Ketersediaan, kurang = 0): BarisMx => gabungKetersediaan([b], new Map(k && b.detail_id !== null ? [[b.detail_id, k]] : []), new Map(kurang ? [[b.id, kurang]] : []))[0];

describe("pohon dan ratakan", () => {
  const a = MX(B({ ro_kode: "2903.BMA.007", komponen_kode: "051", akun_menjadi: "521811", jumlah_semula: 100, jumlah_menjadi: 150, selisih: 50, pemicu: "P-01" }), { nomor: "000001", booked: 10, real: 20 });
  const b = MX(B({ ro_kode: "2903.BMA.007", komponen_kode: "052", akun_menjadi: "524113", jumlah_semula: 200, jumlah_menjadi: 150, selisih: -50, pemicu: "P-01" }));
  const c = MX(B({ ro_kode: "2903.BMA.008", komponen_kode: "051", akun_menjadi: "521811", jumlah_semula: 300, jumlah_menjadi: 300 }));
  const d = MX(B({ ro_kode: "2903.BMA.008", komponen_kode: "051", akun_menjadi: "521811", jumlah_semula: 50, jumlah_menjadi: 50, uraian_menjadi: "Beras", uraian_semula: "Beras" }));
  const pohon = bangunPohon([c, b, a, d]);

  it("mengurutkan RO, komponen, akun dan menjumlahkan dari semua baris", () => {
    expect(pohon.map((r) => r.ro)).toEqual(["2903.BMA.007", "2903.BMA.008"]);
    expect(pohon[0].anak.map((k) => k.komponen)).toEqual(["051", "052"]);
    expect(pohon[0].semula).toBe(300); expect(pohon[0].menjadi).toBe(300); expect(pohon[0].selisih).toBe(0);
    expect(pohon[0].booked).toBe(10); expect(pohon[0].real).toBe(20);
    expect(pohon[1].semula).toBe(350);
  });
  it("ratakan menampilkan RO, komponen, akun, item dan menghormati penutupan", () => {
    const semua = ratakan(pohon, new Set(), {}, null);
    expect(semua.map((x) => x.tipe)).toEqual(["ro", "komp", "akun", "item", "komp", "akun", "item", "ro", "komp", "akun", "item", "item"]);
    const tutup = ratakan(pohon, new Set(["2903.BMA.007"]), {}, null);
    expect(tutup.map((x) => x.tipe)).toEqual(["ro", "ro", "komp", "akun", "item", "item"]);
  });
  it("saring menyembunyikan simpul tanpa item yang lolos tetapi jumlah simpul tetap penuh", () => {
    const l = ratakan(pohon, new Set(), { uraian: { q: "beras", pilih: [] } }, null);
    expect(l.map((x) => x.tipe)).toEqual(["ro", "komp", "akun", "item"]);
    const ro = l[0];
    expect(ro.tipe === "ro" && ro.simpul.semula).toBe(350);
  });
  it("urut naik dan turun pada item dalam akun", () => {
    const l = ratakan(pohon, new Set(), {}, { kolom: "jM", arah: "turun" }).filter((x) => x.tipe === "item");
    const dalam = l.slice(-2).map((x) => (x.tipe === "item" ? x.b.jumlah_menjadi : 0));
    expect(dalam).toEqual([300, 50]);
  });
  it("seleksi: idDalam hanya yang tampil, keadaan, ubah", () => {
    const ids = idDalam(pohon[1], { uraian: { q: "beras", pilih: [] } });
    expect(ids).toEqual([d.id]);
    const p = ubahPilih(new Set(), idDalam(pohon[0], {}), true);
    expect(p.size).toBe(2);
    expect(keadaanPilih(idDalam(pohon[0], {}), p)).toBe("penuh");
    expect(keadaanPilih(idDalam(pohon[1], {}), p)).toBe("kosong");
    expect(keadaanPilih([a.id, c.id], new Set([a.id]))).toBe("sebagian");
    expect(ubahPilih(p, [a.id], false).size).toBe(1);
  });
});

describe("saring dan nilai", () => {
  const x = MX(B({ pemicu: "P-01", sat_menjadi: "OH" }), { nomor: "000777", booked: 5, real: 0 });
  it("pencarian dan filter nilai", () => {
    expect(lolosSaring(x, { kode: { q: "777", pilih: [] } })).toBe(true);
    expect(lolosSaring(x, { kode: { q: "888", pilih: [] } })).toBe(false);
    expect(lolosSaring(x, { pem: { q: "", pilih: ["P-01", "P-08"] } })).toBe(true);
    expect(lolosSaring(x, { pem: { q: "", pilih: ["P-02"] } })).toBe(false);
    expect(lolosSaring(x, {})).toBe(true);
  });
  it("nilaiBeda terurut", () => {
    const y = MX(B({ jumlah_menjadi: 5 })), z = MX(B({ jumlah_menjadi: 40 }));
    expect(nilaiBeda([z, y, z], "jM")).toEqual(["5", "40"]);
  });
  it("putarUrut: naik, turun, hilang", () => {
    const a1 = putarUrut(null, "jM");
    expect(a1).toEqual({ kolom: "jM", arah: "naik" });
    const a2 = putarUrut(a1, "jM");
    expect(a2).toEqual({ kolom: "jM", arah: "turun" });
    expect(putarUrut(a2, "jM")).toBeNull();
    expect(putarUrut(a2, "d")).toEqual({ kolom: "d", arah: "naik" });
  });
  it("kolom cek memakai kekurangan R-06", () => {
    const k = MX(B(), undefined, 1500);
    expect(lolosSaring(k, { cek: { q: "", pilih: ["Kurang"] } })).toBe(true);
  });
});

describe("hitungRumus", () => {
  it("angka biasa, rumus, kurung, desimal koma, ribuan titik", () => {
    expect(hitungRumus("18")).toBe(18);
    expect(hitungRumus("=18*2")).toBe(36);
    expect(hitungRumus("= (10+5) * 2 - 4/2")).toBe(28);
    expect(hitungRumus("1,5*4")).toBe(6);
    expect(hitungRumus("1.250.000/5")).toBe(250000);
    expect(hitungRumus("-3+5")).toBe(2);
  });
  it("menolak yang bukan ekspresi sah", () => {
    expect(hitungRumus("")).toBeNull();
    expect(hitungRumus("abc")).toBeNull();
    expect(hitungRumus("1/0")).toBeNull();
    expect(hitungRumus("2**3")).toBeNull();
    expect(hitungRumus("(1+2")).toBeNull();
    expect(hitungRumus("alert(1)")).toBeNull();
  });
});

describe("aksiMassal", () => {
  const sat = MX(B({ rab_item_id: 5 }));
  const pasang = MX(B({ detail_id: null, pindah_dari: 9, baru: true }));
  it("satu baris POK semula boleh diganti akun; pasangan boleh dibatalkan", () => {
    expect(aksiMassal([sat]).ganti).toBe(true);
    expect(aksiMassal([sat, sat]).ganti).toBe(false);
    expect(aksiMassal([pasang]).batalPindah).toBe(true);
    expect(aksiMassal([sat, pasang]).batalPindah).toBe(false);
    expect(aksiMassal([sat]).tampilRab).toBe(true);
    expect(aksiMassal([pasang]).tampilRab).toBe(false);
  });
  it("tambah item di akun hanya bila semua baris terpilih satu akun", () => {
    expect(aksiMassal([sat]).tambahDiAkun).toEqual({ ro: sat.ro_kode, komponen: sat.komponen_kode, akun: sat.akun_menjadi });
    const lain = MX(B({ akun_menjadi: "524113" }));
    expect(aksiMassal([sat, lain]).tambahDiAkun).toBeNull();
    expect(aksiMassal([]).tambahDiAkun).toBeNull();
  });
  it("ratakan dengan 'hanya yang dipilih'", () => {
    const pohon = bangunPohon([sat, pasang]);
    const l = ratakan(pohon, new Set(), {}, null, new Set([sat.id])).filter((x) => x.tipe === "item");
    expect(l).toHaveLength(1);
  });
});

describe("sarankanJenis", () => {
  const rk = (ro: string, selisih: number, kro: string | null = null) => ({ ro_kode: ro, kro: kro ?? ro.slice(0, 8), selisih });
  const ubah = [B({ pemicu: "P-01", akun_menjadi: "521811", selisih: 0 })];
  it("tanpa perubahan", () => { const s = sarankanJenis([rk("2903.BMA.007", 0)], [B()]); expect(s.tingkat).toBe(0); expect(s.jenis).toBeNull(); });
  it("dalam satu RO = jalur POK", () => { const s = sarankanJenis([rk("2903.BMA.007", 0)], ubah); expect(s.tingkat).toBe(1); expect(s.jenis).toBe("pok"); });
  it("antar-RO dalam satu KRO = POK", () => {
    const s = sarankanJenis([rk("2903.BMA.007", -100), rk("2903.BMA.008", 100)], ubah);
    expect(s.tingkat).toBe(2); expect(s.jenis).toBe("pok");
  });
  it("antar-KRO dalam satu kegiatan = DJPb", () => {
    const s = sarankanJenis([rk("2903.BMA.007", -100), rk("2903.CAN.009", 100)], ubah);
    expect(s.tingkat).toBe(3); expect(s.jenis).toBe("dipa_djpb");
  });
  it("antar-kegiatan = DJPb dan pagu Satker berubah = DJA", () => {
    expect(sarankanJenis([rk("2903.BMA.007", -100), rk("2904.BMA.006", 100)], ubah)).toMatchObject({ tingkat: 4, jenis: "dipa_djpb" });
    expect(sarankanJenis([rk("2903.BMA.007", 500)], ubah)).toMatchObject({ tingkat: 5, jenis: "dipa_dja" });
  });
  it("lintas jenis belanja menaikkan ke DJPb walau dalam satu RO", () => {
    const l = [B({ akun_menjadi: "511111", selisih: -100, pemicu: "P-01" }), B({ akun_menjadi: "521811", selisih: 100, pemicu: "P-01" })];
    const s = sarankanJenis([rk("2903.BMA.007", 0)], l);
    expect(s.jenis).toBe("dipa_djpb");
  });
});

describe("kpiMatriks dan roDalamKro", () => {
  it("menghitung jumlah, kelengkapan RAB, booked dan realisasi", () => {
    const l = [MX(B({ rab_item_id: 1 }), { nomor: "1", booked: 5, real: 7 }), MX(B()), MX(B({ detail_id: null, baru: true, jumlah_semula: 0, jumlah_menjadi: 40, selisih: 40 }))];
    const k = kpiMatriks(l);
    expect(k.nItem).toBe(2); expect(k.nBerRab).toBe(1); expect(k.pctRab).toBe(50);
    expect(k.semula).toBe(200); expect(k.menjadi).toBe(240); expect(k.booked).toBe(5); expect(k.real).toBe(7);
  });
  it("roDalamKro", () => expect(roDalamKro(["2903.BMA.008", "2903.BMA.007", "2904.BMA.006"], "2903.BMA")).toEqual(["2903.BMA.007", "2903.BMA.008"]));
});

describe("rencanaKembali", () => {
  it("membatalkan geseran aktif, menghapus baris buatan (pasangan dulu), dan mereset baris resmi", () => {
    const asli = B({ vol_semula: 10, vol_menjadi: 6, harga_semula: 100, harga_menjadi: 100 });
    const pasangan = B({ detail_id: null, pindah_dari: asli.id, vol_menjadi: 4, vol_semula: 0, harga_menjadi: 100, harga_semula: 0 });
    const baru = B({ detail_id: null, baru: true, vol_menjadi: 1, vol_semula: 0 });
    const naik = B({ vol_semula: 2, vol_menjadi: 2, harga_semula: 50, harga_menjadi: 75 });
    const sama = B();
    const r = rencanaKembali([asli, baru, pasangan, naik, sama], [
      { id: 1, donor_id: asli.id, penerima_id: 9999, batal: false }, { id: 2, donor_id: 8888, penerima_id: 9999, batal: false }, { id: 3, donor_id: asli.id, penerima_id: 1, batal: true },
    ]);
    expect(r.batalGeseran).toEqual([1]);
    expect(r.hapus).toEqual([pasangan.id, baru.id]);
    expect(r.reset).toEqual([{ id: naik.id, vol: 2, harga: 50 }]);
  });
  it("tidak ada yang perlu dilakukan bila sudah sama dengan Semula", () => {
    expect(rencanaKembali([B(), B()], [])).toEqual({ batalGeseran: [], hapus: [], reset: [] });
  });
});

describe("bukuSelisihItem", () => {
  it("hanya item yang RAB-nya melebihi POK, urut prioritas lalu kekurangan", () => {
    const a = B({ rab_item_id: 11, prioritas_kode: "P2", uraian_menjadi: "Sewa" });
    const b = B({ rab_item_id: 12, prioritas_kode: "P1", uraian_menjadi: "Honor" });
    const c = B({ rab_item_id: 13, prioritas_kode: null, uraian_menjadi: "Lain" });
    const it = (id: number, rab: number, pok: number) => ({ ro_kode: "2903.BMA.007", item_id: id, akun_kode: "521811", kelompok: "52 lain", selesai: false, jumlah_rab: rab, jumlah_pok: pok });
    const r = bukuSelisihItem([it(11, 500, 100), it(12, 300, 100), it(13, 900, 100), it(14, 50, 80)], [a, b, c], [{ kode: "P1", nama: "Wajib", urut: 1 }, { kode: "P2", nama: "Penting", urut: 2 }]);
    expect(r.map((x) => x.itemId)).toEqual([12, 11, 13]);
    expect(r[0].kurang).toBe(200); expect(r[0].prioritasNama).toBe("Wajib"); expect(r[2].prioritas).toBeNull();
  });
});
