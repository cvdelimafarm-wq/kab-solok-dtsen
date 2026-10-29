// lib/keu/__tests__/rabPerSurvei.test.ts
//
// (28 Okt 2026) Uji logika layar "RAB per survei": mode per jenis belanja, kolom hari dibayar, rencana baris, pilihan item tujuan, pencocokan baris yang sudah ditulis, batang.

import { describe, expect, it } from "vitest";
import type { BarisRincian, IsiLanjutan } from "../lanjutan";
import vektorLj from "./lanjutan.vektor.json";
import type { BarisRabRow, ItemRabRow, PemetaanItem } from "../rab";
import type { ItemAnggaran } from "../ro";
import { kunciHari, type PeriodeJadwal } from "../rabSurvei";
import { GESER_CAIR_HARI, saranCair } from "../usulanRab";
import {
  bacaHari, bacaTujuan, barisSudahAda, barisTanpaPasangan, batangPerItem, berbedaDariSaran, dataAmbilAlih, dataItemBaru, dataPerbarui, hariDariTeks, jelaskanVolume, keadaanRincian, kodeTujuanBaru, kodeTujuanPok,
  kolomHari, komponenUntukAkun, langkahAlur, kunciItemBaru, modeAman, modeSemua, penandaDari, periksaNamaItem, periksaSiapLengkap, pilihanTujuan, rencanaDari, rincianCampuran, ringkasHari, ringkasSurvei, selisihSaran,
  terpasangPer, TUJUAN_TAMBAH, type ItemBaruRow,
} from "../rabPerSurvei";

const dasar = { jumlah: null, catatan: "", perk: false, tarif: 170000 } as const;
const trPpl: BarisRincian = { ...dasar, kelompok: "Translok dan penginapan", uraian: "Translok PPL (kurang dari 8 jam)", akun: "524113", volume: 3, satuan: "orang (jumlah hari menyusul)" };
const pnPpl: BarisRincian = { ...dasar, kelompok: "Translok dan penginapan", uraian: "Penginapan PPL", akun: "524114", volume: 2, satuan: "orang (jumlah malam menyusul)", tarif: 300000 };
const rapat: BarisRincian = { ...dasar, kelompok: "Rapat", uraian: "Konsumsi rapat evaluasi tatap muka", akun: "521211", volume: 8, satuan: "orang", tarif: 50000 };
const klsMar: BarisRincian = { ...dasar, kelompok: "Pelatihan", uraian: "Pelatihan Maret: konsumsi tanpa paket", akun: "521211", volume: 10, satuan: "orang-hari", tarif: 40000 };
const klsSep: BarisRincian = { ...klsMar, uraian: "Pelatihan September: konsumsi tanpa paket", volume: 14 };
const jad: PeriodeJadwal[] = [{ periode: "Maret", mulai: "2026-03-02", selesai: "2026-03-06" }, { periode: "September", mulai: "2026-09-01", selesai: "2026-09-03" }];
const semua = [trPpl, pnPpl, rapat, klsMar, klsSep];

describe("mode per jenis belanja", () => {
  it("modeAman: nilai tidak sah diganti bawaan", () => {
    expect(modeAman(null)).toEqual(modeSemua("periode"));
    expect(modeAman({ Honor: "gabung", Rapat: "ngawur" }).Honor).toBe("gabung");
    expect(modeAman({ Honor: "gabung", Rapat: "ngawur" }).Rapat).toBe("periode");
    expect(modeAman("x", "gabung")).toEqual(modeSemua("gabung"));
  });
  it("jenis belanja berbeda boleh berbeda mode", () => {
    const hb = { [kunciHari(trPpl, "Maret")]: 5, [kunciHari(trPpl, "September")]: 3 };
    const m = { ...modeSemua("periode"), "Translok dan penginapan": "gabung" as const };
    const r = rincianCampuran([trPpl, rapat], jad, m, hb);
    expect(r.map((x) => [x.kelompok, x.uraian, x.volume])).toEqual([
      ["Translok dan penginapan", "Translok PPL (kurang dari 8 jam)", 24],
      ["Rapat", "Konsumsi rapat evaluasi tatap muka Maret", 8],
      ["Rapat", "Konsumsi rapat evaluasi tatap muka September", 8],
    ]);
  });
  it("urutan mengikuti kelompok, kunci unik", () => {
    const r = rincianCampuran(semua, jad, modeSemua("periode"));
    expect(r.map((x) => x.kelompok)).toEqual(["Pelatihan", "Pelatihan", "Translok dan penginapan", "Translok dan penginapan", "Translok dan penginapan", "Translok dan penginapan", "Rapat", "Rapat"]);
    expect(new Set(r.map((x) => x.kunci)).size).toBe(r.length);
  });
});

describe("hari dibayar", () => {
  it("kolomHari: tiap rincian lapangan x periode; batas = hari KALENDER, libur tidak mengurangi (penginapan: -1)", () => {
    const k = kolomHari(semua, jad, new Set(["2026-03-04"]));
    expect(k.map((x) => [x.uraian, x.periode, x.maks, x.batas, x.penginapan])).toEqual([
      ["Translok PPL (kurang dari 8 jam)", "Maret", 5, 5, false],
      ["Translok PPL (kurang dari 8 jam)", "September", 3, 3, false],
      ["Penginapan PPL", "Maret", 5, 4, true],
      ["Penginapan PPL", "September", 3, 2, true],
    ]);
    expect(k[0].kunci).toBe(kunciHari(trPpl, "Maret"));
  });
  it("bacaHari dan hariDariTeks", () => {
    expect([bacaHari("5"), bacaHari(" 12 "), bacaHari(""), bacaHari("-1"), bacaHari("2,5"), bacaHari("999"), bacaHari("0")]).toEqual([5, 12, null, null, null, null, 0]);
    expect(hariDariTeks({ a: "3", b: "", c: "x", d: "0" })).toEqual({ a: 3, d: 0 });
  });
});

describe("rencana baris", () => {
  const isi = { v: 1, wilayah: "", kelas: [{ nama: "Pelatihan Maret", sesi: "pelatihan", selesai: "2026-03-10" }], peran: {}, petugas: [] } as unknown as IsiLanjutan;
  it("isian awal = saran; jadwal cair dari hari terakhir periode (10 hari kerja)", () => {
    const hb = { [kunciHari(trPpl, "Maret")]: 5 };
    const rs = rincianCampuran([trPpl], jad, modeSemua("periode"), hb);
    const rc = rencanaDari(rs, isi, jad, 9, 10, new Set(), "Identifikasi IMK v1");
    expect(rc[0].saran.volume).toBe("15");
    expect(rc[0].saran.harga).toBe("170000");
    expect(rc[0].saran.satuan).toBe("orang-hari");
    expect(rc[0].selesai).toBe("2026-03-06");
    expect(rc[0].lambat).toBe("2026-03-20");
    expect(rc[0].saran.bulan_mulai).toBe(3);
    expect(rc[0].saran.minggu).toBe(2); // 6 Mar + 7 hari = 13 Mar -> minggu 2
    expect(rc[0].saran.ket.endsWith("· Identifikasi IMK v1")).toBe(true);
    expect(rc[0].batasHarga).toBe(170000);
    expect(rc[1].saran.volume).toBe(""); // hari September belum diisi
    expect(rc[1].selesai).toBe("2026-09-03");
  });
  it("tarif belum ada -> harga kosong, batas null", () => {
    const rs = rincianCampuran([{ ...trPpl, tarif: null }], [jad[0]], modeSemua("periode"), { [kunciHari(trPpl, "Maret")]: 2 });
    const rc = rencanaDari(rs, isi, [jad[0]], 3, 10, new Set(), "S");
    expect(rc[0].saran.harga).toBe("");
    expect(rc[0].batasHarga).toBeNull();
  });
  it("jadwal cair otomatis = hari terakhir kegiatan + 1 minggu; batas lambat tetap dari hari terakhir; lintas tahun tetap di Desember", () => {
    expect(saranCair("2026-11-25", { bulan: 9 }, 10, new Set(), GESER_CAIR_HARI)).toEqual({ bulan: 12, minggu: 1, lambat: "2026-12-09" });
    expect(saranCair("2026-11-25", { bulan: 9 }, 10)).toEqual({ bulan: 11, minggu: 4, lambat: "2026-12-09" }); // tanpa geser: perilaku lama
    expect(saranCair("2026-03-10", { bulan: 9 }, 10, new Set(), 7)).toMatchObject({ bulan: 3, minggu: 3 });
    expect(saranCair("2026-12-28", { bulan: 9 }, 10, new Set(), 7)).toMatchObject({ bulan: 12, minggu: 4 });
    expect(saranCair(null, { bulan: 9 }, 10, new Set(), 7)).toEqual({ bulan: 9, minggu: 3, lambat: null });
  });
  it("penandaDari dan berbedaDariSaran", () => {
    const p = penandaDari(7, 2, { kunci: "524113|X" }, { volume: "15", harga: "170000" });
    expect(p).toEqual({ ident_id: 7, ident_ver: 2, ident_kunci: "524113|X", ident_vol: 15, ident_harga: 170000 });
    expect(penandaDari(7, 2, { kunci: "k" }, { volume: "", harga: "" })).toMatchObject({ ident_vol: null, ident_harga: null });
    expect(berbedaDariSaran({ volume: "15", harga: "170000" }, { volume: "15", harga: "170000" })).toBe(false);
    expect(berbedaDariSaran({ volume: "15", harga: "170000" }, { volume: "12", harga: "170000" })).toBe(true);
    expect(berbedaDariSaran({ volume: "15", harga: "170000" }, { volume: "15,00", harga: "150000" })).toBe(true);
    expect(berbedaDariSaran({ volume: "", harga: "" }, { volume: "3", harga: "5000" })).toBe(false);
  });
});

// ---- item POK
const pok = (id: number, akun: string, uraian: string, status: PemetaanItem["status"] = "belum", komponen = "051", nilai = 10_000_000): PemetaanItem => ({
  pok: { detail_id: id, kunci: `k${id}`, komponen, akun, nomor_item: String(id), uraian, volume: 100, satuan: "OK", pok: nilai, realisasi: 0, rab: null, statusRab: null, selesai: false } as ItemAnggaran,
  rab: null, baris: [], jumlahRab: 0, selisih: null, status,
});
const baru = (id: number, akun: string, uraian: string, selesai = false): ItemBaruRow => ({ id, akun_kode: akun, uraian, satuan: "PAKET", komponen_kode: "051", selesai });
const r1 = { uraian: "Translok PPL (kurang dari 8 jam) Maret", akun: "524113", kelompok: "Translok dan penginapan" as const };

describe("pilihanTujuan", () => {
  it("satu item cocok -> terpilih awal", () => {
    const p = pilihanTujuan(r1, [pok(1, "524113", "Transport lokal pendataan")], [], "IMK");
    expect(p.hasil.status).toBe("cocok");
    expect(p.awal).toBe(kodeTujuanPok(1));
    expect(p.opsi.map((o) => o.jenis)).toEqual(["pok", "tambah"]);
  });
  it("nama belum menggambarkan -> perlu_nama; satu-satunya item tetap jadi pilihan awal", () => {
    const p = pilihanTujuan(r1, [pok(1, "524113", "Biaya perjalanan lainnya")], [], "IMK");
    expect(p.hasil.status).toBe("perlu_nama");
    expect(p.awal).toBe(kodeTujuanPok(1));
    expect(p.hasil.saranNama).toBe("Transport lokal petugas pendataan IMK");
  });
  it("beberapa item cocok -> pengguna memilih", () => {
    const p = pilihanTujuan(r1, [pok(1, "524113", "Transport lokal A"), pok(2, "524113", "Transport lokal B")], [], "IMK");
    expect(p.awal).toBe("");
    expect(p.opsi.filter((o) => o.jenis === "pok")).toHaveLength(2);
  });
  it("tidak ada item akun itu -> tambah item baru; bila sudah ada item baru beakun sama, itu yang dipilih", () => {
    expect(pilihanTujuan(r1, [pok(1, "521211", "Konsumsi")], [], "IMK").awal).toBe(TUJUAN_TAMBAH);
    const p = pilihanTujuan(r1, [pok(1, "521211", "Konsumsi")], [baru(9, "524113", "Transport lokal petugas pendataan IMK"), baru(10, "521211", "Lain")], "IMK");
    expect(p.awal).toBe(kodeTujuanBaru(9));
    expect(p.opsi.map((o) => o.nilai)).toEqual([kodeTujuanBaru(9), TUJUAN_TAMBAH]);
  });
  it('item "RAB = Item" dan "Selesai" tidak ditawarkan; item baru selesai disembunyikan', () => {
    const p = pilihanTujuan(r1, [pok(1, "524113", "Transport lokal", "sama"), pok(2, "524113", "Transport lokal", "selesai")], [baru(9, "524113", "x", true)], "IMK");
    expect(p.opsi.map((o) => o.jenis)).toEqual(["tambah"]);
    expect(p.awal).toBe("");
  });
  it("bacaTujuan", () => {
    expect(bacaTujuan("pok:12")).toEqual({ jenis: "pok", id: 12 });
    expect(bacaTujuan("baru:3")).toEqual({ jenis: "baru", id: 3 });
    expect(bacaTujuan("tambah")).toEqual({ jenis: "tambah" });
    expect(bacaTujuan("pok:x")).toBeNull();
    expect(bacaTujuan("")).toBeNull();
  });
});

describe("item baru", () => {
  it("komponenUntukAkun: komponen item beakun sama, kalau tidak ada yang paling banyak", () => {
    const peta = [pok(1, "521211", "a", "belum", "052"), pok(2, "524113", "b", "belum", "051"), pok(3, "524114", "c", "belum", "051")];
    expect(komponenUntukAkun("521211", peta)).toBe("052");
    expect(komponenUntukAkun("522151", peta)).toBe("051");
    expect(komponenUntukAkun("522151", [])).toBeNull();
  });
  it("periksaNamaItem, kunciItemBaru, dataItemBaru", () => {
    expect(periksaNamaItem("ab")).toMatch(/minimal 3/);
    expect(periksaNamaItem("x".repeat(201))).toMatch(/maksimal 200/);
    expect(periksaNamaItem("Transport lokal IMK")).toBeNull();
    expect(kunciItemBaru("524113", "  Transport  Lokal IMK ")).toBe(kunciItemBaru("524113.xx", "transport lokal imk"));
    expect(dataItemBaru(5, { akun: "524113", nama: "  Transport   lokal ", satuan: "orang-hari", komponen: "051" })).toEqual({
      rab_id: 5, pok_kunci: null, komponen_kode: "051", akun_kode: "524113", uraian: "Transport lokal", satuan: "orang-hari", prioritas_kode: null,
    });
  });
});

// ---- baris yang sudah ditulis
const brs = (o: Partial<BarisRabRow> & { baris_id: number; item_id: number }): BarisRabRow => ({
  urut: 1, ket: "", volume: 15, satuan: "orang-hari", harga_satuan: 170000, jumlah: 2550000, jumlah_dikunci: false, sama_dengan_item: false, periode: "sekali", bulan_mulai: 3, bulan_sampai: 3, minggu: 3,
  manual: false, catatan: "", tautan: null, ...o,
} as unknown as BarisRabRow);
const itm = (id: number, kunci: string | null): ItemRabRow => ({ id, pok_kunci: kunci, selesai: false, prioritas_kode: null });

describe("baris yang sudah ditulis dari identifikasi", () => {
  const b1 = brs({ baris_id: 1, item_id: 10, ident_id: 7, ident_ver: 1, ident_kunci: "A", ident_vol: 15, ident_harga: 170000 });
  const b2 = brs({ baris_id: 2, item_id: 10, ident_id: 7, ident_ver: 1, ident_kunci: "B", ident_vol: 15, ident_harga: 170000, volume: 12 });
  const b3 = brs({ baris_id: 3, item_id: 10, ident_id: 8, ident_ver: 1, ident_kunci: "A", ident_vol: 1, ident_harga: 1 });
  const b4 = brs({ baris_id: 4, item_id: 11 });
  const b5 = brs({ baris_id: 5, item_id: 10, ident_id: 7, ident_ver: 1, ident_kunci: "A", ident_vol: 15, ident_harga: 170000 });
  it("terpasangPer: hanya identifikasi ini; kunci kembar -> baris pertama; tanda diubah", () => {
    const t = terpasangPer(7, [b5, b1, b2, b3, b4], [itm(10, "k1")]);
    expect([...t.keys()].sort()).toEqual(["A", "B"]);
    expect(t.get("A")?.baris.baris_id).toBe(1);
    expect(t.get("A")?.diubah).toBe(false);
    expect(t.get("B")?.diubah).toBe(true);
  });
  it("barisTanpaPasangan: kunci tak lagi ada pada rincian", () => {
    expect(barisTanpaPasangan(7, [{ kunci: "A" }], [b1, b2, b3, b4]).map((b) => b.baris_id)).toEqual([2]);
  });
  it("selisihSaran: saran sekarang dibanding saran saat disalin", () => {
    const t = terpasangPer(7, [b1], [itm(10, "k1")]).get("A")!;
    expect(selisihSaran({ volume: 15, tarif: 170000 }, t)).toEqual({ berubah: false, volume: false, harga: false });
    expect(selisihSaran({ volume: 18, tarif: 170000 }, t)).toEqual({ berubah: true, volume: true, harga: false });
    expect(selisihSaran({ volume: 15, tarif: 150000 }, t)).toEqual({ berubah: true, volume: false, harga: true });
    expect(selisihSaran({ volume: null, tarif: null }, t).berubah).toBe(false);
  });
  it("dataPerbarui: hanya bagian yang berubah", () => {
    const ubah = { volume: true, harga: true };
    expect(dataPerbarui({ volume: "18", harga: "150000" }, 3, ubah)).toEqual({ volume: 18, ident_vol: 18, harga_satuan: 150000, ident_harga: 150000, ident_ver: 3, jumlah_tetap: null, sama_dengan_item: false });
    expect(dataPerbarui({ volume: "18", harga: "150000" }, 3, { volume: true, harga: false })).toEqual({ volume: 18, ident_vol: 18, ident_ver: 3, jumlah_tetap: null, sama_dengan_item: false });
    expect(dataPerbarui({ volume: "", harga: "150000" }, 3, { volume: true, harga: false })).toBeNull();
    expect(dataPerbarui({ volume: "18", harga: "150000" }, 3, { volume: false, harga: false })).toBeNull();
  });
});

describe("keadaan dan ringkasan", () => {
  const rs = rincianCampuran([trPpl, rapat], [jad[0]], modeSemua("periode"));
  const rc = rencanaDari(rs, { kelas: [] } as unknown as IsiLanjutan, [jad[0]], 3, 10, new Set(), "S");
  it("isi_hari bila translok belum punya hari; belum_angka; siap; sudah", () => {
    expect(keadaanRincian(rc[0], false, rc[0].saran)).toBe("isi_hari");
    expect(keadaanRincian(rc[1], false, rc[1].saran)).toBe("siap");
    expect(keadaanRincian(rc[1], false, { ...rc[1].saran, harga: "" })).toBe("belum_angka");
    expect(keadaanRincian(rc[0], false, { ...rc[0].saran, volume: "6", harga: "170000" })).toBe("siap");
    expect(keadaanRincian(rc[1], true, rc[1].saran)).toBe("sudah");
  });
  it("ringkasSurvei", () => {
    expect(ringkasSurvei([{ k: "sudah", jumlah: 100 }, { k: "siap", jumlah: 50 }, { k: "siap", jumlah: null }, { k: "isi_hari", jumlah: null }, { k: "belum_angka", jumlah: null }]))
      .toEqual({ jumlah: 5, sudah: 1, siap: 2, isiHari: 1, belumAngka: 1, butuh: 0, totalSiap: 50, totalSudah: 100 });
    expect(ringkasSurvei([{ k: "butuh_item", jumlah: 10 }, { k: "cek_dobel", jumlah: 10 }, { k: "siap", jumlah: 5 }])).toMatchObject({ jumlah: 3, siap: 1, butuh: 2, totalSiap: 5 });
  });
});

describe("batangPerItem", () => {
  const p = pok(1, "524113", "Transport lokal", "rinci");
  p.baris = [brs({ baris_id: 1, item_id: 10, ident_id: 7, ident_kunci: "A", volume: 2, jumlah: 400, ident_vol: 2, ident_harga: 200 }), brs({ baris_id: 2, item_id: 10, volume: 1, jumlah: 100 })];
  const nama = new Map([[7, "IMK bulanan"], [8, "IMK tahunan"]]);
  it("memuat baris yang ada dan rincian yang akan disalin; baris di luar identifikasi = Lainnya", () => {
    const b = batangPerItem([p], [], [], nama, [{ tujuan: kodeTujuanPok(1), identId: 8, jumlah: 700, volume: 5 }]);
    expect(b).toHaveLength(1);
    expect(b[0].kap).toEqual({ volume: 100, pagu: 10_000_000 });
    expect(b[0].sumbangan.map((s) => [s.nama, s.jumlah])).toEqual([["IMK bulanan", 400], ["Lainnya (di luar identifikasi)", 100], ["IMK tahunan", 700]]);
  });
  it("item tanpa baris identifikasi dan tanpa rencana tidak ditampilkan; rencana yang menyasar item lain tidak tercampur", () => {
    const q = pok(2, "521211", "Konsumsi");
    expect(batangPerItem([q], [], [], nama, [])).toEqual([]);
    expect(batangPerItem([q], [], [], nama, [{ tujuan: kodeTujuanPok(1), identId: 8, jumlah: 1, volume: 1 }])).toEqual([]);
  });
  it("item baru: tanpa kapasitas POK", () => {
    const b = batangPerItem([], [baru(9, "524113", "Transport baru")], [brs({ baris_id: 9, item_id: 9, ident_id: 7, ident_kunci: "A", volume: 3, jumlah: 900 })], nama, [{ tujuan: kodeTujuanBaru(9), identId: 7, jumlah: 100, volume: 1 }]);
    expect(b[0].kap).toBeNull();
    expect(b[0].sumbangan).toEqual([expect.objectContaining({ nama: "IMK bulanan", volume: 4, jumlah: 1000 })]);
  });
  it("nama survei tidak dikenal diberi nama cadangan", () => {
    const b = batangPerItem([p], [], [], new Map(), []);
    expect(b[0].sumbangan[0].nama).toBe("Survei #7");
  });
});

describe("keadaan baru: butuh item dan cek dobel", () => {
  const rs = rincianCampuran([rapat], jad, modeSemua("gabung"));
  const rc = rencanaDari(rs, { v: 1, wilayah: "", kelas: [], peran: {}, petugas: [] } as unknown as IsiLanjutan, jad, 3, 10, new Set(), "S")[0];
  const isian = { ...rc.saran, volume: "8", harga: "50000" };
  it("urutan penilaian", () => {
    expect(keadaanRincian(rc, false, isian)).toBe("siap");
    expect(keadaanRincian(rc, false, isian, { tujuan: "pok:1", dobel: false })).toBe("siap");
    expect(keadaanRincian(rc, false, isian, { tujuan: "", dobel: false })).toBe("butuh_item");
    expect(keadaanRincian(rc, false, isian, { tujuan: "pok:1", dobel: true })).toBe("cek_dobel");
    expect(keadaanRincian(rc, false, { ...isian, harga: "" }, { tujuan: "", dobel: true })).toBe("belum_angka"); // angka dulu
    expect(keadaanRincian(rc, true, isian, { tujuan: "", dobel: true })).toBe("sudah");
  });
});

describe("periksaSiapLengkap", () => {
  const r = (o: Partial<Parameters<typeof periksaSiapLengkap>[1]> = {}) => ({ siap: 0, butuh: 0, isiHari: 0, belumAngka: 0, ...o });
  it("belum ada rincian di RAB -> ditolak", () => {
    expect(periksaSiapLengkap(0, r()).galat).toContain("sedikitnya satu rincian");
  });
  it("masih ada rincian ber-angka yang belum masuk RAB -> ditolak", () => {
    const x = periksaSiapLengkap(3, r({ siap: 2, butuh: 1 }));
    expect(x.galat).toContain("3 rincian");
    expect(x.galat).toContain("2 siap disusun");
    expect(x.galat).toContain("1 butuh keputusan");
  });
  it("rincian tanpa angka hanya peringatan", () => {
    const x = periksaSiapLengkap(3, r({ isiHari: 1, belumAngka: 2 }));
    expect(x.galat).toBeNull();
    expect(x.peringatan).toContain("3 rincian belum punya angka");
  });
  it("lengkap -> boleh tanpa peringatan", () => {
    expect(periksaSiapLengkap(4, r())).toEqual({ galat: null, peringatan: null });
  });
});

describe("ringkasHari", () => {
  it("petugas x hari = orang-hari", () => {
    expect(ringkasHari(18, 24)).toBe("18 petugas × 24 hari = 432 orang-hari");
    expect(ringkasHari(18, 23, true)).toBe("18 petugas × 23 malam = 414 orang-malam");
    expect(ringkasHari(null, 5)).toContain("5 hari dibayar per petugas");
    expect(ringkasHari(0, 5)).toContain("belum diidentifikasi");
  });
});

describe("jelaskanVolume", () => {
  const isiLj = vektorLj.base as unknown as IsiLanjutan; // kelas "Pelatihan Triwulan I": pml 1 organik + 1 mitra, ppl 2 mitra; 2 hari
  const kls = (uraian: string, extra: Partial<BarisRincian> = {}): ReturnType<typeof rincianCampuran>[number] => ({ ...dasar, kelompok: "Pelatihan", uraian, akun: "521211", volume: 8, satuan: "orang-hari", tarif: null, kunci: "k", periode: null, hari: null, ...extra });
  it("kelas: rincian peserta per peran x hari kelas", () => {
    const t = jelaskanVolume(kls("Pelatihan Triwulan I: konsumsi tanpa paket"), isiLj).join("\n");
    expect(t).toContain("PML: 1 organik + 1 mitra = 2 orang");
    expect(t).toContain("PPL: 0 organik + 2 mitra = 2 orang");
    expect(t).toContain("Volume = 4 × 2 = 8 orang-hari");
  });
  it("kelas pada mode gabung (nama periode dilepas) tetap ditemukan", () => {
    const k0 = (isiLj as unknown as { kelas: Record<string, unknown>[] }).kelas[0];
    const dua = { ...isiLj, kelas: [k0, { ...k0, id: "k2", nama: "Pelatihan Triwulan III", periode: "Triwulan III", oh: 1 }] } as unknown as IsiLanjutan;
    const t = jelaskanVolume(kls("Pelatihan: konsumsi tanpa paket", { volume: 12 }), dua).join("\n");
    expect(t).toContain("Pelatihan Triwulan I: 4 peserta × 2 hari = 8 orang-hari");
    expect(t).toContain("Pelatihan Triwulan III: 4 peserta × 1 hari = 4 orang-hari");
    expect(t).toContain("Volume gabungan = 12 orang-hari");
  });
  it("translok: petugas x hari kalender; hari belum diisi -> petunjuk", () => {
    const tr = (hari: number | null, volume: number | null, periode: string | null) => ({ ...kls("Translok PPL (kurang dari 8 jam)"), kelompok: "Translok dan penginapan" as const, hari, volume, periode });
    expect(jelaskanVolume(tr(24, 72, "Maret"), isiLj).join(" ")).toContain("3 petugas × 24 hari = 72 orang-hari");
    expect(jelaskanVolume(tr(24, 72, "Maret"), isiLj).join(" ")).toContain("HARI KALENDER");
    expect(jelaskanVolume(tr(null, null, "Maret"), isiLj).join(" ")).toContain("Isi alokasi hari dibayar");
    expect(jelaskanVolume(tr(30, 90, null), isiLj).join(" ")).toContain("Dijumlahkan dari tiap periode");
  });
  it("honor petugas, rapat, dan cadangan", () => {
    expect(jelaskanVolume(kls("Honor PPL (mitra)", { kelompok: "Honor" }), isiLj)[0]).toContain("harga satuan diisi sendiri");
    expect(jelaskanVolume(kls("Konsumsi rapat evaluasi", { kelompok: "Rapat", catatan: "x" }), isiLj)[0]).toContain("isi volume sendiri");
    expect(jelaskanVolume(kls("Lain", { kelompok: "Lain-lain", catatan: "Catatan ini" }), isiLj)).toEqual(["Catatan ini"]);
  });
});

describe("baris yang sudah ada pada item tujuan (cegah dobel)", () => {
  const p = pok(1, "521211", "Konsumsi", "rinci");
  p.baris = [brs({ baris_id: 1, item_id: 10, volume: 5, jumlah: 100 }), brs({ baris_id: 2, item_id: 10, ident_id: 7, ident_kunci: "A", volume: 2, jumlah: 40 })];
  it("hanya baris tanpa penanda identifikasi", () => {
    expect(barisSudahAda(kodeTujuanPok(1), [p], []).map((b) => b.baris_id)).toEqual([1]);
    expect(barisSudahAda(kodeTujuanPok(99), [p], [])).toEqual([]);
    expect(barisSudahAda("tambah", [p], [])).toEqual([]);
    expect(barisSudahAda("", [p], [])).toEqual([]);
  });
  it("item baru di RAB", () => {
    const b = [brs({ baris_id: 5, item_id: 9, volume: 1, jumlah: 1 }), brs({ baris_id: 6, item_id: 9, ident_id: 7, ident_kunci: "B", volume: 1, jumlah: 1 }), brs({ baris_id: 7, item_id: 3, volume: 1, jumlah: 1 })];
    expect(barisSudahAda(kodeTujuanBaru(9), [], b).map((x) => x.baris_id)).toEqual([5]);
  });
  it("dataAmbilAlih: isian + penanda, melepas kunci jumlah, tanpa item/urut", () => {
    const d = dataAmbilAlih({ ket: "k", volume: "8", satuan: "orang", harga: "50000", periode: "sekali", bulan_mulai: 3, bulan_sampai: 3, minggu: 2 }, { ident_id: 7, ident_ver: 2, ident_kunci: "K", ident_vol: 8, ident_harga: 50000 });
    expect(d).toMatchObject({ volume: 8, harga_satuan: 50000, ident_id: 7, ident_kunci: "K", jumlah_tetap: null, sama_dengan_item: false });
    expect(d).not.toHaveProperty("item_id");
    expect(d).not.toHaveProperty("urut");
  });
});

describe("langkahAlur", () => {
  const dasarA = { lanjutanAda: false, lanjutanVer: null, lanjutanStatus: null, jumlah: 5, sudah: 0, siap: false, berubah: 0 };
  it("empat langkah berurutan; lanjutan belum ada -> menunggu", () => {
    const a = langkahAlur(dasarA);
    expect(a.map((x) => x.no)).toEqual([1, 2, 3, 4]);
    expect(a.map((x) => x.keadaan)).toEqual(["selesai", "berjalan", "menunggu", "menunggu"]);
    expect(a[2].ket).toContain("Belum dibuat");
    expect(a[0].tautan).toBe("identifikasi"); expect(a[2].tautan).toBe("lanjutan");
  });
  it("RAB lengkap dan lanjutan ada -> semua selesai; ada selisih -> langkah 4 berjalan", () => {
    const ok = langkahAlur({ ...dasarA, lanjutanAda: true, lanjutanVer: 2, lanjutanStatus: "final", sudah: 5, siap: true });
    expect(ok.map((x) => x.keadaan)).toEqual(["selesai", "selesai", "selesai", "selesai"]);
    expect(ok[2].ket).toContain("versi 2, final");
    expect(ok[1].ket).toContain("5 dari 5");
    const beda = langkahAlur({ ...dasarA, lanjutanAda: true, lanjutanVer: 2, lanjutanStatus: "draf", sudah: 5, berubah: 2 });
    expect(beda[3].keadaan).toBe("berjalan"); expect(beda[3].ket).toContain("2 rincian berbeda");
  });
  it("tanpa rincian sama sekali: RAB belum dianggap selesai", () => {
    expect(langkahAlur({ ...dasarA, jumlah: 0 })[1].keadaan).toBe("berjalan");
  });
});
