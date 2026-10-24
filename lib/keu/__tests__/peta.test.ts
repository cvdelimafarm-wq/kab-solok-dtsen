import { describe, expect, it } from "vitest";
import { hitungPeta, jalurPeta, keputusanDariBasis, kelompokKegiatan, ketKegiatan, ketKro, ppkDaftar, ringkasPeta, susunPeta, teksSumber, urlPeta, vonisSatker, type DetailPeta, type ItemPeta, type KkPeta, type NodePeta } from "../peta";

const node = (id: number, induk: number | null, tingkat: string, kode: string, nama: string, pagu: number | null, ro_kode: string | null = null): NodePeta => ({ id, induk_id: induk, tingkat, kode, nama, pagu, ro_kode });
const nodes: NodePeta[] = [
  node(1, null, "program", "GG", "Program GG", null),
  node(2, 1, "kegiatan", "2902", "Keg 2902", null),
  node(3, 2, "kro", "BMA", "Data dan Informasi Publik[Base Line]", 1000000),
  node(4, 3, "ro", "004", "RO a", 600000, "2902.BMA.004"),
  node(5, 3, "ro", "006", "RO b", 400000, "2902.BMA.006"),
  node(6, 2, "kro", "CAN", "Sarana[Base Line]", 500000),
  node(7, 6, "ro", "004", "RO c", 500000, "2902.CAN.004"),
  node(8, 1, "kegiatan", "2903", "Keg 2903", null),
  node(9, 8, "kro", "BMA", "Data [dua]", 300000),
  node(10, 8, "kro", "BMA", "Data [dua]", 200000),
  node(11, 9, "ro", "007", "RO d", 300000, "2903.BMA.007"),
  node(12, 10, "ro", "008", "RO e", 200000, "2903.BMA.008"),
  node(13, null, "program", "WA", "Program WA", null),
  node(14, 13, "kegiatan", "2886", "Keg 2886", null),
  node(15, 14, "kro", "EBA", "EBA", 900000),
  node(16, 15, "ro", "956", "RO f", 900000, "2886.EBA.956"),
];
const kunci = ["2902.BMA.004/001/521811/atk#1", "2902.BMA.004/001/521211/rapat#1", "2902.BMA.006/002/524111/dinas#1", "2902.CAN.004/001/521811/b#1", "2903.BMA.007/001/521811/c#1", "2886.EBA.956/001/521811/d#1"];

describe("susunPeta", () => {
  const s = susunPeta(nodes, kunci);
  it("menggabungkan KRO yang muncul dua kali dan menjumlah pagu", () => {
    const k = s.find((x) => x.kro === "2903.BMA")!;
    expect(k.pagu).toBe(500000);
    expect(k.ro).toEqual(["2903.BMA.007", "2903.BMA.008"]);
    expect(s).toHaveLength(4);
  });
  it("mencatat program, kegiatan, nama bersih, dan jumlah detail", () => {
    const k = s.find((x) => x.kro === "2902.BMA")!;
    expect(k).toMatchObject({ prog: "GG", keg: "2902", nama: "Data dan Informasi Publik", kegNama: "Keg 2902", nDetail: 3 });
  });
  it("urut Kegiatan lalu KRO", () => { expect(s.map((x) => x.kro)).toEqual(["2886.EBA", "2902.BMA", "2902.CAN", "2903.BMA"]); });
});

const struktur = susunPeta(nodes, kunci);
const rab = [{ rab_id: 1, ro_kode: "2902.BMA.004" }, { rab_id: 2, ro_kode: "2902.CAN.004" }, { rab_id: 3, ro_kode: "2886.EBA.956" }, { rab_id: 4, ro_kode: "2903.BMA.007" }];
const detail: DetailPeta[] = [
  { kunci_stabil: "2902.BMA.004/001/521811/atk#1", jumlah: 500000 }, { kunci_stabil: "2902.BMA.004/001/521211/rapat#1", jumlah: 100000 },
  { kunci_stabil: "2902.CAN.004/001/521811/b#1", jumlah: 500000 }, { kunci_stabil: "2886.EBA.956/001/521811/d#1", jumlah: 900000 }, { kunci_stabil: "2903.BMA.007/001/521811/c#1", jumlah: 300000 },
];
const item = (id: number, rab_id: number, pok_kunci: string | null, jumlah: number, o: Partial<ItemPeta> = {}): ItemPeta => ({ item_id: id, rab_id, pok_kunci, status: "sama", jumlah_rab: jumlah, selesai: false, ...o });
const items: ItemPeta[] = [
  item(1, 1, "2902.BMA.004/001/521811/atk#1", 600000), // POK 500.000 < RAB 600.000 -> kurang
  item(2, 1, "2902.BMA.004/001/521211/rapat#1", 100000), // sama
  item(3, 2, "2902.CAN.004/001/521811/b#1", 270000), // K = 300.000, POK 500.000 -> lebih
  item(4, 3, "2886.EBA.956/001/521811/d#1", 500000, { status: "belum" }), // diabaikan
  item(5, 4, "2903.BMA.007/001/521811/c#1", 100000, { status: "rinci" }), // ada, tapi akan diuji tak terpadan
];

describe("hitungPeta", () => {
  const b = hitungPeta(struktur, rab, items, detail, [], 0.9, 0.05);
  const per = (k: string) => b.find((x) => x.kro === k)!;
  it("membandingkan hanya item ber-RAB dan menetapkan status", () => {
    const x = per("2902.BMA");
    expect(x).toMatchObject({ nAda: 2, Pc: 600000, R: 700000, st: "kurang", dPasti: -100000, kurang: 100000, sisa: 0 });
    expect(x.K).toBe(Math.round(700000 / 0.9));
  });
  it("KRO tanpa RAB berstatus kosong dan tidak ikut jumlah", () => {
    expect(per("2886.EBA")).toMatchObject({ st: "kosong", nAda: 0, Pc: 0, R: 0 });
  });
  it("sisa hanya untuk Cukup atau Lebih", () => {
    const c = per("2902.CAN");
    expect(c.st).toBe("lebih"); expect(c.sisa).toBe(500000 - 300000);
  });
  it("memakai Menjadi kertas kerja bila item ada di sana (rab_item_id, lalu kunci)", () => {
    const kk: KkPeta[] = [{ ro_kode: "2902.BMA.004", pok_kunci: null, jumlah_menjadi: 650000, rab_item_id: 1, penggenap: false }, { ro_kode: "2902.BMA.004", pok_kunci: "2902.BMA.004/001/521211/rapat#1", jumlah_menjadi: 90000, rab_item_id: null, penggenap: false }, { ro_kode: "2902.BMA.004", pok_kunci: null, jumlah_menjadi: 777, rab_item_id: null, penggenap: true }];
    const x = hitungPeta(struktur, rab, items, detail, kk, 0.9, 0.05).find((y) => y.kro === "2902.BMA")!;
    expect(x.Pc).toBe(740000); expect(x.dPasti).toBe(40000);
  });
  it("item RAB tanpa pasangan POK dilewati dan dihitung; item baru tanpa POK dihitung nol", () => {
    const lain = hitungPeta(struktur, rab, [item(9, 4, "2903.BMA.007/001/521811/hilang#1", 50000), item(10, 4, null, 80000, { baru: true })], detail, [], 0.9, 0.05).find((y) => y.kro === "2903.BMA")!;
    expect(lain.nTakPadan).toBe(1); expect(lain.nAda).toBe(1); expect(lain.Pc).toBe(0); expect(lain.R).toBe(80000); expect(lain.st).toBe("kurang");
  });
  it("item selesai: kebutuhan sama dengan RAB", () => {
    const x = hitungPeta(struktur, rab, [item(11, 3, "2886.EBA.956/001/521811/d#1", 900000, { selesai: true })], detail, [], 0.9, 0.05).find((y) => y.kro === "2886.EBA")!;
    expect(x.K).toBe(900000); expect(x.st).toBe("cukup");
  });
});

describe("ringkas, putusan, jalur", () => {
  const b = hitungPeta(struktur, rab, items, detail, [], 0.9, 0.05);
  const r = ringkasPeta(b);
  it("menjumlah hanya KRO ber-RAB dan seluruh pagu", () => {
    expect(r.P).toBe(1400000); expect(r.R).toBe(1070000); expect(r.pagu).toBe(900000 + 1000000 + 500000 + 500000);
    expect(r.dPasti).toBe(330000); expect(r.nAda).toBe(3);
  });
  it("putusan Satker: cukup, cadangan tipis, tidak cukup, belum dinilai", () => {
    expect(vonisSatker(r, 0.9).warna).toBe("hijau");
    expect(vonisSatker({ ...r, dPasti: -5, dRiil: -5 }, 0.9)).toMatchObject({ warna: "merah" });
    expect(vonisSatker({ ...r, dPasti: 10, dRiil: -20 }, 0.9).teks).toContain("cadangan tipis");
    expect(vonisSatker({ ...r, nAda: 0 }, 0.9).warna).toBe("abu");
  });
  it("kelompok Kegiatan dan keterangannya", () => {
    const g = kelompokKegiatan(b).find((x) => x.keg === "2902")!;
    expect(g.kro.map((x) => x.kro)).toEqual(["2902.BMA", "2902.CAN"]);
    expect(g.ket).toContain("Kurang pada 2902.BMA"); expect(g.ket).toContain("2902.CAN"); expect(g.ket).toContain("tingkat 3");
    expect(ketKegiatan([])).toBe("");
  });
  it("keterangan KRO tanpa RAB", () => { expect(ketKro(b.find((x) => x.kro === "2886.EBA")!)).toContain("Belum ada RAB"); });
  it("jalur: ada pasangan dalam Kegiatan sama", () => {
    const j = jalurPeta(b, r);
    expect(j).toHaveLength(3);
    expect(j[0].teks).toContain("Ada pasangan");
    expect(j[2].teks).toContain("Tidak diperlukan");
  });
});

describe("ppkDaftar", () => {
  const b = hitungPeta(struktur, rab, items, detail, [], 0.9, 0.05);
  it("belum diputuskan: menunggu seluruh kekurangan", () => {
    const { rows, total } = ppkDaftar(b, {});
    expect(rows).toHaveLength(1);
    expect(total).toMatchObject({ kurang: 100000, menunggu: 100000, diterima: 0 });
    expect(teksSumber(rows[0])).toBe("Belum diputuskan");
  });
  it("terima semua: ditutup dari sisa KRO lain pada Kegiatan yang sama", () => {
    const { rows, total } = ppkDaftar(b, { "2902.BMA": { m: "semua", jum: 0 } });
    expect(rows[0]).toMatchObject({ diterima: 100000, djpb: 100000, esl: 0, dja: 0, tertunda: 0 });
    expect(total.djpb).toBe(100000);
    expect(teksSumber(rows[0])).toContain("DJPb");
  });
  it("terima sebagian dibatasi sebesar kekurangan; sisanya tertunda", () => {
    const { rows } = ppkDaftar(b, { "2902.BMA": { m: "sebagian", jum: 30000 } });
    expect(rows[0]).toMatchObject({ diterima: 30000, tertunda: 70000, menunggu: 0 });
    expect(ppkDaftar(b, { "2902.BMA": { m: "sebagian", jum: 999999999 } }).rows[0].diterima).toBe(100000);
  });
  it("tunda: tercatat di Buku selisih", () => {
    const { rows } = ppkDaftar(b, { "2902.BMA": { m: "tunda", jum: 0 } });
    expect(rows[0]).toMatchObject({ diterima: 0, tertunda: 100000 });
    expect(teksSumber(rows[0])).toContain("Buku selisih");
  });
  it("kelebihan melewati sisa Kegiatan: Eselon I (EBA 50.000 + 2903.BMA 188.889) lalu DJA", () => {
    const x = b.map((y) => (y.kro === "2902.BMA" ? { ...y, kurang: 600000 } : y.kro === "2886.EBA" ? { ...y, st: "lebih" as const, sisa: 50000, prog: "GG", keg: "2886" } : y));
    const { rows } = ppkDaftar(x, { "2902.BMA": { m: "semua", jum: 0 } });
    expect(rows[0]).toMatchObject({ djpb: 200000, esl: 238889, dja: 161111 });
  });
  it("sisa hanya dipakai sekali oleh KRO berikutnya", () => {
    const x = b.map((y) => (y.kro === "2902.BMA" ? { ...y, kurang: 150000 } : y.kro === "2903.BMA" ? { ...y, kurang: 100000, keg: "2902", Pc: 1, R: 100001 } : y));
    const { rows } = ppkDaftar(x, { "2902.BMA": { m: "semua", jum: 0 }, "2903.BMA": { m: "semua", jum: 0 } });
    expect(rows[0].djpb).toBe(150000);
    expect(rows[1].djpb).toBe(50000);
    expect(rows[1].dja).toBe(50000);
  });
});

describe("keputusanDariBasis dan urlPeta", () => {
  it("memetakan keputusan tersimpan", () => {
    expect(keputusanDariBasis([{ kro: "2902.BMA", keputusan: "sebagian", jumlah: "25000" }, { kro: "x", keputusan: "aneh", jumlah: null }])).toEqual({ "2902.BMA": { m: "sebagian", jum: 25000 } });
  });
  it("tautan", () => { expect(urlPeta(7)).toBe("/sigap/revisi/peta?jadwal=7"); expect(urlPeta(null)).toBe("/sigap/revisi/peta"); });
});
