import { describe, expect, it } from "vitest";
import { bacaSyarat, nilaiKelayakan, type KandidatLokasi, type SyaratSeleksi, type WilayahSeleksi } from "../seleksiSyarat";

const syarat = (level: "kecamatan" | "nagari" | "sls"): SyaratSeleksi => ({ domisili: { aktif: true, level }, jarak: { aktif: false, maks_km: 10 } });
const w = (kode: string, kecamatan: string | null, nagari: string | null): WilayahSeleksi => ({ kode, nama: "w", kecamatan, nagari, lat: null, lng: null, jumlah_sampel: 1, kebutuhan_ppl: 0, kebutuhan_pml: 0 });
const k = (o: Partial<KandidatLokasi> = {}): KandidatLokasi => ({ id: 1, nama: "Budi", kecamatan: null, nagari: null, lat: null, lng: null, ...o });

// Surian (1303040001) SLS 0002 sub 01 | Sungai Nanam (1303050002) SLS 0004
const SAMPEL = [w("13030400010002", "PANTAI CERMIN", "SURIAN")];

describe("bacaSyarat level sls", () => {
  it("menerima nagari, sls; selain itu kecamatan", () => {
    expect(bacaSyarat({ domisili: { aktif: true, level: "sls" } }).domisili.level).toBe("sls");
    expect(bacaSyarat({ domisili: { aktif: true, level: "nagari" } }).domisili.level).toBe("nagari");
    expect(bacaSyarat({ domisili: { aktif: true, level: "rt" } }).domisili.level).toBe("kecamatan");
  });
});

describe("domisili berdasarkan KODE", () => {
  it("SLS sama -> memenuhi; SLS lain pada nagari yang sama -> tidak", () => {
    expect(nilaiKelayakan(k({ kode: "1303040001000201" }), SAMPEL, syarat("sls")).status).toBe("memenuhi");
    const t = nilaiKelayakan(k({ kode: "1303040001000301" }), SAMPEL, syarat("sls"));
    expect(t.status).toBe("tidak");
    expect(t.alasan[0]).toContain("SLS/jorong");
  });
  it("nagari: memakai 10 digit; kecamatan: 7 digit", () => {
    expect(nilaiKelayakan(k({ kode: "1303040001000999" }), SAMPEL, syarat("nagari")).status).toBe("memenuhi");
    expect(nilaiKelayakan(k({ kode: "1303040002000101" }), SAMPEL, syarat("nagari")).status).toBe("tidak");
    expect(nilaiKelayakan(k({ kode: "1303040002000101" }), SAMPEL, syarat("kecamatan")).status).toBe("memenuhi");
    expect(nilaiKelayakan(k({ kode: "1303050002000401" }), SAMPEL, syarat("kecamatan")).status).toBe("tidak");
  });
  it("kode menang atas nama (nagari bernama sama di kecamatan lain tidak tertukar)", () => {
    // nama sama "BATU BAJANJANG", tetapi kode nagari berbeda (kec 061 vs 070)
    const wil = [w("13030610020001", "TIGO LURAH", "BATU BAJANJANG")];
    const dariKecLain = k({ kode: "1303070006000101", nagari: "(006) BATU BAJANJANG", kecamatan: "LEMBANG JAYA" });
    expect(nilaiKelayakan(dariKecLain, wil, syarat("nagari")).status).toBe("tidak");
    const sama = k({ kode: "1303061002000101", nagari: "BATU BAJANJANG" });
    expect(nilaiKelayakan(sama, wil, syarat("nagari")).status).toBe("memenuhi");
  });
  it("wilayah manual 16 digit (idsubsls) ikut dicocokkan", () => {
    const wil = [w("1303040001000201", "PANTAI CERMIN", "SURIAN")];
    expect(nilaiKelayakan(k({ kode: "1303040001000299" }), wil, syarat("sls")).status).toBe("memenuhi");
  });
});

describe("tanpa kode", () => {
  it("tingkat SLS: perlu melengkapi lokasi", () => {
    const r = nilaiKelayakan(k({ kode: null, kecamatan: "PANTAI CERMIN" }), SAMPEL, syarat("sls"));
    expect(r.status).toBe("perlu_lokasi");
    expect(r.alasan[0]).toContain("Kode SLS");
  });
  it("tingkat nagari/kecamatan: pencocokan nama seperti sebelumnya", () => {
    expect(nilaiKelayakan(k({ nagari: "(001) SURIAN" }), SAMPEL, syarat("nagari")).status).toBe("memenuhi");
    expect(nilaiKelayakan(k({ nagari: "SUNGAI NANAM" }), SAMPEL, syarat("nagari")).status).toBe("tidak");
    expect(nilaiKelayakan(k({ kecamatan: null }), SAMPEL, syarat("kecamatan")).status).toBe("perlu_lokasi");
  });
  it("wilayah sampel tanpa kode (nama saja): kandidat berkode memakai nama; tingkat SLS = perlu lokasi", () => {
    const wilNama = [w("A1", "PANTAI CERMIN", "SURIAN")];
    expect(nilaiKelayakan(k({ kode: "1303040001000201", nagari: "SURIAN" }), wilNama, syarat("nagari")).status).toBe("memenuhi");
    const r = nilaiKelayakan(k({ kode: "1303040001000201" }), wilNama, syarat("sls"));
    expect(r.status).toBe("perlu_lokasi");
    expect(r.alasan[0]).toContain("belum berkode SLS");
  });
});

describe("syarat tidak aktif", () => {
  it("domisili mati -> memenuhi", () => {
    expect(nilaiKelayakan(k(), SAMPEL, { domisili: { aktif: false, level: "sls" }, jarak: { aktif: false, maks_km: 10 } }).status).toBe("memenuhi");
  });
});
