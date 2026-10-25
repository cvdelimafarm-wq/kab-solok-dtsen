// lib/keu/__tests__/usulanRab.test.ts
//
// (26 Okt 2026, tahap 33) Uji sambungan identifikasi -> RAB: jadwal cair (H+5), tarif kebijakan sebagai batas tertinggi, kandidat item POK, penanda sudah disalin.

import { describe, expect, it } from "vitest";
import vektor from "./lanjutan.vektor.json";
import { awalForm, normalisasi } from "../identifikasi";
import { isiPredefined, type IsiKebijakan } from "../kebijakan";
import { rincianBiaya, type BarisRincian, type IsiLanjutan } from "../lanjutan";
import { periksaBaris, type BarisRabRow, type PemetaanItem } from "../rab";
import type { ItemAnggaran } from "../ro";
import {
  acuanSelesai, awalMinggu, jagaAnggaran, rencanaBulanan, bulanDari, isianDari, kandidatItem, keteranganSalinan, labelSumber, mingguDari, periksaCair, periksaHarga, ringkasUsulan,
  jendelaCair, saranCair, satuanRab, sudahDisalin, tambahHariTgl, teksHarga, teksJendela, teksVolume, usulanDari, type UsulanBaris,
} from "../usulanRab";

const salin = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe("tanggal dan jadwal cair", () => {
  it("bulanDari, tambahHariTgl, mingguDari, awalMinggu", () => {
    expect(bulanDari("2026-03-14")).toBe(3);
    expect(bulanDari("14/03/2026")).toBeNull();
    expect(bulanDari(null)).toBeNull();
    expect(tambahHariTgl("2026-03-10", 5)).toBe("2026-03-15");
    expect(tambahHariTgl("2026-03-30", 5)).toBe("2026-04-04");
    expect(tambahHariTgl("2026-12-29", 5)).toBe("2027-01-03");
    expect(tambahHariTgl("bukan", 5)).toBeNull();
    expect([1, 7, 8, 14, 15, 21, 22, 31].map((d) => mingguDari(`2026-03-${String(d).padStart(2, "0")}`))).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(awalMinggu(2026, 3, 1)).toBe("2026-03-01");
    expect(awalMinggu(2026, 3, 3)).toBe("2026-03-15");
  });
  it("saran: bulan dan minggu yang memuat hari terakhir; batas lambat H+5", () => {
    expect(saranCair("2026-03-10", { bulan: 9 })).toEqual({ bulan: 3, minggu: 2, lambat: "2026-03-15" });
    expect(saranCair(null, { bulan: 9 })).toEqual({ bulan: 9, minggu: 3, lambat: null });
  });
  it("peringatan hanya untuk minggu yang pasti sesudah H+5 (contoh pengguna: selesai tgl 10, cair 8-15)", () => {
    expect(periksaCair("2026-03-15", 3, 2)).toBeNull();
    expect(periksaCair("2026-03-15", 3, 3)).toBeNull();
    expect(periksaCair("2026-03-15", 3, 4)).toContain("2026-03-15");
    expect(periksaCair("2026-03-15", 4, 1)).not.toBeNull();
    expect(periksaCair("2026-03-15", 2, 4)).toBeNull();
    expect(periksaCair(null, 12, 4)).toBeNull();
  });
});

describe("tarif kebijakan = batas tertinggi", () => {
  it("harga lebih rendah boleh, sama boleh, lebih tinggi diberi peringatan", () => {
    expect(periksaHarga("160000", 170000)).toBeNull();
    expect(periksaHarga("170000", 170000)).toBeNull();
    expect(periksaHarga("180000", 170000)).toContain("batas tertinggi");
    expect(periksaHarga("180000", null)).toBeNull();
    expect(periksaHarga("", 170000)).toBeNull();
  });
});

describe("bentuk isian", () => {
  it("satuanRab membuang keterangan dalam kurung dan memangkas 20 huruf", () => {
    expect(satuanRab("orang (jumlah hari menyusul)")).toBe("orang");
    expect(satuanRab("orang-hari")).toBe("orang-hari");
    expect(satuanRab("")).toBe("paket");
    expect(satuanRab("x".repeat(40))).toHaveLength(20);
  });
  it("teksVolume dan teksHarga", () => {
    expect(teksVolume(12)).toBe("12");
    expect(teksVolume(12.5)).toBe("12,5");
    expect(teksVolume(null)).toBe("");
    expect(teksVolume(0)).toBe("");
    expect(teksHarga(170000)).toBe("170000");
    expect(teksHarga(null)).toBe("");
    expect(teksHarga(0)).toBe("");
  });
  it("keterangan salinan diawali uraian dan tidak melebihi 200 huruf", () => {
    const k = keteranganSalinan({ uraian: "u".repeat(300) }, "identifikasi lanjutan v1");
    expect(k.length).toBeLessThanOrEqual(200);
    expect(keteranganSalinan({ uraian: "Translok PML" }, "identifikasi awal")).toBe("Translok PML · identifikasi awal");
  });
  it("labelSumber", () => {
    expect(labelSumber({ lanjutanAda: true, lanjutanVer: 2, lanjutanStatus: "final" }).panjang).toBe("Identifikasi lanjutan versi 2 (Final)");
    expect(labelSumber({ lanjutanAda: true, lanjutanVer: 1, lanjutanStatus: "draf" }).pendek).toBe("identifikasi lanjutan v1");
    expect(labelSumber({ lanjutanAda: false, lanjutanVer: null, lanjutanStatus: null }).pendek).toBe("identifikasi awal");
  });
});

describe("jendela pencairan dari lembar kebijakan (hari_cair_maks)", () => {
  const ubah = (f: (hc: Record<string, unknown>) => void): IsiKebijakan => { const i = salin(isiPredefined()); f(i.param.find((x) => x.k === "hari_cair_maks") as unknown as Record<string, unknown>); return i; };
  it("tanpa lembar, atau lembar lama tanpa parameter: bawaan H+5 (bukan dari lembar)", () => {
    expect(jendelaCair(null)).toEqual({ hari: 5, dariLembar: false });
    expect(jendelaCair(undefined)).toEqual({ hari: 5, dariLembar: false });
    const lama = salin(isiPredefined()); lama.param = lama.param.filter((x) => x.k !== "hari_cair_maks");
    expect(jendelaCair(lama)).toEqual({ hari: 5, dariLembar: false });
  });
  it("memakai nilai KEBIJAKAN, bukan aturan; kosong = tanpa batas; nilai tak sah = bawaan", () => {
    expect(jendelaCair(isiPredefined())).toEqual({ hari: 5, dariLembar: true });
    expect(jendelaCair(ubah((h) => { h.kebijakan = 3; }))).toEqual({ hari: 3, dariLembar: true });
    expect(jendelaCair(ubah((h) => { h.kebijakan = 0; }))).toEqual({ hari: 0, dariLembar: true });
    expect(jendelaCair(ubah((h) => { h.aturan = null; h.kebijakan = null; }))).toEqual({ hari: null, dariLembar: true });
    expect(jendelaCair(ubah((h) => { h.kebijakan = 2.5; }))).toEqual({ hari: 5, dariLembar: false });
    expect(jendelaCair(ubah((h) => { h.kebijakan = 99; }))).toEqual({ hari: 5, dariLembar: false });
    expect(jendelaCair(ubah((h) => { h.jenis = "rujukan"; }))).toEqual({ hari: 5, dariLembar: false });
  });
  it("teks jendela", () => {
    expect(teksJendela({ hari: 5, dariLembar: false })).toBe("paling lambat H+5 (bawaan, cek aturan)");
    expect(teksJendela({ hari: 3, dariLembar: true })).toBe("paling lambat H+3 (lembar kebijakan)");
    expect(teksJendela({ hari: null, dariLembar: true })).toBe("tanpa batas hari (lembar kebijakan)");
  });
  it("saranCair dan periksaCair mengikuti jendela; tanpa batas tidak pernah memperingatkan", () => {
    expect(saranCair("2026-03-10", { bulan: 9 }, 3)).toEqual({ bulan: 3, minggu: 2, lambat: "2026-03-13" });
    expect(saranCair("2026-03-10", { bulan: 9 }, 0)).toEqual({ bulan: 3, minggu: 2, lambat: "2026-03-10" });
    expect(saranCair("2026-03-10", { bulan: 9 }, null)).toEqual({ bulan: 3, minggu: 2, lambat: null });
    expect(periksaCair("2026-03-13", 3, 3, 3)).toContain("H+3");
    expect(periksaCair("2026-03-13", 3, 2, 3)).toBeNull();
    expect(periksaCair(null, 3, 4, null)).toBeNull();
  });
  it("usulanDari membawa jendela ke tiap baris", () => {
    const f = (() => { const x = awalForm(); x.nama = "UJI Survei"; x.periode = "Triwulanan"; x.keList = ["Triwulan I"]; x.instrumen = "FASIH"; return normalisasi(x); })();
    const isi = salin(vektor.base) as IsiLanjutan;
    const r: BarisRincian = { kelompok: "Honor", uraian: "Honor", akun: "522151", volume: 1, satuan: "orang", tarif: 1000, jumlah: null, catatan: "", perk: false };
    const pend = [{ mulai: "2026-03-02", selesai: "2026-03-10" }];
    const [a] = usulanDari([r], isi, pend, 1, 2);
    expect(a).toMatchObject({ hariCair: 2, lambat: "2026-03-12" });
    const [b] = usulanDari([r], isi, pend, 1, null);
    expect(b).toMatchObject({ hariCair: null, lambat: null, selesai: "2026-03-10" });
    const [c] = usulanDari([r], isi, pend, 1);
    expect(c).toMatchObject({ hariCair: 5, lambat: "2026-03-15" });
    expect(f).toBeDefined();
  });
});

describe("usulanDari dari isi lanjutan nyata", () => {
  const f = (() => { const x = awalForm(); x.nama = "UJI Survei"; x.periode = "Triwulanan"; x.keList = ["Triwulan I"]; x.instrumen = "FASIH"; return normalisasi(x); })();
  const isi = salin(vektor.base) as IsiLanjutan;
  const rincian = rincianBiaya(isi, f, isiPredefined());
  const pendataan = [{ mulai: "2026-03-02", selesai: "2026-03-27" }];

  it("satu usulan per rincian, kunci unik, satuan dan volume sah untuk RAB", () => {
    const u = usulanDari(rincian, isi, pendataan, 1);
    expect(u).toHaveLength(rincian.length);
    expect(new Set(u.map((x) => x.kunci)).size).toBe(u.length);
    for (const x of u) {
      expect(x.satuan.length).toBeGreaterThan(0);
      expect(x.satuan.length).toBeLessThanOrEqual(20);
      expect(x.bulan).toBeGreaterThanOrEqual(1); expect(x.bulan).toBeLessThanOrEqual(12);
      expect(x.minggu).toBeGreaterThanOrEqual(1); expect(x.minggu).toBeLessThanOrEqual(4);
    }
  });
  it("baris non-kelas memakai akhir pendataan sebagai acuan cair", () => {
    const r: BarisRincian = { kelompok: "Translok dan penginapan", uraian: "Translok PML (kurang dari 8 jam)", akun: "524113", volume: 4, satuan: "orang (jumlah hari menyusul)", tarif: 170000, jumlah: null, catatan: "", perk: false };
    const [u] = usulanDari([r], isi, pendataan, 1);
    expect(u.selesai).toBe("2026-03-27");
    expect([u.bulan, u.minggu, u.lambat]).toEqual([3, 4, "2026-04-01"]);
    expect(u.harga).toBe("170000"); expect(u.batasHarga).toBe(170000); expect(u.asalHarga).toBe("kebijakan");
    expect(u.satuan).toBe("orang");
  });
  it("tanpa tarif: harga kosong, asal manual, tanpa batas", () => {
    const r: BarisRincian = { kelompok: "Honor", uraian: "Honor", akun: "522151", volume: null, satuan: "jam", tarif: null, jumlah: null, catatan: "x", perk: true };
    const tanpaKelas = salin(isi); tanpaKelas.kelas = [];
    const [u] = usulanDari([r], tanpaKelas, [], 7);
    expect(u).toMatchObject({ volume: "", harga: "", asalHarga: "manual", batasHarga: null, selesai: null, lambat: null, bulan: 7, minggu: 3, perk: true });
  });
  it("uraian kembar mendapat kunci berbeda", () => {
    const r: BarisRincian = { kelompok: "Rapat", uraian: "Konsumsi", akun: "521211", volume: 1, satuan: "orang", tarif: null, jumlah: null, catatan: "", perk: false };
    const u = usulanDari([r, r], isi, pendataan, 1);
    expect(u[0].kunci).not.toBe(u[1].kunci);
  });
  it("acuanSelesai: uraian berawalan nama kelas memakai selesai kelas itu", () => {
    const k = isi.kelas[0];
    const lain = salin(isi); lain.kelas[0].nama = "Kelas Uji"; lain.kelas[0].selesai = "2026-02-20";
    expect(acuanSelesai({ kelompok: "Pelatihan", uraian: "Kelas Uji: paket fullday" }, lain, pendataan)).toBe("2026-02-20");
    expect(acuanSelesai({ kelompok: "Honor", uraian: "Honor" }, lain, pendataan)).toBe("2026-03-27");
    expect(acuanSelesai({ kelompok: "Honor", uraian: "Honor" }, lain, [])).toBe("2026-02-20");
    expect(k).toBeDefined();
  });
  it("isianDari menghasilkan baris yang lolos periksaBaris bila volume dan harga terisi", () => {
    const r: BarisRincian = { kelompok: "Translok dan penginapan", uraian: "Translok PML", akun: "524113", volume: 4, satuan: "orang", tarif: 170000, jumlah: null, catatan: "", perk: false };
    const [u] = usulanDari([r], isi, pendataan, 1);
    expect(periksaBaris(isianDari(u, "identifikasi awal"))).toEqual([]);
    const [kosong] = usulanDari([{ ...r, tarif: null }], isi, pendataan, 1);
    expect(periksaBaris(isianDari(kosong, "identifikasi awal")).join(" ")).toContain("Harga satuan");
  });
});

describe("kandidat item dan penanda sudah disalin", () => {
  const pok = (id: number, akun: string, uraian = "Item"): ItemAnggaran => ({ detail_id: id, kunci: `k${id}`, komponen: "051", akun, nomor_item: String(id), uraian, volume: 1, satuan: "OK", pok: 1000, realisasi: 0, rab: null, statusRab: null, selesai: false });
  const peta = (id: number, akun: string, status: PemetaanItem["status"], ket: string[] = []): PemetaanItem => ({
    pok: pok(id, akun), rab: status === "belum" ? null : { id, pok_kunci: `k${id}`, selesai: status === "selesai", prioritas_kode: null }, jumlahRab: 0, selisih: null, status,
    baris: ket.map((k, i) => ({ baris_id: id * 10 + i, item_id: id, urut: i + 1, ket: k, volume: 1, satuan: "OK", harga_satuan: 1, jumlah: 1, jumlah_dikunci: false, sama_dengan_item: false, periode: "sekali", bulan_mulai: 1, bulan_sampai: 1, minggu: 3 } as BarisRabRow)),
  });
  const p = [peta(1, "524113", "belum"), peta(2, "524113", "rinci"), peta(3, "524113", "sama"), peta(4, "524113", "selesai"), peta(5, "521211", "belum")];
  const u = (akun: string, uraian = "Translok PML"): UsulanBaris => ({ kunci: `${akun}|${uraian}`, kelompok: "Translok dan penginapan", akun, uraian, volume: "4", satuan: "orang", harga: "100000", bulan: 3, minggu: 3, selesai: null, lambat: null, hariCair: 5, batasHarga: null, perk: false, catatan: "", asalHarga: "manual" });

  it("kandidat: akun sama; item selesai dibuang; RAB = Item dipisah", () => {
    const k = kandidatItem("524113", p);
    expect(k.bisa.map((x) => x.pok.detail_id)).toEqual([1, 2]);
    expect(k.sama.map((x) => x.pok.detail_id)).toEqual([3]);
    expect(kandidatItem("999999", p).bisa).toEqual([]);
    expect(kandidatItem("524113.001", p).bisa).toHaveLength(2);
  });
  it("sudahDisalin mengenali keterangan berawalan uraian pada item beakun sama", () => {
    const q = [peta(2, "524113", "rinci", [keteranganSalinan({ uraian: "Translok PML" }, "identifikasi awal")])];
    expect(sudahDisalin(u("524113"), q)).toBe(true);
    expect(sudahDisalin(u("524113", "Translok PPL"), q)).toBe(false);
    expect(sudahDisalin(u("521211"), q)).toBe(false);
  });
  it("ringkasUsulan memisahkan sudah, siap, butuh harga, tanpa item", () => {
    const q = [peta(2, "524113", "rinci", ["Translok PML · identifikasi awal"]), peta(5, "521211", "belum")];
    const daftar = [u("524113"), u("524113", "Translok PPL"), { ...u("521211", "Konsumsi"), harga: "" }, u("999999", "Lain")];
    expect(ringkasUsulan(daftar, q)).toEqual({ jumlah: 4, sudah: 1, siap: 1, butuhHarga: 1, tanpaItem: 1, total: 400000 });
    // volume kosong juga menunggu isian (tombol salin menolaknya)
    const tanpaVolume = [u("524113", "Tanpa volume")]; tanpaVolume[0].volume = "";
    expect(ringkasUsulan(tanpaVolume, q)).toMatchObject({ siap: 0, butuhHarga: 1, total: 0 });
    const q2 = [peta(2, "524113", "rinci")];
    expect(ringkasUsulan([u("524113")], q2)).toMatchObject({ siap: 1, total: 400000 });
  });
});

describe("rencana realisasi dari identifikasi", () => {
  const pok = (id: number, akun: string, uraian = "Item", nilai = 1000): ItemAnggaran => ({ detail_id: id, kunci: `k${id}`, komponen: "051", akun, nomor_item: String(id), uraian, volume: 1, satuan: "OK", pok: nilai, realisasi: 0, rab: null, statusRab: null, selesai: false });
  const peta = (id: number, akun: string, status: PemetaanItem["status"], nilai = 1000, ket: string[] = []): PemetaanItem => ({
    pok: pok(id, akun, "Item", nilai), rab: status === "belum" ? null : { id, pok_kunci: `k${id}`, selesai: status === "selesai", prioritas_kode: null }, jumlahRab: 0, selisih: null, status,
    baris: ket.map((k, i) => ({ baris_id: id * 10 + i, item_id: id, urut: i + 1, ket: k, volume: 1, satuan: "OK", harga_satuan: 1, jumlah: 1, jumlah_dikunci: false, sama_dengan_item: false, periode: "sekali", bulan_mulai: 1, bulan_sampai: 1, minggu: 3 } as BarisRabRow)),
  });
  const u = (akun: string, uraian: string, o: Partial<UsulanBaris> = {}): UsulanBaris => ({ kunci: `${akun}|${uraian}`, kelompok: "Honor", akun, uraian, volume: "2", satuan: "orang", harga: "100000", bulan: 3, minggu: 2, selesai: "2026-03-10", lambat: "2026-03-15", hariCair: 5, batasHarga: null, perk: false, catatan: "", asalHarga: "manual", ...o });

  it("penjagaan hanya ada atau belum ada, berapa pun nilainya (nol dan item selesai tetap ada)", () => {
    const p = [peta(1, "524113", "belum", 0), peta(2, "521211", "selesai", 5)];
    const j = jagaAnggaran([u("524113", "a"), u("524113", "b"), u("521211", "c"), u("522151", "d")], p);
    expect(j.map((x) => [x.akun, x.status, x.usulan])).toEqual([["524113", "ada", 2], ["521211", "ada", 1], ["522151", "belum_ada", 1]]);
    expect(j[2].pesan).toContain("Belum ada anggaran akun 522151");
    expect(j[0].item).toHaveLength(1);
  });
  it("penjagaan tidak membandingkan nominal dengan pagu", () => {
    const j = jagaAnggaran([u("524113", "a", { harga: "999999999" })], [peta(1, "524113", "belum", 1)]);
    expect(j[0].status).toBe("ada");
  });
  it("rencana bulanan: jumlah per bulan dan minggu, baris tanpa harga terpisah, penanda sudah disalin", () => {
    const p = [peta(1, "524113", "rinci", 1000)];
    const r = rencanaBulanan([u("524113", "Translok"), u("524113", "Lain", { minggu: 2 }), u("524113", "Kosong", { harga: "", bulan: 4, minggu: 1 }), u("524113", "Akhir", { bulan: 3, minggu: 4, selesai: "2026-03-28", lambat: "2026-04-02" })], p);
    expect(r.sel.map((x) => [x.bulan, x.minggu, x.baris, x.jumlah, x.tanpaHarga, x.sudahDisalin])).toEqual([[3, 2, 2, 400000, 0, 0], [3, 4, 1, 200000, 0, 0], [4, 1, 1, 0, 1, 0]]);
    expect(r.total).toBe(600000); expect(r.tanpaHarga).toBe(1); expect(r.sudahDisalin).toBe(0);
    expect(r.selesaiAkhir).toBe("2026-03-28"); expect(r.lambatAkhir).toBe("2026-04-02");
  });
  it("usulan yang sudah disalin dihitung dari baris RAB-nya: jumlah dan jadwal sebenarnya", () => {
    const p = [peta(1, "524113", "rinci", 1000, ["Translok · identifikasi awal"])];
    Object.assign(p[0].baris[0], { jumlah: 640000, bulan_mulai: 5, bulan_sampai: 5, minggu: 1 });
    const r = rencanaBulanan([u("524113", "Translok"), u("524113", "Lain")], p);
    expect(r.sel.map((x) => [x.bulan, x.minggu, x.baris, x.jumlah, x.tanpaHarga, x.sudahDisalin])).toEqual([[3, 2, 1, 200000, 0, 0], [5, 1, 1, 640000, 0, 1]]);
    expect(r.total).toBe(840000); expect(r.sudahDisalin).toBe(1);
    // baris RAB berjumlah nol dihitung tanpa harga
    Object.assign(p[0].baris[0], { jumlah: 0 });
    expect(rencanaBulanan([u("524113", "Translok")], p)).toMatchObject({ total: 0, tanpaHarga: 1, sudahDisalin: 1 });
  });
  it("rencana kosong", () => {
    expect(rencanaBulanan([], [])).toEqual({ sel: [], total: 0, tanpaHarga: 0, sudahDisalin: 0, selesaiAkhir: null, lambatAkhir: null });
  });
});
