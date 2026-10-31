import { describe, expect, it } from "vitest";
import { koordinatPerSls, kebutuhanSama, usulanKebutuhan, wilayahDariSampel, type BarisSampelMin } from "../seleksiTurunan";

const peran = (o: Partial<{ on: boolean; nOrg: number; nMit: number; fix: boolean }> = {}) => ({ on: true, nOrg: 2, nMit: 10, fix: true, ...o });

describe("usulanKebutuhan", () => {
  it("total = organik + Mitra; sudah organik dibatasi total", () => {
    const u = usulanKebutuhan({ ppl: peran({ nOrg: 3, nMit: 17 }), pml: peran({ nOrg: 2, nMit: 3 }) }, { ppl: 2, pml: 9 });
    expect(u).toMatchObject({ kebutuhan_ppl: 20, kebutuhan_pml: 5, sudah_ppl: 2, sudah_pml: 5, org_ppl: 3, mit_ppl: 17, mit_pml: 3, perkiraan: false });
  });
  it("peran tidak dipakai = 0; peran hilang = 0", () => {
    const u = usulanKebutuhan({ ppl: peran({ on: false }), pml: null }, { ppl: 4, pml: 4 });
    expect(u).toMatchObject({ kebutuhan_ppl: 0, kebutuhan_pml: 0, sudah_ppl: 0, sudah_pml: 0 });
  });
  it("perkiraan bila ada peran dipakai yang belum Fix", () => {
    expect(usulanKebutuhan({ ppl: peran({ fix: false }), pml: peran() }, { ppl: 0, pml: 0 }).perkiraan).toBe(true);
    expect(usulanKebutuhan({ ppl: peran({ on: false, fix: false }), pml: peran() }, { ppl: 0, pml: 0 }).perkiraan).toBe(false);
  });
  it("angka aneh dibersihkan", () => {
    const u = usulanKebutuhan({ ppl: peran({ nOrg: -3, nMit: 2.9 }), pml: peran({ nOrg: Number.NaN, nMit: 1 }) }, { ppl: -1, pml: 0 });
    expect(u.kebutuhan_ppl).toBe(2);
    expect(u.kebutuhan_pml).toBe(1);
    expect(u.sudah_ppl).toBe(0);
  });
});

describe("kebutuhanSama", () => {
  const u = usulanKebutuhan({ ppl: peran({ nOrg: 1, nMit: 4 }), pml: peran({ nOrg: 0, nMit: 2 }) }, { ppl: 1, pml: 0 });
  it("sama / beda / kosong", () => {
    expect(kebutuhanSama({ kebutuhan_ppl: "5", kebutuhan_pml: "2", sudah_ppl: "1", sudah_pml: "0" }, u)).toBe(true);
    expect(kebutuhanSama({ kebutuhan_ppl: "5", kebutuhan_pml: "3", sudah_ppl: "1", sudah_pml: "0" }, u)).toBe(false);
    expect(kebutuhanSama({ kebutuhan_ppl: "", kebutuhan_pml: "2", sudah_ppl: "1", sudah_pml: "0" }, u)).toBe(false);
  });
});

const baris = (kode: string, status: string, lat: number | null = null, lng: number | null = null): BarisSampelMin => ({ kode_wilayah: kode, kode_sls: kode.slice(0, 14), status, lat, lng });
const kosong = new Map<string, { lat: number; lng: number }>();

describe("wilayahDariSampel", () => {
  it("mengelompokkan per SLS, memberi nama dari master, dan menghitung hanya sampel utama", () => {
    const r = wilayahDariSampel([baris("1303040001000201", "utama"), baris("1303040001000202", "utama"), baris("1303040001000203", "cadangan"), baris("1303050002000401", "utama")], kosong);
    expect(r.sls).toBe(3 - 1);
    expect(r.baris_utama).toBe(3);
    const w = r.wilayah.find((x) => x.kode === "13030400010002");
    expect(w).toMatchObject({ nama: "Surian · Jorong Jalan Balantai", kecamatan: "PANTAI CERMIN", nagari: "SURIAN", jumlah_sampel: 2 });
    expect(r.wilayah.find((x) => x.kode === "13030500020004")?.nagari).toBe("SUNGAI NANAM");
    expect(r.tak_dikenal).toBe(0);
  });
  it("titik = rata-rata titik sampel utama; bila tak ada pakai titik master; bila tak ada keduanya null", () => {
    const koord = new Map([["13030500020004", { lat: -0.9, lng: 100.6 }]]);
    const r = wilayahDariSampel([baris("1303040001000201", "utama", -1, 100), baris("1303040001000202", "utama", -1.2, 100.2), baris("1303040001000203", "cadangan", 5, 120), baris("1303050002000401", "utama")], koord);
    const a = r.wilayah.find((x) => x.kode === "13030400010002");
    expect(a?.lat).toBeCloseTo(-1.1, 5);
    expect(a?.lng).toBeCloseTo(100.1, 5);
    expect(r.wilayah.find((x) => x.kode === "13030500020004")).toMatchObject({ lat: -0.9, lng: 100.6 });
    const t = wilayahDariSampel([baris("1303040001000201", "utama")], kosong);
    expect(t.wilayah[0].lat).toBeNull();
  });
  it("titik di luar Indonesia diabaikan", () => {
    const r = wilayahDariSampel([baris("1303040001000201", "utama", 100, 200)], kosong);
    expect(r.wilayah[0].lat).toBeNull();
  });
  it("SLS tak dikenal tetap dimasukkan tanpa kecamatan/nagari dan dihitung", () => {
    const r = wilayahDariSampel([baris("1303049999000101", "utama"), baris("1303040001000201", "utama")], kosong);
    expect(r.tak_dikenal).toBe(1);
    const x = r.wilayah.find((w) => w.kode === "13030499990001");
    expect(x).toMatchObject({ nama: "SLS 13030499990001", kecamatan: null, nagari: null, jumlah_sampel: 1 });
  });
  it("dipotong pada batas maks dan melaporkan sisanya", () => {
    const r = wilayahDariSampel([baris("1303040001000101", "utama"), baris("1303040001000201", "utama"), baris("1303040001000301", "utama")], kosong, 2);
    expect(r.wilayah).toHaveLength(2);
    expect(r.terpotong).toBe(1);
    expect(r.sls).toBe(3);
  });
  it("tanpa sampel -> kosong", () => {
    expect(wilayahDariSampel([], kosong)).toMatchObject({ wilayah: [], sls: 0, baris_utama: 0 });
  });
  it("kode_sls terlalu pendek dilewati", () => {
    expect(wilayahDariSampel([{ kode_wilayah: "13", kode_sls: "13", status: "utama", lat: null, lng: null }], kosong).sls).toBe(0);
  });
});

describe("koordinatPerSls", () => {
  it("merata-ratakan sub SLS per 14 digit dan membuang titik tak sah", () => {
    const m = koordinatPerSls([
      { idsubsls: "1303040001000201", lat: -1, lon: 100 },
      { idsubsls: "1303040001000202", lat: -3, lon: 102 },
      { idsubsls: "1303040001000203", lat: 80, lon: 100 },
    ]);
    expect(m.get("13030400010002")).toEqual({ lat: -2, lng: 101 });
    expect(m.size).toBe(1);
  });
});
