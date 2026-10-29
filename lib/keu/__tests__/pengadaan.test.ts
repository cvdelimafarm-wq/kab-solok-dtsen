// lib/keu/__tests__/pengadaan.test.ts
//
// (26 Okt 2026, tahap 34) Uji draf pengadaan: item dari kelas, rapat, instrumen, dan cetak buku; nilai hanya bila tarif ada; hal yang masih perlu dilengkapi; teks salin.

import { describe, expect, it } from "vitest";
import vektor from "./lanjutan.vektor.json";
import { awalForm, instrukturKosong, type Form } from "../identifikasi";
import { isiPredefined } from "../kebijakan";
import { jadwalPendataan, rincianBiaya, type IsiLanjutan } from "../lanjutan";
import { ringkasPengadaan, sisaHariButuh, susunPengadaan, teksDraf, urutkanPengadaan } from "../pengadaan";

const salin = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const dasar = (): IsiLanjutan => salin(vektor.base) as unknown as IsiLanjutan;
const TAHUN = 2026;

function formDasar(ubah: (f: Form) => void = () => {}): Form {
  const f = awalForm();
  f.periode = "Triwulanan"; f.keList = ["Triwulan I"];
  f.rapat.evaluasi = { on: true, media: [], mitra: false }; // tanpa rapat tatap muka kecuali diminta
  f.sesi.pelatihan = { on: true, bentuk: "Luring", tempat: "Hotel dalam kota", tgl: {}, pulsa: false, perl: false, pengajar: false, instr: instrukturKosong() };
  f.adaDiseminasi = false;
  ubah(f);
  return f;
}
function susun(form: Form, isi: IsiLanjutan = dasar(), lembar = null as ReturnType<typeof isiPredefined> | null) {
  const rincian = rincianBiaya(isi, form, lembar);
  const pend = jadwalPendataan(form, TAHUN, null);
  return susunPengadaan(isi, form, TAHUN, null, pend, rincian);
}

describe("paket meeting hotel", () => {
  it("kelas luring di hotel dalam kota dengan mitra: satu item paket 524114", () => {
    const d = susun(formDasar());
    expect(d).toHaveLength(1);
    const p = d[0];
    expect([p.kelompok, p.jenis, p.akun, p.satuan, p.paket]).toEqual(["Pelatihan", "Paket meeting", "524114", "orang-hari", "fullday"]);
    // peserta: pml (1 org + 1 mit) + ppl (0 + 2) = 4 orang x 2 OH
    expect(p.volume).toBe(8);
    expect([p.butuhMulai, p.butuhSelesai]).toEqual(["2026-03-02", "2026-03-03"]);
    expect(p.tempat).toBe("Hotel dalam kota — Hotel Contoh, Arosuka");
    expect(p.perkiraan).toBe(false);
    expect(p.perlu).toEqual([]);
  });
  it("hotel luar kota memakai akun 524119", () => {
    const isi = dasar(); isi.kelas[0].tempat = "Hotel luar kota";
    expect(susun(formDasar(), isi)[0].akun).toBe("524119");
  });
  it("tarif dan nilai hanya bila lembar kebijakan memuat tarifnya; tanpa tarif ada catatan", () => {
    const d = susun(formDasar());
    expect(d[0].tarif).toBeNull();
    expect(d[0].nilai).toBeNull();
    expect(d[0].catatan.join(" ")).toContain("Tarif SBM paket belum tersedia");
  });
  it("hal yang masih perlu dilengkapi: paket, nama hotel, tanggal, OH, peserta", () => {
    const isi = dasar();
    isi.kelas[0].paket = ""; isi.kelas[0].lokasi = ""; isi.kelas[0].mulai = ""; isi.kelas[0].oh = 0; isi.kelas[0].fix = false;
    const p = susun(formDasar(), isi)[0];
    expect(p.perlu).toEqual(expect.arrayContaining(["tanggal kelas belum lengkap", "paket (fullday atau fullboard) belum dipilih", "nama hotel belum diisi", "jumlah OH belum diisi"]));
    expect(p.perkiraan).toBe(true);
    expect(p.butuhMulai).toBeNull();
    expect(p.uraian).toContain("fullday atau fullboard");
  });
  it("tanpa mitra: tidak ada paket atau konsumsi kelas", () => {
    const isi = dasar();
    isi.petugas = isi.petugas.filter((p) => p.status === "Organik");
    isi.peran.pml.nMit = 0; isi.peran.ppl.nMit = 0;
    expect(susun(formDasar(), isi)).toEqual([]);
  });
  it("kelas daring tidak butuh paket atau konsumsi", () => {
    const isi = dasar(); isi.kelas[0].metode = "Daring";
    expect(susun(formDasar(), isi)).toEqual([]);
  });
});

describe("konsumsi, perlengkapan, pulsa kelas", () => {
  it("luring bukan hotel: konsumsi tanpa paket 521211", () => {
    const isi = dasar(); isi.kelas[0].tempat = "Kantor"; isi.kelas[0].paket = "";
    const d = susun(formDasar((f) => { f.sesi.pelatihan.tempat = "Kantor"; }), isi);
    expect(d).toHaveLength(1);
    expect([d[0].jenis, d[0].akun, d[0].volume, d[0].paket]).toEqual(["Konsumsi", "521211", 8, ""]);
  });
  it("perlengkapan hanya untuk sesi pelatihan luring atau hybrid, per peserta", () => {
    const d = susun(formDasar((f) => { f.sesi.pelatihan.perl = true; }));
    const p = d.find((x) => x.jenis === "Perlengkapan")!;
    expect([p.akun, p.volume, p.satuan]).toEqual(["521211", 4, "paket"]);
    expect(p.perlu).toContain("jenis dan harga perlengkapan belum diidentifikasi");
    const briefing = dasar(); briefing.kelas[0].sesi = "briefing";
    expect(susun(formDasar((f) => { f.sesi.pelatihan.perl = true; f.sesi.briefing = { ...f.sesi.pelatihan, perl: true }; }), briefing).some((x) => x.jenis === "Perlengkapan")).toBe(false);
  });
  it("pulsa peserta (hybrid): volume = peserta mitra", () => {
    const isi = dasar(); isi.kelas[0].metode = "Hybrid";
    const d = susun(formDasar((f) => { f.sesi.pelatihan.bentuk = "Hybrid"; f.sesi.pelatihan.pulsa = true; }), isi);
    const p = d.find((x) => x.jenis === "Pulsa")!;
    expect([p.akun, p.volume, p.satuan]).toEqual(["521211", 3, "orang"]); // 1 + 2 mitra
    expect(d.some((x) => x.jenis === "Paket meeting")).toBe(true);
  });
  it("nilai muncul bila tarif pulsa ada pada lembar kebijakan", () => {
    const isi = dasar(); isi.kelas[0].metode = "Daring";
    const lembar = salin(isiPredefined());
    const pulsa = lembar.param.find((x) => x.k === "pulsa_peserta") as unknown as { kebijakan: number | null };
    pulsa.kebijakan = 10000;
    const d = susun(formDasar((f) => { f.sesi.pelatihan.bentuk = "Daring"; f.sesi.pelatihan.pulsa = true; }), isi, lembar);
    expect(d[0].tarif).toBe(10000);
    expect(d[0].nilai).toBe(30000);
  });
});

describe("rapat dan instrumen", () => {
  it("rapat evaluasi tatap muka: konsumsi tanpa volume dan tanggal", () => {
    const d = susun(formDasar((f) => { f.rapat.evaluasi = { on: true, media: ["Tatap muka"], mitra: false }; f.sesi.pelatihan.on = false; }), (() => { const i = dasar(); i.kelas = []; return i; })());
    expect(d).toHaveLength(1);
    expect([d[0].kelompok, d[0].uraian, d[0].volume, d[0].butuhMulai]).toEqual(["Rapat", "Konsumsi rapat evaluasi tatap muka", null, null]);
    expect(d[0].perlu).toEqual(["tanggal rapat belum ditetapkan", "jumlah peserta rapat belum diidentifikasi"]);
  });
  it("rapat persiapan dibayar hanya bila mitra dihadirkan dan ada mitra", () => {
    const f1 = formDasar((f) => { f.rapat.persiapan = { on: true, media: ["Tatap muka"], mitra: false }; });
    expect(susun(f1).some((x) => x.uraian.includes("persiapan"))).toBe(false);
    const f2 = formDasar((f) => { f.rapat.persiapan = { on: true, media: ["Tatap muka"], mitra: true }; });
    expect(susun(f2).some((x) => x.uraian.includes("persiapan"))).toBe(true);
  });
  it("penggandaan PAPI: dibutuhkan paling lambat hari pertama pendataan", () => {
    const f = formDasar((g) => { g.instrumen = "PAPI"; g.cetakPapi = true; });
    const p = susun(f).find((x) => x.jenis === "Penggandaan")!;
    const awal = jadwalPendataan(f, TAHUN, null)[0].mulai;
    expect([p.kelompok, p.akun, p.butuhMulai]).toEqual(["Pendataan", "521211", awal]);
    expect(p.perlu).toContain("jumlah eksemplar dan harga per lembar belum diidentifikasi");
  });
  it("PAPI tanpa cetak di kabupaten, atau FASIH: tidak ada penggandaan", () => {
    expect(susun(formDasar((g) => { g.instrumen = "PAPI"; g.cetakPapi = false; })).some((x) => x.jenis === "Penggandaan")).toBe(false);
    expect(susun(formDasar((g) => { g.instrumen = "FASIH"; g.cetakPapi = true; })).some((x) => x.jenis === "Penggandaan")).toBe(false);
  });
  it("pulsa petugas lapangan FASIH hanya bila belum ada pulsa peserta", () => {
    const f = formDasar((g) => { g.instrumen = "FASIH"; g.pulsaLap = true; });
    const p = susun(f).find((x) => x.uraian.startsWith("Pulsa petugas lapangan"))!;
    expect([p.kelompok, p.jenis, p.volume]).toEqual(["Pendataan", "Pulsa", 4]);
    const isi = dasar(); isi.kelas[0].metode = "Daring";
    const f2 = formDasar((g) => { g.instrumen = "FASIH"; g.pulsaLap = true; g.sesi.pelatihan.bentuk = "Daring"; g.sesi.pelatihan.pulsa = true; });
    expect(susun(f2, isi).some((x) => x.uraian.startsWith("Pulsa petugas lapangan"))).toBe(false);
  });
});

describe("cetak buku", () => {
  it("hanya bila ada diseminasi, cetak buku, dan dicetak di kabupaten; tanggal dari jadwal diseminasi", () => {
    const f = formDasar((g) => { g.adaDiseminasi = true; g.cetakBuku = true; g.cetakKab = true; });
    const p = susun(f).find((x) => x.jenis === "Cetak buku")!;
    expect([p.kelompok, p.akun, p.perkiraan]).toEqual(["Diseminasi", "521811", true]);
    expect(p.butuhMulai).toMatch(/^\d{4}-\d\d-\d\d$/);
    expect(p.butuhSelesai! >= p.butuhMulai!).toBe(true);
    expect(susun(formDasar((g) => { g.adaDiseminasi = true; g.cetakBuku = true; g.cetakKab = false; })).some((x) => x.jenis === "Cetak buku")).toBe(false);
    expect(susun(formDasar((g) => { g.adaDiseminasi = false; g.cetakBuku = true; g.cetakKab = true; })).some((x) => x.jenis === "Cetak buku")).toBe(false);
  });
});

describe("ringkasan, urutan, teks", () => {
  const f = formDasar((g) => { g.sesi.pelatihan.perl = true; g.rapat.evaluasi = { on: true, media: ["Tatap muka"], mitra: false }; g.adaDiseminasi = true; g.cetakBuku = true; g.cetakKab = true; });
  const d = susun(f);
  it("ringkasan menghitung siap, perlu dilengkapi, perkiraan, dan per akun", () => {
    const r = ringkasPengadaan(d);
    expect(r.jumlah).toBe(d.length);
    expect(r.siap + r.perluDilengkapi).toBe(r.jumlah);
    expect(r.siap).toBe(1); // hanya paket meeting yang lengkap
    expect(r.denganNilai + r.tanpaNilai).toBe(r.jumlah);
    expect(r.total).toBe(0);
    expect(r.perAkun.map((a) => a.akun)).toEqual(["521211", "521811", "524114"]);
    expect(r.perAkun.reduce((s, a) => s + a.jumlah, 0)).toBe(r.jumlah);
  });
  it("urut menurut tanggal dibutuhkan; tanpa tanggal di akhir", () => {
    const u = urutkanPengadaan(d);
    const tanggal = u.map((x) => x.butuhMulai);
    const sampaiNull = tanggal.findIndex((t) => t === null);
    expect(sampaiNull).toBeGreaterThan(0);
    expect(tanggal.slice(sampaiNull).every((t) => t === null)).toBe(true);
    const terisi = tanggal.slice(0, sampaiNull) as string[];
    expect([...terisi].sort()).toEqual(terisi);
  });
  it("sisaHariButuh", () => {
    expect(sisaHariButuh({ butuhMulai: "2026-03-02" }, "2026-02-20")).toBe(10);
    expect(sisaHariButuh({ butuhMulai: "2026-03-02" }, "2026-03-04")).toBe(-2);
    expect(sisaHariButuh({ butuhMulai: null }, "2026-03-04")).toBeNull();
  });
  it("teks salin memuat judul, RO, nomor, akun, dan hal yang perlu dilengkapi", () => {
    const t = teksDraf(d, "Survei Contoh", "2903.BMA.009");
    expect(t).toContain("Draf kebutuhan pengadaan: Survei Contoh");
    expect(t).toContain("RO 2903.BMA.009");
    expect(t).toContain("1. ");
    expect(t).toContain("Akun 524114 · 8 orang-hari");
    expect(t).toContain("Perlu dilengkapi:");
    expect(teksDraf([], "X", "R")).toContain("(tidak ada kebutuhan pengadaan)");
  });
});
