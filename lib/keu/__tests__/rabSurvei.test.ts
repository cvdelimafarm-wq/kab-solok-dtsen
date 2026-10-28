import { describe, expect, it } from "vitest";
import type { BarisRincian } from "../lanjutan";
import type { ItemAnggaran } from "../ro";
import { hariJadwal, jumlahSurvei, kataKunci, rincianSurvei, ringkasTautan, saranNamaItem, tautkan, type PeriodeJadwal } from "../rabSurvei";

const dasar = { jumlah: null, catatan: "", perk: false, tarif: 170000 } as const;
const trPpl: BarisRincian = { ...dasar, kelompok: "Translok dan penginapan", uraian: "Translok PPL (kurang dari 8 jam)", akun: "524113", volume: 3, satuan: "orang (jumlah hari menyusul)" };
const trPml: BarisRincian = { ...dasar, kelompok: "Translok dan penginapan", uraian: "Translok PML (kurang dari 8 jam)", akun: "524113", volume: 2, satuan: "orang (jumlah hari menyusul)" };
const rapat: BarisRincian = { ...dasar, kelompok: "Rapat", uraian: "Konsumsi rapat evaluasi tatap muka", akun: "521211", volume: null, satuan: "orang", tarif: 50000 };
const klsMar: BarisRincian = { ...dasar, kelompok: "Pelatihan", uraian: "Pelatihan Maret: konsumsi tanpa paket", akun: "521211", volume: 10, satuan: "orang-hari", tarif: 40000 };
const klsSep: BarisRincian = { ...klsMar, uraian: "Pelatihan September: konsumsi tanpa paket", volume: 14 };
const jad: PeriodeJadwal[] = [{ periode: "Maret", mulai: "2026-03-01", selesai: "2026-03-05" }, { periode: "September", mulai: "2026-09-01", selesai: "2026-09-03" }];

describe("hariJadwal", () => {
  it("inklusif; 0 bila belum lengkap atau terbalik", () => {
    expect(hariJadwal("2026-03-01", "2026-03-05")).toBe(5);
    expect(hariJadwal("2026-03-01", "2026-03-01")).toBe(1);
    expect(hariJadwal("", "2026-03-01")).toBe(0);
    expect(hariJadwal("2026-03-05", "2026-03-01")).toBe(0);
  });
});

describe("rincianSurvei", () => {
  it("per periode: translok orang x hari, satu rincian per peran per periode", () => {
    const r = rincianSurvei([trPpl, trPml], jad, "periode");
    expect(r.map((x) => [x.uraian, x.volume, x.satuan])).toEqual([
      ["Translok PPL (kurang dari 8 jam) Maret", 15, "orang-hari"],
      ["Translok PPL (kurang dari 8 jam) September", 9, "orang-hari"],
      ["Translok PML (kurang dari 8 jam) Maret", 10, "orang-hari"],
      ["Translok PML (kurang dari 8 jam) September", 6, "orang-hari"],
    ]);
    expect(r[0].jumlah).toBe(15 * 170000);
    expect(r[0].periode).toBe("Maret");
  });
  it("gabung: satu rincian per peran, volume dijumlahkan", () => {
    const r = rincianSurvei([trPpl, trPml], jad, "gabung");
    expect(r.map((x) => [x.uraian, x.volume])).toEqual([["Translok PPL (kurang dari 8 jam)", 24], ["Translok PML (kurang dari 8 jam)", 16]]);
    expect(jumlahSurvei(r).total).toBe(40 * 170000);
  });
  it("jadwal belum lengkap: volume null dengan catatan; gabung ikut null", () => {
    const j2 = [{ periode: "Maret", mulai: "2026-03-01", selesai: "2026-03-05" }, { periode: "September", mulai: "", selesai: "" }];
    const p = rincianSurvei([trPpl], j2, "periode");
    expect(p[1].volume).toBeNull(); expect(p[1].catatan).toContain("September");
    const g = rincianSurvei([trPpl], j2, "gabung");
    expect(g[0].volume).toBeNull(); expect(g[0].jumlah).toBeNull();
  });
  it("penginapan = orang x (hari - 1) malam", () => {
    const pen: BarisRincian = { ...trPpl, uraian: "Penginapan PPL", akun: "524111", tarif: null };
    const r = rincianSurvei([pen], jad, "periode");
    expect(r.map((x) => [x.volume, x.satuan])).toEqual([[12, "orang-malam"], [6, "orang-malam"]]);
  });
  it("rapat dikembangkan per periode, atau satu bila gabung", () => {
    expect(rincianSurvei([rapat], jad, "periode").map((x) => x.uraian)).toEqual(["Konsumsi rapat evaluasi tatap muka Maret", "Konsumsi rapat evaluasi tatap muka September"]);
    expect(rincianSurvei([rapat], jad, "gabung")).toHaveLength(1);
  });
  it("baris kelas tetap per periode; gabung menyatukan dan menjumlahkan", () => {
    expect(rincianSurvei([klsMar, klsSep], jad, "periode").map((x) => [x.periode, x.volume])).toEqual([["Maret", 10], ["September", 14]]);
    const g = rincianSurvei([klsMar, klsSep], jad, "gabung");
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ uraian: "Pelatihan: konsumsi tanpa paket", volume: 24, jumlah: 24 * 40000 });
  });
  it("tanpa periode: nama periode tidak ditempel", () => {
    const r = rincianSurvei([trPpl], [{ periode: "Kegiatan", mulai: "2026-03-01", selesai: "2026-03-05" }], "periode");
    expect(r[0].uraian).toBe("Translok PPL (kurang dari 8 jam)");
    expect(r[0].volume).toBe(15);
  });
  it("kunci unik", () => {
    const r = rincianSurvei([trPpl, trPpl], [jad[0]], "periode");
    expect(new Set(r.map((x) => x.kunci)).size).toBe(2);
  });
});

const item = (id: number, akun: string, uraian: string): ItemAnggaran => ({ detail_id: id, kunci: `k${id}`, komponen: "051", akun, nomor_item: String(id), uraian, volume: 1, satuan: "OK", pok: 0, realisasi: 0, rab: null, statusRab: null, selesai: false } as unknown as ItemAnggaran);

describe("tautkan", () => {
  it("translok PPL dan PML menaut ke SATU item POK", () => {
    const items = [item(1, "524113", "Transport lokal petugas pendataan")];
    const a = tautkan({ ...trPpl, uraian: trPpl.uraian }, items, "Susenas");
    const b = tautkan({ ...trPml, uraian: trPml.uraian }, items, "Susenas");
    expect(a.status).toBe("cocok"); expect(b.status).toBe("cocok");
    expect(a.pilihan?.detail_id).toBe(1); expect(b.pilihan?.detail_id).toBe(1);
  });
  it("belum ada akun -> belum_ada dengan saran nama", () => {
    const h = tautkan(trPpl, [item(1, "521211", "Konsumsi rapat")], "Susenas");
    expect(h.status).toBe("belum_ada");
    expect(h.saranNama).toBe("Transport lokal petugas pendataan Susenas");
  });
  it("akun ada tetapi nama tidak sesuai -> perlu_nama", () => {
    const h = tautkan(trPpl, [item(1, "524113", "Perjalanan dalam kota kegiatan lain")], "Susenas");
    expect(h.status).toBe("perlu_nama");
    expect(h.pilihan?.detail_id).toBe(1);
    expect(h.saranNama).toContain("Susenas");
  });
  it("beberapa item cocok: pilihan kosong", () => {
    const h = tautkan(trPpl, [item(1, "524113", "Transport lokal A"), item(2, "524113", "Transport lokal B")], "X");
    expect(h.status).toBe("cocok"); expect(h.pilihan).toBeNull(); expect(h.kandidat).toHaveLength(2);
  });
  it("akun tanpa kata kunci: semua beakun sama dianggap cocok", () => {
    const h = tautkan({ kelompok: "Honor", uraian: "Pelatihan: honor pengajar", akun: "522151" }, [item(1, "522151", "Honor apa saja")], "X");
    expect(h.status).toBe("cocok");
  });
  it("kata kunci dan ringkasan", () => {
    expect(kataKunci(trPpl)).toContain("transport");
    expect(saranNamaItem({ kelompok: "Rapat", uraian: "Konsumsi rapat", akun: "521211" }, "S")).toBe("Belanja bahan S");
    const r = ringkasTautan([tautkan(trPpl, [], "S"), tautkan(trPpl, [item(1, "524113", "Transport lokal")], "S")]);
    expect(r).toEqual({ cocok: 1, perlu_nama: 0, belum_ada: 1, belumDipilih: 1 });
  });
});
