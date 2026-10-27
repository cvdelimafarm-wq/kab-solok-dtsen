import { describe, expect, it } from "vitest";
import { KONFIG_BAWAAN, bentukPeta, galatKonfig, hasilAktif, lencanaHasil, normalisasiKonfig, rapikanKonfig, salinBawaan, samaDenganBawaan } from "../lembarKonfig";

describe("lembarKonfig", () => {
  it("bawaan sah dan sama dengan tampilan Pascabencana sekarang", () => {
    expect(galatKonfig(KONFIG_BAWAAN)).toEqual([]);
    expect(samaDenganBawaan(KONFIG_BAWAAN)).toBe(true);
    expect(KONFIG_BAWAAN.hasil.terdampak.label).toBe("Didata, terdampak");
    expect(KONFIG_BAWAAN.hasil.tidak_ditemukan.alasan).toEqual(["Rumah kosong", "Pindah", "Menolak", "Alamat tidak ada"]);
    expect(lencanaHasil(KONFIG_BAWAAN, "tidak_terdampak")).toEqual(["#E6EEFC", "#1F5FD1", "Tidak"]);
    expect(lencanaHasil(KONFIG_BAWAAN, null)).toEqual(["#EEF2F7", "#5B6B84", "Belum"]);
    expect(bentukPeta(KONFIG_BAWAAN)).toEqual({ terdampak: "bulat_penuh", tidak_terdampak: "bulat_kosong", tidak_ditemukan: "belah_ketupat" });
  });
  it("bacaan longgar: kosong / rusak -> bawaan; sebagian -> digabung", () => {
    expect(normalisasiKonfig(null)).toEqual(KONFIG_BAWAAN);
    expect(normalisasiKonfig("rusak")).toEqual(KONFIG_BAWAAN);
    const k = normalisasiKonfig({ hasil: { terdampak: { label: "  KK ada,   sesuai ", warna: "#ff0000", bentuk: "kotak" }, tidak_terdampak: { warna: "merah", bentuk: "bintang" } }, radar: { radius_awal: 30 } });
    expect(k.hasil.terdampak.label).toBe("KK ada, sesuai");
    expect(k.hasil.terdampak.warna).toBe("#FF0000");
    expect(k.hasil.terdampak.bentuk).toBe("kotak");
    expect(k.hasil.tidak_terdampak.warna).toBe(KONFIG_BAWAAN.hasil.tidak_terdampak.warna);
    expect(k.hasil.tidak_terdampak.bentuk).toBe("bulat_kosong");
    expect(k.radar.radius_awal).toBe(30);
  });
  it("aturan: tidak ditemukan selalu aktif, minimal satu hasil didata aktif", () => {
    const k = normalisasiKonfig({ hasil: { terdampak: { aktif: false }, tidak_terdampak: { aktif: false }, tidak_ditemukan: { aktif: false } } });
    expect(hasilAktif(k)).toEqual(["terdampak", "tidak_ditemukan"]);
    const k2 = normalisasiKonfig({ hasil: { tidak_terdampak: { aktif: false } } });
    expect(hasilAktif(k2)).toEqual(["terdampak", "tidak_ditemukan"]);
  });
  it("alasan dirapikan: unik, dipangkas, maksimal 8", () => {
    const k = normalisasiKonfig({ hasil: { tidak_ditemukan: { alasan: ["A", " a ", "B", "", ...Array.from({ length: 12 }, (_, i) => `X${i}`)] } } });
    expect(k.hasil.tidak_ditemukan.alasan.slice(0, 2)).toEqual(["A", "B"]);
    expect(k.hasil.tidak_ditemukan.alasan).toHaveLength(8);
    expect(normalisasiKonfig({ hasil: { tidak_ditemukan: { alasan: [] } } }).hasil.tidak_ditemukan.alasan).toEqual([]);
  });
  it("radar: batas, pilihan cepat dalam rentang, radius awal dalam rentang", () => {
    const k = normalisasiKonfig({ radar: { radius_min: 20, radius_maks: 300, radius_awal: 999, radius_pilihan: [5, 50, 50, 900, 120], putar_detik: 99, gerak_minimal_m: 1, tampilan_awal: "rincian" } });
    expect(k.radar.radius_awal).toBe(300);
    expect(k.radar.radius_pilihan).toEqual([20, 50, 120, 300]);
    expect(k.radar.putar_detik).toBe(12);
    expect(k.radar.gerak_minimal_m).toBe(3);
    expect(k.radar.tampilan_awal).toBe("rincian");
    expect(normalisasiKonfig({ radar: { radius_min: 500, radius_maks: 100 } }).radar.radius_maks).toBe(500);
  });
  it("bacaan ketat: pesan galat jelas", () => {
    expect(galatKonfig(null)).toEqual(["Isian pengaturan tidak terbaca."]);
    const k = salinBawaan();
    k.hasil.terdampak.label = "";
    k.hasil.tidak_terdampak.warna = "biru";
    k.hasil.tidak_ditemukan.aktif = false;
    k.hasil.tidak_ditemukan.alasan = ["Pindah", "pindah"];
    k.radar.radius_awal = 5000;
    k.radar.radius_pilihan = [50, 50];
    const g = galatKonfig(k).join(" | ");
    expect(g).toMatch(/Nama tombol wajib diisi/);
    expect(g).toMatch(/#RRGGBB/);
    expect(g).toMatch(/selalu aktif/);
    expect(g).toMatch(/alasan yang sama/);
    expect(g).toMatch(/radius awal/);
    expect(g).toMatch(/kembar|di antara/);
    const k2 = salinBawaan();
    k2.hasil.tidak_terdampak.label = "didata, terdampak";
    expect(galatKonfig(k2).join()).toMatch(/tidak boleh sama/);
    const k3 = salinBawaan();
    k3.hasil.terdampak.aktif = false;
    k3.hasil.tidak_terdampak.aktif = false;
    expect(galatKonfig(k3).join()).toMatch(/satu dari hasil 1 atau hasil 2/);
  });
  it("contoh Updating sah dan dirapikan", () => {
    const k = salinBawaan();
    k.hasil.terdampak = { ...k.hasil.terdampak, label: "KK ada, data sesuai", label_pendek: "Sesuai", label_pil: "Sesuai", subteks: "Keluarga ada dan datanya sama", warna: "#157A3E", pil_latar: "#157A3E", bentuk: "bulat_penuh" };
    k.hasil.tidak_terdampak = { ...k.hasil.tidak_terdampak, label: "KK ada, data berubah", label_pendek: "Berubah", label_pil: "Berubah", subteks: "Anggota atau alamat berubah", alasan: ["Anggota bertambah", "Anggota berkurang", "Pindah alamat dalam SLS"] };
    k.hasil.tidak_ditemukan = { ...k.hasil.tidak_ditemukan, label: "Pindah / tidak ada", label_pendek: "Pindah", label_pil: "Pindah" };
    k.radar.radius_awal = 50;
    expect(galatKonfig(k)).toEqual([]);
    const r = rapikanKonfig(k);
    expect(r.hasil.terdampak.label).toBe("KK ada, data sesuai");
    expect(samaDenganBawaan(r)).toBe(false);
  });
});

import { contohUpdating } from "../lembarKonfig";
describe("contohUpdating", () => {
  it("sah, beda dari bawaan, kategori tetap tiga", () => {
    const k = contohUpdating();
    expect(galatKonfig(k)).toEqual([]);
    expect(samaDenganBawaan(k)).toBe(false);
    expect(Object.keys(k.hasil)).toEqual(["terdampak", "tidak_terdampak", "tidak_ditemukan"]);
    expect(k.radar.radius_pilihan).toEqual([30, 50, 100, 200]);
    expect(rapikanKonfig(k)).toEqual(k);
  });
});
