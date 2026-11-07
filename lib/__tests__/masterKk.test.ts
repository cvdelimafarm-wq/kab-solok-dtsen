import { describe, expect, it } from "vitest";
import { KOLOM_TEMPLAT_KK, MAKS_BARIS_KK, kecamatanBerkas, periksaBarisKk, petaKolomKk, sahkanBarisKk, sahkanSatuKk, templatKk } from "../masterKk";

const b = (o: Record<string, unknown> = {}) => ({ "Kode Sub SLS": "1303110005000102", "Nama KK": "Budi Santoso", "Anggota Lain": "", Patokan: "", Latitude: "", Longitude: "", ...o });

describe("petaKolomKk", () => {
  it("mengenali judul kolom dengan variasi huruf dan tanda baca", () => {
    const k = petaKolomKk(["KODE_SUBSLS", "Nama Kepala Keluarga", "anggota lain", "Patokan (opsional)", "LAT", "Long"]);
    expect(k).toEqual({ kode: "KODE_SUBSLS", nama: "Nama Kepala Keluarga", anggota: "anggota lain", patokan: "Patokan (opsional)", lat: "LAT", lng: "Long" });
  });
  it("templat memuat semua kolom baku", () => {
    expect(templatKk()[0]).toEqual([...KOLOM_TEMPLAT_KK]);
    expect(Object.keys(petaKolomKk(templatKk()[0]))).toHaveLength(6);
  });
});

describe("sahkanSatuKk", () => {
  const m = { kode: "1303110005000102", nama: "Budi", anggota: "", patokan: "", lat: "", lng: "" };
  it("baris minimal sah, anggota/patokan/koordinat null", () => {
    expect(sahkanSatuKk(m).baris).toEqual({ idsubsls: "1303110005000102", nama_kk: "Budi", anggota_lain: null, patokan: null, lat: null, lng: null });
  });
  it("koordinat berkoma desimal dibaca; di luar Solok jadi peringatan, bukan galat", () => {
    const r = sahkanSatuKk({ ...m, lat: "-0,7931", lng: "100,6502" });
    expect(r.baris).toMatchObject({ lat: -0.7931, lng: 100.6502 });
    expect(r.peringatan).toHaveLength(0);
    const luar = sahkanSatuKk({ ...m, lat: "100.65", lng: "-0.79" });
    expect(luar.galat[0]).toMatch(/rentang bumi|tertukar/);
    const jauh = sahkanSatuKk({ ...m, lat: "-6.2", lng: "106.8" });
    expect(jauh.baris).not.toBeNull();
    expect(jauh.peringatan[0]).toMatch(/luar wilayah/);
  });
  it("koordinat tidak berpasangan atau bukan angka ditolak", () => {
    expect(sahkanSatuKk({ ...m, lat: "-0.7" }).galat[0]).toMatch(/berpasangan/);
    expect(sahkanSatuKk({ ...m, lat: "abc", lng: "1" }).galat[0]).toMatch(/angka desimal/);
  });
  it("kode 14 digit, 15 digit, notasi ilmiah, dan nama kosong ditolak", () => {
    expect(sahkanSatuKk({ ...m, kode: "13031100050001" }).galat[0]).toMatch(/14 digit/);
    expect(sahkanSatuKk({ ...m, kode: "130311000500010" }).galat[0]).toMatch(/16 digit/);
    expect(sahkanSatuKk({ ...m, kode: "1.30311E+15" }).galat[0]).toMatch(/ilmiah/);
    expect(sahkanSatuKk({ ...m, nama: "  " }).galat).toContain("Nama KK kosong.");
  });
  it("panjang berlebih ditolak", () => {
    expect(sahkanSatuKk({ ...m, nama: "x".repeat(121) }).galat[0]).toMatch(/120/);
    expect(sahkanSatuKk({ ...m, patokan: "x".repeat(301) }).galat[0]).toMatch(/300/);
  });
});

describe("periksaBarisKk", () => {
  it("baris sah dan nomor baris Excel (judul = 1)", () => {
    const r = periksaBarisKk([b(), b({ "Nama KK": "Siti", Latitude: "-0.8", Longitude: "100.6" })]);
    expect(r.galat).toEqual([]);
    expect(r.baris).toHaveLength(2);
    expect(r.nomor).toEqual([2, 3]);
    expect(r.baris[1]).toMatchObject({ nama_kk: "Siti", lat: -0.8, lng: 100.6 });
  });
  it("baris kosong dilewati; galat per baris tidak menggagalkan baris lain", () => {
    const r = periksaBarisKk([b(), b({ "Kode Sub SLS": "", "Nama KK": "", "Anggota Lain": "" }), b({ "Nama KK": "" }), b({ "Nama KK": "Dewi" })]);
    expect(r.dilewati).toBe(1);
    expect(r.galat).toEqual([{ baris: 4, pesan: "Nama KK kosong." }]);
    expect(r.baris.map((x) => x.nama_kk)).toEqual(["Budi Santoso", "Dewi"]);
  });
  it("nama kembar boleh; baris persis sama diberi peringatan tetapi tetap masuk", () => {
    const r = periksaBarisKk([b(), b({ Patokan: "rumah biru" }), b()]);
    expect(r.baris).toHaveLength(3);
    expect(r.peringatan).toHaveLength(1);
    expect(r.peringatan[0].baris).toBe(4);
  });
  it("kolom wajib hilang: galat satu pesan", () => {
    const r = periksaBarisKk([{ Nama: "A", Lat: "1" }]);
    expect(r.baris).toEqual([]);
    expect(r.galat[0].pesan).toMatch(/Kode Sub SLS/);
  });
  it("berkas kosong dan berkas terlalu besar", () => {
    expect(periksaBarisKk([]).galat[0].pesan).toMatch(/tidak berisi/);
    expect(periksaBarisKk(new Array(MAKS_BARIS_KK + 1).fill(b())).galat[0].pesan).toMatch(/batas/);
  });
  it("daftar galat dipotong tetapi totalnya tetap dihitung", () => {
    const r = periksaBarisKk(Array.from({ length: 500 }, () => b({ "Nama KK": "" })));
    expect(r.galat.length).toBe(200);
    expect(r.galat_total).toBe(500);
  });
});

describe("sahkanBarisKk (server)", () => {
  const sah = { idsubsls: "1303110005000102", nama_kk: "Budi", anggota_lain: null, patokan: null, lat: null, lng: null };
  it("menerima baris bersih", () => {
    const r = sahkanBarisKk([sah, { ...sah, nama_kk: "Siti", lat: -0.8, lng: 100.6, patokan: " dekat surau " }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.baris[1]).toMatchObject({ lat: -0.8, lng: 100.6, patokan: "dekat surau" });
  });
  it("menolak bentuk tak sah, kode salah, dan terlalu banyak", () => {
    expect(sahkanBarisKk("x")).toMatchObject({ ok: false });
    expect(sahkanBarisKk([])).toMatchObject({ ok: false });
    expect(sahkanBarisKk([null])).toMatchObject({ ok: false });
    expect(sahkanBarisKk([{ ...sah, idsubsls: "123" }])).toMatchObject({ ok: false });
    expect(sahkanBarisKk([{ ...sah, lat: -0.8 }])).toMatchObject({ ok: false });
    expect(sahkanBarisKk(new Array(MAKS_BARIS_KK + 1).fill(sah))).toMatchObject({ ok: false });
  });
});

describe("kecamatanBerkas", () => {
  it("kecamatan terbanyak dan jumlah kecamatan berbeda", () => {
    const r = kecamatanBerkas([{ idsubsls: "1303110005000102" }, { idsubsls: "1303110005000202" }, { idsubsls: "1303080001000102" }]);
    expect(r).toEqual({ utama: "1303110", jumlah: 2, daftar: ["1303110", "1303080"] });
    expect(kecamatanBerkas([]).utama).toBeNull();
  });
});
