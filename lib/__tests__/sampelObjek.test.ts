import { describe, expect, it } from "vitest";
import {
  bacaHasilObjek, bacaProfil, bangunIndeksWilayah, bentukObjekJson, cocokkanPetugasObjek, cocokkanWilayah, kolomProfil, MAKS_BARIS_OBJEK, periksaBarisObjek, periksaCatatHasil,
  periksaObjek, periksaWilayahObjek, petaKolomObjek, rekapHasilObjek, rekapObjek, templatObjek, tingkatPlot, validasiProfil,
  type BarisObjek, type BarisObjekCocok, type ProfilSampel, type WilayahMasterLengkap,
} from "@/lib/sampelObjek";

const W = (kec: string, nag: string, sls: string, sub: string, kd: string, desa: string, idsls: string): WilayahMasterLengkap => ({
  idsubsls: `${idsls}${sub.padStart(2, "0")}`, kd_kec: kd, iddesa: desa, idsls, kecamatan: kec, nagari: nag, sls, sub_sls: sub,
});
const MASTER: WilayahMasterLengkap[] = [
  W("KUBUNG", "GANTUANG CIRI", "JORONG BARINGIN", "1", "1303110", "1303110005", "13031100050001"),
  W("KUBUNG", "GANTUANG CIRI", "JORONG BARINGIN", "2", "1303110", "1303110005", "13031100050001"),
  W("KUBUNG", "GANTUANG CIRI", "JORONG TENGAH", "1", "1303110", "1303110005", "13031100050002"),
  W("KUBUNG", "SIRUKAM", "JORONG BARINGIN", "1", "1303110", "1303110006", "13031100060001"),
  W("GUNUNG TALANG", "AIA BATUMBUK", "JORONG DALAM", "1", "1303120", "1303120001", "13031200010001"),
];

const P2: ProfilSampel = { model: 2, variabel: ["kecamatan", "nagari", "sls", "nama_sampel", "ppl", "pml"], label_bebas: {} };
const P3: ProfilSampel = { model: 3, variabel: ["jumlah", "ppl", "pml"], label_bebas: {} };

describe("validasiProfil", () => {
  it("profil model 2 dan 3 yang sah", () => {
    expect(validasiProfil(P2)).toEqual([]);
    expect(validasiProfil(P3)).toEqual([]);
  });
  it("model 2 wajib wilayah, model 3 boleh tanpa", () => {
    expect(validasiProfil({ model: 2, variabel: ["nama_sampel"], label_bebas: {} }).join()).toMatch(/variabel wilayah/);
    expect(validasiProfil({ model: 3, variabel: ["nama_sampel"], label_bebas: {} })).toEqual([]);
  });
  it("tanpa nama sampel wajib ada jumlah", () => {
    expect(validasiProfil({ model: 3, variabel: ["alamat"], label_bebas: {} }).join()).toMatch(/Nama Sampel.*Jumlah/);
  });
  it("PPL dan PML berpasangan; korwil butuh PPL; lat dan lng berpasangan", () => {
    expect(validasiProfil({ model: 3, variabel: ["jumlah", "ppl"], label_bebas: {} }).join()).toMatch(/berpasangan/);
    expect(validasiProfil({ model: 3, variabel: ["jumlah", "korwil"], label_bebas: {} }).join()).toMatch(/Korwil/);
    expect(validasiProfil({ model: 3, variabel: ["jumlah", "lat"], label_bebas: {} }).join()).toMatch(/Latitude/);
  });
  it("kolom bebas wajib berlabel, unik, tidak bentrok katalog", () => {
    expect(validasiProfil({ model: 3, variabel: ["jumlah", "bebas1"], label_bebas: {} }).join()).toMatch(/labelnya kosong/);
    expect(validasiProfil({ model: 3, variabel: ["jumlah", "bebas1", "bebas2"], label_bebas: { bebas1: "Jenis", bebas2: "jenis" } }).join()).toMatch(/sama dengan/);
    expect(validasiProfil({ model: 3, variabel: ["jumlah", "bebas1"], label_bebas: { bebas1: "Alamat" } }).join()).toMatch(/sama dengan/);
    expect(validasiProfil({ model: 3, variabel: ["jumlah", "bebas1"], label_bebas: { bebas1: "x".repeat(41) } }).join()).toMatch(/lebih dari 40/);
    expect(validasiProfil({ model: 3, variabel: ["jumlah", "bebas1"], label_bebas: { bebas1: "Jenis usaha" } })).toEqual([]);
  });
  it("variabel tidak dikenal dan ganda", () => {
    expect(validasiProfil({ model: 3, variabel: ["jumlah", "xx" as never], label_bebas: {} }).join()).toMatch(/tidak dikenal/);
    expect(validasiProfil({ model: 3, variabel: ["jumlah", "jumlah"], label_bebas: {} }).join()).toMatch(/dua kali/);
  });
});

describe("tingkatPlot, bacaProfil, kolomProfil", () => {
  it("tingkat = wilayah terdalam yang dicentang", () => {
    expect(tingkatPlot(["kecamatan", "sls"])).toBe("sls");
    expect(tingkatPlot(["nagari"])).toBe("nagari");
    expect(tingkatPlot(["jumlah"])).toBeNull();
  });
  it("bacaProfil menyaring masukan dan mengurutkan menurut katalog", () => {
    const p = bacaProfil({ model: 3, variabel: ["pml", "ppl", "jumlah", "zzz", "jumlah", "bebas2"], label_bebas: { bebas2: " Jenis usaha ", bebas1: "abaikan" } });
    expect(p).toEqual({ model: 3, variabel: ["jumlah", "ppl", "pml", "bebas2"], label_bebas: { bebas2: "Jenis usaha" } });
    expect(bacaProfil({ model: 1, variabel: [] })).toBeNull();
    expect(bacaProfil(null)).toBeNull();
  });
  it("kolomProfil memakai label untuk kolom bebas", () => {
    const k = kolomProfil({ model: 3, variabel: ["nama_sampel", "bebas3"], label_bebas: { bebas3: "Jenis usaha" } });
    expect(k.map((x) => x.judul)).toEqual(["Nama Sampel", "Jenis usaha"]);
  });
});

describe("petaKolomObjek", () => {
  it("mengenali alias dan label bebas", () => {
    const p: ProfilSampel = { model: 2, variabel: ["kecamatan", "sls", "nama_sampel", "ppl", "pml", "bebas1"], label_bebas: { bebas1: "Jenis usaha" } };
    const m = petaKolomObjek(p, ["KECAMATAN", "Jorong", "Nama Responden", "Nama PPL", "Nama PML", "Jenis Usaha"]);
    expect(m).toMatchObject({ kecamatan: "KECAMATAN", sls: "Jorong", nama_sampel: "Nama Responden", ppl: "Nama PPL", pml: "Nama PML", bebas1: "Jenis Usaha" });
  });
});

describe("periksaBarisObjek", () => {
  const baris = (o: Record<string, unknown>[]) => o;
  it("membaca baris model 2 dan memberi nomor baris Excel", () => {
    const r = periksaBarisObjek(P2, baris([
      { Kecamatan: "Kubung", Nagari: "Gantuang Ciri", "Jorong/SLS": "Jorong Baringin", "Nama Sampel": "Warung A", "Nama PPL": "Ani", "Nama PML": "Budi" },
      { Kecamatan: "", Nagari: "", "Jorong/SLS": "", "Nama Sampel": "", "Nama PPL": "", "Nama PML": "" },
      { Kecamatan: "Kubung", Nagari: "Sirukam", "Jorong/SLS": "Jorong Baringin", "Nama Sampel": "Warung B", "Nama PPL": "", "Nama PML": "" },
    ]));
    expect(r.galat).toEqual([]);
    expect(r.dilewati).toBe(1);
    expect(r.nomor).toEqual([2, 4]);
    expect(r.baris[0]).toMatchObject({ nama_sampel: "Warung A", jumlah: 1, ppl_nama: "Ani", pml_nama: "Budi" });
    expect(r.baris[1].ppl_nama).toBe("");
  });
  it("kolom wajib hilang = galat satu baris pesan", () => {
    const r = periksaBarisObjek(P2, baris([{ Kecamatan: "Kubung", "Nama Sampel": "x" }]));
    expect(r.galat).toHaveLength(1);
    expect(r.galat[0].pesan).toMatch(/Kolom tidak ditemukan.*Nagari/);
    expect(r.baris).toEqual([]);
  });
  it("tingkat terdalam, nama sampel, dan pasangan petugas wajib", () => {
    const r = periksaBarisObjek(P2, baris([
      { Kecamatan: "Kubung", Nagari: "Sirukam", "Jorong/SLS": "", "Nama Sampel": "", "Nama PPL": "Ani", "Nama PML": "" },
    ]));
    expect(r.galat).toHaveLength(1);
    expect(r.galat[0].baris).toBe(2);
    expect(r.galat[0].pesan).toMatch(/Jorong\/SLS kosong/);
    expect(r.galat[0].pesan).toMatch(/Nama Sampel kosong/);
    expect(r.galat[0].pesan).toMatch(/berpasangan/);
  });
  it("jumlah: bulat 1..batas; wajib bila tanpa nama sampel", () => {
    const r = periksaBarisObjek(P3, baris([{ Jumlah: "10", "Nama PPL": "A", "Nama PML": "B" }, { Jumlah: "", "Nama PPL": "A", "Nama PML": "B" }, { Jumlah: "2,5", "Nama PPL": "A", "Nama PML": "B" }, { Jumlah: "0", "Nama PPL": "", "Nama PML": "" }]));
    expect(r.baris).toHaveLength(1);
    expect(r.baris[0].jumlah).toBe(10);
    expect(r.galat.map((g) => g.baris)).toEqual([3, 4, 5]);
  });
  it("koordinat berpasangan, rentang, dan peringatan di luar Indonesia", () => {
    const p: ProfilSampel = { model: 3, variabel: ["nama_sampel", "lat", "lng"], label_bebas: {} };
    const r = periksaBarisObjek(p, baris([
      { "Nama Sampel": "a", Latitude: "-0,95", Longitude: "100,5" },
      { "Nama Sampel": "b", Latitude: "-0.95", Longitude: "" },
      { "Nama Sampel": "c", Latitude: "abc", Longitude: "1" },
      { "Nama Sampel": "d", Latitude: "100.5", Longitude: "-0.95" },
      { "Nama Sampel": "e", Latitude: "", Longitude: "" },
    ]));
    expect(r.baris.map((b) => b.nama_sampel)).toEqual(["a", "e"]);
    expect(r.baris[0]).toMatchObject({ lat: -0.95, lng: 100.5 });
    expect(r.baris[1]).toMatchObject({ lat: null, lng: null });
    expect(r.galat.map((g) => g.baris)).toEqual([3, 4, 5]);
    const w = periksaBarisObjek(p, baris([{ "Nama Sampel": "f", Latitude: "-0.95", Longitude: "10.5" }]));
    expect(w.peringatan.map((x) => x.pesan).join()).toMatch(/luar wilayah Indonesia/);
  });
  it("kode wilayah notasi ilmiah ditolak", () => {
    const p: ProfilSampel = { model: 2, variabel: ["sub_sls", "nama_sampel"], label_bebas: {} };
    const r = periksaBarisObjek(p, baris([{ "Sub SLS": "1.3031E+15", "Nama Sampel": "x" }]));
    expect(r.galat[0].pesan).toMatch(/angka ilmiah/);
  });
  it("batas baris dan profil tidak sah", () => {
    const besar = Array.from({ length: MAKS_BARIS_OBJEK + 1 }, () => ({ Jumlah: "1" }));
    expect(periksaBarisObjek(P3, besar).galat[0].pesan).toMatch(/batas/);
    expect(periksaBarisObjek({ model: 3, variabel: ["alamat"], label_bebas: {} }, [{ Alamat: "x" }]).galat[0].pesan).toMatch(/Profil variabel belum sah/);
    expect(periksaBarisObjek(P3, []).galat[0].pesan).toMatch(/tidak berisi/);
  });
  it("kolom bebas dibaca lewat label", () => {
    const p: ProfilSampel = { model: 3, variabel: ["jumlah", "bebas1"], label_bebas: { bebas1: "Jenis usaha" } };
    const r = periksaBarisObjek(p, [{ Jumlah: "3", "Jenis usaha": "Kuliner" }]);
    expect(r.baris[0].bebas).toEqual({ bebas1: "Kuliner" });
  });
});

describe("cocokkanWilayah", () => {
  const idx = bangunIndeksWilayah(MASTER);
  it("kode tepat di tiap tingkat", () => {
    expect(cocokkanWilayah("kecamatan", { kecamatan: "1303110" }, idx)).toMatchObject({ ok: true, kode: "1303110" });
    expect(cocokkanWilayah("nagari", { nagari: "1303110006" }, idx)).toMatchObject({ ok: true, kode: "1303110006" });
    expect(cocokkanWilayah("sls", { sls: "13031100050002" }, idx)).toMatchObject({ ok: true, kode: "13031100050002" });
    expect(cocokkanWilayah("sub_sls", { sub_sls: "1303110005000102" }, idx)).toMatchObject({ ok: true, kode: "1303110005000102" });
  });
  it("nama eksak dan sebagian", () => {
    expect(cocokkanWilayah("kecamatan", { kecamatan: "kubung" }, idx)).toMatchObject({ ok: true, kode: "1303110" });
    expect(cocokkanWilayah("nagari", { nagari: "gantuang" }, idx)).toMatchObject({ ok: true, kode: "1303110005" });
  });
  it("nama jorong ganda = ambigu; kolom atas menyelesaikan", () => {
    const a = cocokkanWilayah("sls", { sls: "Jorong Baringin" }, idx);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.alasan).toBe("ambigu");
    expect(cocokkanWilayah("sls", { nagari: "Sirukam", sls: "Jorong Baringin" }, idx)).toMatchObject({ ok: true, kode: "13031100060001" });
  });
  it("sub SLS nomor angka dinormalkan", () => {
    expect(cocokkanWilayah("sub_sls", { nagari: "Gantuang Ciri", sls: "Jorong Tengah", sub_sls: "01" }, idx)).toMatchObject({ ok: true, kode: "1303110005000201" });
  });
  it("tidak ketemu dan kode salah panjang", () => {
    const a = cocokkanWilayah("nagari", { nagari: "Tidak Ada" }, idx);
    expect(a).toMatchObject({ ok: false, alasan: "tidak_ketemu" });
    const b = cocokkanWilayah("nagari", { nagari: "13031100" }, idx);
    expect(b).toMatchObject({ ok: false, alasan: "kode_salah" });
    const c = cocokkanWilayah("sls", { kecamatan: "Gunung Talang", nagari: "Sirukam", sls: "Jorong Baringin" }, idx);
    expect(c.ok).toBe(false);
  });
  it("periksaWilayahObjek: nomor baris Excel dan tanpa tingkat", () => {
    const baris = [
      { wilayah: { nagari: "Sirukam" } }, { wilayah: { nagari: "Tak Ada" } },
    ] as unknown as BarisObjek[];
    const r = periksaWilayahObjek("nagari", baris, [2, 3], MASTER);
    expect(r.kode).toEqual(["1303110006", null]);
    expect(r.galat.map((g) => g.baris)).toEqual([3]);
    expect(periksaWilayahObjek(null, baris, [2, 3], MASTER).kode).toEqual([null, null]);
  });
  it("peringatan bila nama atas berbeda dari master saat memakai kode", () => {
    const baris = [{ wilayah: { nagari: "Sirukam", sls: "13031100050002" } }] as unknown as BarisObjek[];
    const r = periksaWilayahObjek("sls", baris, [2], MASTER);
    // nagari "Sirukam" tidak cocok dengan SLS 13031100050002 (milik Gantuang Ciri) -> penyaringan menjadikannya galat
    expect(r.galat).toHaveLength(1);
  });
});

describe("petugas, tim, dan JSON impor", () => {
  const kand = { ppl: [{ id: 1, nama: "Ani Putri" }, { id: 4, nama: "Dedi" }], pml: [{ id: 2, nama: "Budi" }], korwil: [{ id: 3, nama: "Cici" }], supervisor: [] };
  const bo = (o: Partial<BarisObjek>): BarisObjek => ({ wilayah: {}, nama_sampel: "x", jumlah: 1, nks: null, alamat: null, patokan: null, lat: null, lng: null, bebas: {}, ppl_nama: "Ani Putri", pml_nama: "Budi", ...o });
  it("mencocokkan petugas dan menjaga indeks baris", () => {
    const baris = [bo({ korwil_nama: "Cici" }), bo({ ppl_nama: "", pml_nama: "" }), bo({ ppl_nama: "Dedi" })];
    const r = cocokkanPetugasObjek(baris, ["13031100060001", null, "13031100060001"], [2, 3, 4], kand, "akun", new Map());
    expect(r.hasil.galat).toEqual([]);
    expect(r.final.map((x) => [x.ppl_akun_id, x.pml_akun_id])).toEqual([[1, 2], [null, null], [4, 2]]);
    expect(r.hasil.tim.simpul.map((s) => [s.akun_id, s.peran]).sort()).toEqual([[1, "ppl"], [2, "pml"], [3, "korwil"], [4, "ppl"]]);
  });
  it("nama PPL asing = galat dengan nomor baris Excel", () => {
    const r = cocokkanPetugasObjek([bo({}), bo({ ppl_nama: "Orang Asing" })], [null, null], [2, 3], kand, "akun", new Map());
    expect(r.hasil.galat[0].baris).toBe(3);
  });
  it("bentukObjekJson memuat atribut dan idsubsls hanya di tingkat sub SLS", () => {
    const f: BarisObjekCocok = { ...bo({ nks: "N1", alamat: "Jl A", lat: -0.9, lng: 100.5, bebas: { bebas1: "Kuliner" }, jumlah: 3 }), kode_wilayah: "1303110005000101", ppl_akun_id: 1, pml_akun_id: 2 };
    const a = bentukObjekJson([f], "sub_sls")[0];
    expect(a).toMatchObject({ kode_wilayah: "1303110005000101", idsubsls: "1303110005000101", jumlah: 3, ppl_akun_id: 1, pml_akun_id: 2 });
    expect(a.atribut).toEqual({ nks: "N1", alamat: "Jl A", lat: -0.9, lng: 100.5, bebas1: "Kuliner" });
    expect(bentukObjekJson([{ ...f, kode_wilayah: "1303110005" }], "nagari")[0].idsubsls).toBeNull();
  });
});

describe("rekap dan peringatan", () => {
  const f = (o: Partial<BarisObjekCocok>): BarisObjekCocok => ({
    wilayah: {}, nama_sampel: null, jumlah: 5, nks: null, alamat: null, patokan: null, lat: null, lng: null, bebas: {}, ppl_nama: "", pml_nama: "",
    kode_wilayah: "13031100050001", ppl_akun_id: 1, pml_akun_id: 2, ...o,
  });
  it("rekapObjek", () => {
    const r = rekapObjek([f({}), f({ kode_wilayah: "13031100050002", ppl_akun_id: 4 }), f({ ppl_akun_id: null, pml_akun_id: null, jumlah: 2 })]);
    expect(r).toEqual({ objek: 3, sampel: 12, wilayah: 2, ppl: 2, pml: 1, tanpa_petugas: 1 });
  });
  it("periksaObjek: sebagian tanpa petugas, PPL dua PML, nama kembar", () => {
    const w = periksaObjek([f({ nama_sampel: "A" }), f({ nama_sampel: "a", pml_akun_id: 9 }), f({ ppl_akun_id: null, pml_akun_id: null })], new Map([[1, "Ani"]])).join("|");
    expect(w).toMatch(/1 dari 3 baris belum punya PPL/);
    expect(w).toMatch(/lebih dari satu PML: Ani/);
    expect(w).toMatch(/nama sampel muncul lebih dari sekali/);
  });
  it("periksaObjek: beban timpang", () => {
    const b = [f({ ppl_akun_id: 1, jumlah: 10 }), f({ ppl_akun_id: 2, jumlah: 10 }), f({ ppl_akun_id: 3, jumlah: 10 }), f({ ppl_akun_id: 4, jumlah: 100 })];
    expect(periksaObjek(b, new Map()).join("|")).toMatch(/jauh dari rata-rata/);
  });
});

describe("hasil per objek", () => {
  it("bacaHasilObjek mengenali sinonim", () => {
    expect(bacaHasilObjek("Berhasil didata")).toBe("didata");
    expect(bacaHasilObjek("ditolak")).toBe("menolak");
    expect(bacaHasilObjek("Tidak ditemukan")).toBe("tidak_ditemukan");
    expect(bacaHasilObjek("lain")).toBeNull();
    expect(bacaHasilObjek(5)).toBeNull();
  });
  it("baris bernama sampel: tiga hasil, jumlah_didata = jumlah hanya untuk didata", () => {
    const o = { jumlah: 1, nama_sampel: "Warung A" };
    expect(periksaCatatHasil(o, "didata", null)).toEqual({ ok: true, hasil: "didata", jumlah_didata: 1 });
    expect(periksaCatatHasil(o, "menolak", null)).toEqual({ ok: true, hasil: "menolak", jumlah_didata: null });
    expect(periksaCatatHasil(o, "ngawur", null).ok).toBe(false);
  });
  it("baris berjumlah: didata butuh jumlah 1..jumlah", () => {
    const o = { jumlah: 10, nama_sampel: null };
    expect(periksaCatatHasil(o, "didata", 7)).toEqual({ ok: true, hasil: "didata", jumlah_didata: 7 });
    expect(periksaCatatHasil(o, "didata", 11).ok).toBe(false);
    expect(periksaCatatHasil(o, "didata", 0).ok).toBe(false);
    expect(periksaCatatHasil(o, "didata", "x").ok).toBe(false);
    expect(periksaCatatHasil(o, "menolak", null)).toEqual({ ok: true, hasil: "menolak", jumlah_didata: null });
  });
  it("rekapHasilObjek", () => {
    const r = rekapHasilObjek([
      { jumlah: 1, hasil: "didata", jumlah_didata: 1 }, { jumlah: 10, hasil: "didata", jumlah_didata: 7 }, { jumlah: 1, hasil: "menolak", jumlah_didata: null },
      { jumlah: 1, hasil: "tidak_ditemukan", jumlah_didata: null }, { jumlah: 4, hasil: null, jumlah_didata: null },
    ]);
    expect(r).toEqual({ objek: 5, sampel: 17, didata: 2, menolak: 1, tidak_ditemukan: 1, belum: 1, sampel_didata: 8 });
  });
});

describe("templatObjek", () => {
  it("judul dan contoh mengikuti profil", () => {
    const t = templatObjek({ model: 2, variabel: ["nagari", "nama_sampel", "ppl", "pml", "bebas1"], label_bebas: { bebas1: "Jenis usaha" } });
    expect(t[0]).toEqual(["Nagari", "Nama Sampel", "Nama PPL", "Nama PML", "Jenis usaha"]);
    expect(t).toHaveLength(3);
    expect(t[1]).toHaveLength(5);
  });
});
