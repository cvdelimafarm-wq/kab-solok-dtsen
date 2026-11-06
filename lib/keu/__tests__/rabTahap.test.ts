import { describe, expect, it } from "vitest";
import { infoTahap, itemBelumTerkaitSurvei, kelompokkanTahap, ringkasBarisSurvei, tahapRincian, teksMingguCair, teksSelesai } from "../rabTahap";

describe("tahapRincian", () => {
  it("pelatihan: paket, pulsa, honor instruktur, rapat persiapan", () => {
    expect(tahapRincian({ kelompok: "Pelatihan", uraian: "Pelatihan: paket fullboard di hotel" })).toBe("Pelatihan");
    expect(tahapRincian({ kelompok: "Lain-lain", uraian: "Pelatihan: pulsa peserta (mitra)" })).toBe("Pelatihan");
    expect(tahapRincian({ kelompok: "Honor", uraian: "Pelatihan: honor instruktur Nasional, BPS" })).toBe("Pelatihan");
    expect(tahapRincian({ kelompok: "Honor", uraian: "Kelas A: honor pengajar atau narasumber eksternal" })).toBe("Pelatihan");
    expect(tahapRincian({ kelompok: "Rapat", uraian: "Konsumsi rapat persiapan tatap muka" })).toBe("Pelatihan");
  });
  it("pendataan: translok, penginapan, honor petugas, rapat pelaksanaan dan evaluasi", () => {
    expect(tahapRincian({ kelompok: "Translok dan penginapan", uraian: "Translok PCL (kurang dari 8 jam)" })).toBe("Pendataan");
    expect(tahapRincian({ kelompok: "Translok dan penginapan", uraian: "Penginapan PML" })).toBe("Pendataan");
    expect(tahapRincian({ kelompok: "Honor", uraian: "Honor PCL (mitra)" })).toBe("Pendataan");
    expect(tahapRincian({ kelompok: "Rapat", uraian: "Konsumsi rapat evaluasi tatap muka" })).toBe("Pendataan");
    expect(tahapRincian({ kelompok: "Rapat", uraian: "Konsumsi rapat pelaksanaan tatap muka" })).toBe("Pendataan");
  });
  it("uraian berawalan nama kelas selalu pelatihan; lain-lain tak dikenal tetap Lain-lain", () => {
    expect(tahapRincian({ kelompok: "Translok dan penginapan", uraian: "Briefing: translok peserta" }, ["Briefing"])).toBe("Pelatihan");
    expect(tahapRincian({ kelompok: "Lain-lain", uraian: "Biaya cetak" })).toBe("Lain-lain");
    expect(tahapRincian({ kelompok: "Honor", uraian: "Honor PCL (mitra)" }, [""])).toBe("Pendataan");
  });
});

describe("kelompokkanTahap", () => {
  it("urut tahap dan membuang yang kosong", () => {
    const d = [{ t: "Pendataan" as const, n: 1 }, { t: "Pelatihan" as const, n: 2 }, { t: "Pendataan" as const, n: 3 }];
    const g = kelompokkanTahap(d, (x) => x.t);
    expect(g.map((x) => x.tahap)).toEqual(["Pelatihan", "Pendataan"]);
    expect(g[1].isi.map((x) => x.n)).toEqual([1, 3]);
  });
});

describe("infoTahap", () => {
  const libur = new Set<string>();
  it("selesai = tanggal terakhir; cair = minggu sesudahnya", () => {
    const i = infoTahap(["2026-03-02", "2026-03-10", null], 6, null, libur);
    expect(i.selesai).toBe("2026-03-10");
    expect(i.tanpaTanggal).toBe(1);
    expect(i.cair).toMatchObject({ bulan: 3, minggu: 3 }); // 10 Mar + 7 = 17 Mar -> minggu 3
  });
  it("lewat akhir bulan pindah bulan; lewat akhir tahun tetap Desember minggu 4", () => {
    expect(infoTahap(["2026-03-28"], 1, null, libur).cair).toMatchObject({ bulan: 4, minggu: 1 });
    expect(infoTahap(["2026-12-20"], 1, null, libur).cair).toMatchObject({ bulan: 12, minggu: 4 });
  });
  it("tanpa tanggal: cair null", () => {
    const i = infoTahap([null, "bukan"], 5, null, libur);
    expect(i.selesai).toBeNull();
    expect(i.cair).toBeNull();
    expect(i.tanpaTanggal).toBe(2);
  });
});

describe("teks", () => {
  it("format tanggal dan minggu", () => {
    expect(teksSelesai("2026-03-14")).toBe("14 Mar 2026 (minggu 2 Mar)");
    expect(teksSelesai(null)).toBe("belum ada tanggal");
    expect(teksMingguCair({ bulan: 9, minggu: 3 })).toBe("Minggu 3 Sep");
    expect(teksMingguCair(null)).toBe("belum bisa disarankan");
  });
});

describe("survei dan item", () => {
  it("item belum terkait survei = tanpa baris bertanda identifikasi", () => {
    const peta = [{ id: 1, baris: [] }, { id: 2, baris: [{ ident_id: null }] }, { id: 3, baris: [{ ident_id: 7 }] }, { id: 4, baris: [{}, { ident_id: 8 }] }];
    expect(itemBelumTerkaitSurvei(peta).map((p) => p.id)).toEqual([1, 2]);
  });
  it("ringkas baris per survei", () => {
    expect(ringkasBarisSurvei(7, [{ ident_id: 7, jumlah: "1000" }, { ident_id: 8, jumlah: 5 }, { ident_id: 7, jumlah: 250 }, { jumlah: 9 }])).toEqual({ n: 2, jumlah: 1250 });
  });
});

import { alokasiHari, totalAlokasi } from "../rabPerSurvei";
describe("alokasi hari translok", () => {
  const k = { kunci: "a", orang: 15, batas: 21, tarif: 50000 };
  it("maksimal = petugas x batas hari x tarif", () => {
    expect(alokasiHari(k, 0)).toEqual({ maksOrangHari: 315, isiOrangHari: 0, maksRupiah: 15750000, isiRupiah: 0 });
    expect(alokasiHari(k, 10)).toMatchObject({ isiOrangHari: 150, isiRupiah: 7500000 });
  });
  it("tanpa tarif atau petugas: rupiah null", () => {
    expect(alokasiHari({ ...k, tarif: null }, 5)).toMatchObject({ maksOrangHari: 315, maksRupiah: null, isiRupiah: null });
    expect(alokasiHari({ ...k, orang: null }, 5)).toEqual({ maksOrangHari: null, isiOrangHari: null, maksRupiah: null, isiRupiah: null });
  });
  it("total menjumlahkan yang bertarif dan menghitung yang tidak", () => {
    const t = totalAlokasi([k, { kunci: "b", orang: 2, batas: 10, tarif: null }, { kunci: "c", orang: 1, batas: 3, tarif: 100 }], { a: 1, b: 9, c: null });
    expect(t).toEqual({ maksRupiah: 15750000 + 300, isiRupiah: 750000, kolomTanpaTarif: 1 });
  });
});
