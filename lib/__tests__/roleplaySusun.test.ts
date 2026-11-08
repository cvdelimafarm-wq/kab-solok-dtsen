import { describe, expect, it } from "vitest";
import { ringkasLangkah, semuaSatuan, susunHasilPeserta, susunPemetaan, susunRekap, tandaGabungan, teksCakupan, type LangkahBaris } from "@/lib/vanguard/roleplay/susun";
import { KOSONG, kunciIv1, kunciSel, tandaPeserta, type IsianRoleplay, type PesertaIsian } from "@/lib/vanguard/roleplay/penilaian";

// (8 Nov 2026) roleplay: bahan layar instruktur dan peserta.
const L1: LangkahBaris = { id: 11, nomor: 1, bagian: "iv1", dari: 2, sampai: 3, status: "diperiksa", diperiksa_at: null, selesai_at: null };
const beras = (k2: number): IsianRoleplay => ({ iv1: [{ r: 2, k1: 2, k2 }] });
const peserta: PesertaIsian[] = [{ akun_id: 1, isian: beras(30000) }, { akun_id: 2, isian: beras(30000) }, { akun_id: 3, isian: beras(32000) }, { akun_id: 4, isian: null }];
const nama = new Map([[1, "Ani"], [2, "Budi"], [3, "Cici"], [4, "Dodi"]]);
const sigBenar = tandaPeserta(beras(30000)).get(kunciIv1(2)) as string;

describe("ringkasan dan pemetaan", () => {
  it("teks cakupan", () => {
    expect(teksCakupan(L1)).toBe("Blok IV.1 · R2–R3");
    expect(teksCakupan({ bagian: "A", dari: null, sampai: null })).toBe("Blok V.A");
    expect(teksCakupan({ bagian: "VII", dari: null, sampai: null })).toBe("Blok VII");
  });
  it("ringkasan: perlu tanda = satuan terisi; siap lanjut hanya bila semua ditandai", () => {
    const belum = ringkasLangkah(L1, peserta, new Map());
    expect(belum).toMatchObject({ satuan_total: 2, perlu_tanda: 1, sudah_tanda: 0, siap_lanjut: false });
    const sudah = ringkasLangkah(L1, peserta, new Map([[11, new Map([[kunciIv1(2), [sigBenar]]])]]));
    expect(sudah).toMatchObject({ sudah_tanda: 1, siap_lanjut: true });
    expect(ringkasLangkah({ ...L1, status: "berjalan" }, peserta, new Map([[11, new Map([[kunciIv1(2), [sigBenar]]])]])).siap_lanjut).toBe(false);
  });
  it("pemetaan: variasi terbanyak dulu, ada nama peserta, 'Tidak diisi' ikut; benar null sebelum ditandai", () => {
    const p = susunPemetaan(L1, peserta, nama, new Map());
    expect(p.satuan).toHaveLength(1);
    const v = p.satuan[0].variasi;
    expect(v.map((x) => x.jumlah)).toEqual([2, 1, 1]);
    expect(v[0].nama).toEqual(["Ani", "Budi"]);
    expect(v.some((x) => x.tanda === KOSONG && x.nama[0] === "Dodi")).toBe(true);
    expect(v.every((x) => x.benar === null)).toBe(true);
    expect(p.satuan[0].ditandai).toBe(false);
  });
  it("pemetaan sesudah ditandai: variasi benar bernilai true, lainnya false", () => {
    const p = susunPemetaan(L1, peserta, nama, new Map([[11, new Map([[kunciIv1(2), [sigBenar]]])]]));
    expect(p.satuan[0].ditandai).toBe(true);
    expect(p.satuan[0].variasi.filter((x) => x.benar).map((x) => x.jumlah)).toEqual([2]);
  });
});

describe("hasil dan rekap", () => {
  const tandaPer = new Map([[11, new Map([[kunciIv1(2), [sigBenar]]])]]);
  const gab = tandaGabungan(tandaPer);
  const cakupan = semuaSatuan([L1]);
  it("review warna: benar, salah (dengan jawaban benar), kosong", () => {
    expect(susunHasilPeserta(1, peserta[0].isian, cakupan, gab).review[0].hasil).toBe("benar");
    const salah = susunHasilPeserta(3, peserta[2].isian, cakupan, gab);
    expect(salah.review[0]).toMatchObject({ hasil: "salah", skor: -0.3 });
    expect(salah.review[0].benar[0]).toContain("30.000");
    expect(salah.poin).toBe(0);
    expect(susunHasilPeserta(4, null, cakupan, gab).review[0]).toMatchObject({ hasil: "kosong", skor: -0.3 });
  });
  it("kotak yang nilainya salah letak: petunjuk menunjuk kotak tempat nilai itu ditulis", () => {
    const l: LangkahBaris = { id: 12, nomor: 2, bagian: "A", dari: null, sampai: null, status: "diperiksa", diperiksa_at: null, selesai_at: null };
    const t = new Map([[12, new Map([[kunciSel("a1_uang"), ["2500000"]]])]]);
    const h = susunHasilPeserta(9, { nilai: { a2_uang: 2500000 } }, semuaSatuan([l]), tandaGabungan(t));
    expect(h.review[0].hasil).toBe("kosong");
    expect(h.review[0].salah_letak[0].nilai).toBe(2500000);
    expect(h.review[0].salah_letak[0].label).toContain("V.A");
  });
  it("selisih periode terdeteksi pada jawaban salah", () => {
    const l: LangkahBaris = { id: 13, nomor: 1, bagian: "VI", dari: null, sampai: null, status: "diperiksa", diperiksa_at: null, selesai_at: null };
    const t = tandaGabungan(new Map([[13, new Map([[kunciSel("vi_g1"), ["12000000"]]])]]));
    const h = susunHasilPeserta(9, { nilai: { vi_g1: 1000000 } }, semuaSatuan([l]), t);
    expect(h.review[0]).toMatchObject({ hasil: "salah" });
    expect(h.review[0].konversi?.kode).toBe("bagi12");
  });
  it("rekap kelas: urut poin, kolom sudah_isi", () => {
    const r = susunRekap(peserta, nama, cakupan, gab);
    expect(r.map((x) => x.nama)).toEqual(["Ani", "Budi", "Cici", "Dodi"]);
    expect(r[0]).toMatchObject({ poin: 100, benar: 1, sudah_isi: true });
    expect(r.find((x) => x.nama === "Dodi")).toMatchObject({ kosong: 1, sudah_isi: false });
  });
});
