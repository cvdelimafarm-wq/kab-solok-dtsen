import { describe, expect, it } from "vitest";
import {
  bacaKodeSubsls, cocokkanAlokasi, periksaAlokasiWilayah, periksaBarisAlokasi, periksaTerhadapMaster, petaKolomAlokasi, rekapAlokasi, templatAlokasi,
  type BarisAlokasi, type BarisAlokasiCocok, type WilayahMaster,
} from "@/lib/alokasiWilayah";

const K1 = "1303110005000101";
const K2 = "1303110005000102";
const K3 = "1303120001000101";

describe("bacaKodeSubsls", () => {
  it("menerima 16 digit", () => expect(bacaKodeSubsls(K1)).toEqual({ ok: true, kode: K1 }));
  it("menolak 14 digit dengan petunjuk SLS", () => {
    const r = bacaKodeSubsls("13031100050001");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.pesan).toMatch(/14 digit/);
  });
  it("menolak notasi ilmiah dan terlalu pendek", () => {
    expect(bacaKodeSubsls("1.3031E+15").ok).toBe(false);
    expect(bacaKodeSubsls("130311000500").ok).toBe(false);
    expect(bacaKodeSubsls("").ok).toBe(false);
  });
});

describe("petaKolomAlokasi", () => {
  it("mengenali judul seperti contoh plotting Seruti", () => {
    const p = petaKolomAlokasi(["KECAMATAN", "NAGARI", "JORONG", "Kode Sub SLS", "NKS", "PPL", "PML", "Jumlah KK Sampel Stage 2"]);
    expect(p).toMatchObject({ kecamatan: "KECAMATAN", nagari: "NAGARI", jorong: "JORONG", kode: "Kode Sub SLS", nks: "NKS", ppl: "PPL", pml: "PML", target: "Jumlah KK Sampel Stage 2" });
  });
});

describe("periksaBarisAlokasi", () => {
  const b = (o: Record<string, unknown>) => ({ "Kode Sub SLS": K1, NKS: "0001A", "Nama PPL": "Ani", "Nama PML": "Budi", "Jumlah KK Sampel Stage 2": "10", ...o });
  it("membaca baris sah", () => {
    const h = periksaBarisAlokasi([b({}), b({ "Kode Sub SLS": K2 })]);
    expect(h.galat).toEqual([]);
    expect(h.baris).toHaveLength(2);
    expect(h.baris[0]).toMatchObject({ idsubsls: K1, nks: "0001A", target: 10, ppl_nama: "Ani", pml_nama: "Budi" });
    expect(h.nomor).toEqual([2, 3]);
  });
  it("NKS boleh sama pada beberapa sub SLS", () => {
    const h = periksaBarisAlokasi([b({}), b({ "Kode Sub SLS": K2 })]);
    expect(h.baris.map((x) => x.nks)).toEqual(["0001A", "0001A"]);
  });
  it("kode ganda = galat pada baris kedua", () => {
    const h = periksaBarisAlokasi([b({}), b({})]);
    expect(h.baris).toHaveLength(1);
    expect(h.galat).toEqual([{ baris: 3, pesan: expect.stringMatching(/sudah ada di baris 2/) }]);
  });
  it("PPL tanpa PML = galat; keduanya kosong = alokasi dini", () => {
    expect(periksaBarisAlokasi([b({ "Nama PML": "" })]).galat[0].pesan).toMatch(/berpasangan/);
    const dini = periksaBarisAlokasi([b({ "Nama PPL": "", "Nama PML": "" })]);
    expect(dini.galat).toEqual([]);
    expect(dini.baris[0]).toMatchObject({ ppl_nama: "", pml_nama: "" });
  });
  it("target kosong = null; target tidak sah = galat", () => {
    expect(periksaBarisAlokasi([b({ "Jumlah KK Sampel Stage 2": "" })]).baris[0].target).toBeNull();
    expect(periksaBarisAlokasi([b({ "Jumlah KK Sampel Stage 2": "abc" })]).galat).toHaveLength(1);
    expect(periksaBarisAlokasi([b({ "Jumlah KK Sampel Stage 2": "-1" })]).galat).toHaveLength(1);
  });
  it("baris kosong dilewati; kolom kode hilang = galat", () => {
    expect(periksaBarisAlokasi([b({}), { "Kode Sub SLS": "", NKS: "" }]).dilewati).toBe(1);
    expect(periksaBarisAlokasi([{ NKS: "x" }]).galat[0].pesan).toMatch(/Kode Sub SLS/);
  });
  it("kode 14 digit ditolak", () => {
    expect(periksaBarisAlokasi([b({ "Kode Sub SLS": "13031100050001" })]).galat[0].pesan).toMatch(/Sub SLS 16 digit/);
  });
  it("korwil tanpa PPL diabaikan dengan peringatan", () => {
    const h = periksaBarisAlokasi([b({ "Nama PPL": "", "Nama PML": "", "Nama Korwil": "Cici" })]);
    expect(h.baris[0].korwil_nama).toBeUndefined();
    expect(h.peringatan).toHaveLength(1);
  });
});

describe("periksaTerhadapMaster", () => {
  const master = new Map<string, WilayahMaster>([[K1, { idsubsls: K1, kecamatan: "KUBUNG", nagari: "GANTUANG CIRI", sls: "JORONG BARINGIN", sub_sls: "01" }]]);
  const baris = (o: Partial<BarisAlokasi>): BarisAlokasi => ({ idsubsls: K1, nks: null, target: null, ppl_nama: "", pml_nama: "", ...o });
  it("kode tidak ada = galat", () => {
    expect(periksaTerhadapMaster([baris({ idsubsls: K3 })], [2], master).galat).toHaveLength(1);
  });
  it("nama wilayah beda = peringatan, bukan galat", () => {
    const r = periksaTerhadapMaster([baris({ kecamatan: "LAIN", nagari: "gantuang ciri", jorong: "Baringin" })], [5], master);
    expect(r.galat).toEqual([]);
    expect(r.peringatan).toHaveLength(1);
    expect(r.peringatan[0].baris).toBe(5);
    expect(r.peringatan[0].pesan).toMatch(/kecamatan "LAIN"/);
    expect(r.peringatan[0].pesan).not.toMatch(/nagari/);
  });
  it("nama sama (huruf besar/kecil beda) = tanpa peringatan", () => {
    const r = periksaTerhadapMaster([baris({ kecamatan: "Kubung", nagari: "Gantuang Ciri", jorong: "JORONG BARINGIN" })], [2], master);
    expect(r.peringatan).toEqual([]);
  });
});

describe("cocokkanAlokasi", () => {
  const kand = {
    ppl: [{ id: 1, nama: "Ani Putri" }, { id: 4, nama: "Dedi" }],
    pml: [{ id: 2, nama: "Budi" }],
    korwil: [{ id: 3, nama: "Cici" }],
    supervisor: [],
  };
  const nama = new Map<number, string>();
  const bar = (o: Partial<BarisAlokasi>): BarisAlokasi => ({ idsubsls: K1, nks: "A", target: 10, ppl_nama: "Ani Putri", pml_nama: "Budi", ...o });
  it("mencocokkan petugas dan menyusun tim; indeks baris terjaga", () => {
    const r = cocokkanAlokasi([bar({ korwil_nama: "Cici" }), bar({ idsubsls: K2, ppl_nama: "", pml_nama: "" }), bar({ idsubsls: K3, ppl_nama: "Dedi", korwil_nama: "Cici" })], [2, 3, 4], kand, "akun", nama);
    expect(r.galat).toEqual([]);
    expect(r.final.map((x) => [x.ppl_akun_id, x.pml_akun_id])).toEqual([[1, 2], [null, null], [4, 2]]);
    expect(r.tim.simpul.map((s) => [s.akun_id, s.peran, s.atasan_akun_id]).sort()).toEqual([[1, "ppl", 2], [2, "pml", 3], [3, "korwil", null], [4, "ppl", 2]]);
  });
  it("nama PPL tidak ditemukan = galat dengan nomor baris Excel", () => {
    const r = cocokkanAlokasi([bar({}), bar({ idsubsls: K2, ppl_nama: "Orang Asing" })], [2, 3], kand, "akun", nama);
    expect(r.galat).toHaveLength(1);
    expect(r.galat[0].baris).toBe(3);
  });
  it("tanpa petugas sama sekali = tim kosong", () => {
    const r = cocokkanAlokasi([bar({ ppl_nama: "", pml_nama: "" })], [2], kand, "akun", nama);
    expect(r.tim.simpul).toEqual([]);
    expect(r.galat).toEqual([]);
  });
  it("orang dengan dua peran = galat tim", () => {
    const k2 = { ...kand, pml: [{ id: 2, nama: "Budi" }, { id: 1, nama: "Ani Putri" }] };
    const r = cocokkanAlokasi([bar({}), bar({ idsubsls: K2, ppl_nama: "Dedi", pml_nama: "Ani Putri" })], [2, 3], k2, "akun", nama);
    expect(r.tim.galat.length).toBeGreaterThan(0);
  });
});

describe("rekap dan peringatan", () => {
  const f = (o: Partial<BarisAlokasiCocok>): BarisAlokasiCocok => ({ idsubsls: K1, nks: "A", target: null, ppl_nama: "", pml_nama: "", ppl_akun_id: 1, pml_akun_id: 2, ...o });
  const baris = [f({ target: 10 }), f({ idsubsls: K2 }), f({ idsubsls: K3, nks: "B", ppl_akun_id: null, pml_akun_id: null })];
  it("rekap", () => {
    expect(rekapAlokasi(baris, 10)).toEqual({ subsls: 3, nks: 2, ppl: 1, pml: 1, target_total: 30, tanpa_petugas: 1, tanpa_target: 2 });
  });
  it("peringatan: tanpa petugas, lebih dari maks, KK kosong, KK kurang dari target", () => {
    const w = periksaAlokasiWilayah(baris, 1, new Map([[K1, 5], [K2, 100]]), new Map([[1, "Ani"]]));
    expect(w.join("|")).toMatch(/1 dari 3 sub SLS belum punya PPL/);
    expect(w.join("|")).toMatch(/1 PPL memegang lebih dari 1 sub SLS: Ani \(2\)/);
    expect(w.join("|")).toMatch(/1 sub SLS belum punya daftar KK/);
    expect(w.join("|")).toMatch(/KK lebih sedikit daripada target sampel: 1303110005000101 \(5 KK, target 10\)/);
  });
});

describe("templat", () => {
  it("memakai kolom yang dikenali pembaca", () => {
    const t = templatAlokasi();
    const baris = t.slice(1).map((r) => Object.fromEntries(t[0].map((j, i) => [j, r[i]])));
    const peta = petaKolomAlokasi(t[0]);
    expect(Object.keys(peta)).toHaveLength(10);
    const h = periksaBarisAlokasi(baris.map((x) => ({ ...x, "Nama PPL": "", "Nama PML": "", "Nama Korwil": "", "Nama Supervisor": "" })));
    expect(h.galat).toEqual([]);
    expect(h.baris).toHaveLength(2);
  });
});
