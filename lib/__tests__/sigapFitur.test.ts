import { describe, expect, it } from "vitest";
import {
  BAWAAN_STRATEGI, FITUR, KEGIATAN_DATA_STATUS, KODE_FITUR, STRATEGI, bacaProfilFitur, centangBeda, defFitur, fiturEfektif, fiturSah, fiturTersedia, strategiBawaanKegiatan, strategiSah,
  subQcTampil, tabAktifKelola, tabTampilKelola, type PetaFitur,
} from "@/lib/sigapFitur";

const SEMUA_TAB = ["ringkasan", "persiapan", "tim", "siaran", "qc", "monitoring", "pemeriksaan", "administrasi", "laporan"];

describe("daftar fitur", () => {
  it("kode unik dan lengkap", () => {
    expect(new Set(KODE_FITUR).size).toBe(FITUR.length);
    expect(KODE_FITUR).toHaveLength(16);
    expect(fiturSah("laporan")).toBe(true);
    expect(fiturSah("tidakada")).toBe(false);
  });
  it("setiap paket bawaan hanya berisi kode yang dikenal dan fitur yang tersedia", () => {
    for (const s of STRATEGI) {
      for (const k of BAWAAN_STRATEGI[s.kode]) {
        expect(KODE_FITUR).toContain(k);
        // paket status_per_sasaran dihitung untuk kegiatan data status; paket lain hanya fitur umum
        expect(fiturTersedia(s.kode, k, KEGIATAN_DATA_STATUS)).toBe(true);
      }
    }
  });
  it("strategi sah dan bawaan per kegiatan", () => {
    expect(strategiSah("lembar_bantu")).toBe(true);
    expect(strategiSah("sampel_sls")).toBe(true);
    expect(strategiSah("acak")).toBe(false);
    expect(strategiBawaanKegiatan(1)).toBe("status_per_sasaran");
    expect(strategiBawaanKegiatan(2)).toBe("umum");
  });
});

describe("fiturEfektif", () => {
  it("Pascabencana (strategi status, kegiatan 1) menyalakan seluruh fitur = perilaku sebelum profil fitur", () => {
    const f = fiturEfektif("status_per_sasaran", {}, 1);
    expect(KODE_FITUR.every((k) => f[k])).toBe(true);
    expect(tabTampilKelola(f)).toEqual(SEMUA_TAB);
  });
  it("SPDT NTP (lembar bantu, kegiatan 2) hanya fitur umum = tab yang kini tersedia", () => {
    const f = fiturEfektif("lembar_bantu", {}, 2);
    expect(tabTampilKelola(f)).toEqual(["persiapan", "tim", "siaran", "qc", "administrasi"]);
    expect(f.tim_alokasi).toBe(false);
    expect(f.qc_kuesioner).toBe(false);
    expect(f.qc_dokumen).toBe(true);
  });
  it("fitur terikat data Pascabencana tetap mati untuk kegiatan lain walau strategi status atau centang menyalakannya", () => {
    const f = fiturEfektif("status_per_sasaran", { monitoring: true, laporan: true }, 7);
    expect(f.monitoring).toBe(false);
    expect(f.laporan).toBe(false);
    const g = fiturEfektif("lembar_bantu", { monitoring: true }, 2);
    expect(g.monitoring).toBe(false);
  });
  it("centang tersimpan mengganti bawaan pada fitur yang tersedia", () => {
    const f = fiturEfektif("lembar_bantu", { siaran: false, qc_dokumen: false }, 2);
    expect(f.siaran).toBe(false);
    expect(f.qc_dokumen).toBe(false);
    expect(f.tim_penugasan).toBe(true);
    const g = fiturEfektif("umum", { qc_pemahaman: true, tim_penugasan: false }, 9);
    expect(g.tim_penugasan).toBe(false);
  });
  it("kegiatan pelatihan hanya penugasan, siaran, administrasi", () => {
    const f = fiturEfektif("pelatihan", {}, 3);
    expect(tabTampilKelola(f)).toEqual(["persiapan", "tim", "siaran", "administrasi"]);
  });
  it("Sakernas dan Seruti (sampel per SLS) memakai fitur umum", () => {
    const f = fiturEfektif("sampel_sls", {}, 11);
    expect(tabTampilKelola(f)).toEqual(["persiapan", "tim", "siaran", "qc", "administrasi"]);
  });
});

describe("centangBeda", () => {
  it("hanya selisih terhadap bawaan; kembali ke bawaan = kosong", () => {
    const bawaan = fiturEfektif("lembar_bantu", {}, 2);
    expect(centangBeda("lembar_bantu", bawaan, 2)).toEqual({});
    expect(centangBeda("lembar_bantu", { ...bawaan, siaran: false }, 2)).toEqual({ siaran: false });
  });
  it("fitur tidak tersedia tidak pernah disimpan", () => {
    const peta = { ...fiturEfektif("lembar_bantu", {}, 2), monitoring: true } as PetaFitur;
    expect(centangBeda("lembar_bantu", peta, 2)).toEqual({});
  });
  it("pergi-pulang: efektif(centangBeda(x)) = x", () => {
    const x = { ...fiturEfektif("status_per_sasaran", {}, 1), monitoring: false, laporan: false };
    expect(fiturEfektif("status_per_sasaran", centangBeda("status_per_sasaran", x, 1), 1)).toEqual(x);
  });
});

describe("bacaProfilFitur (JSON tak tepercaya)", () => {
  it("nilai rusak diganti bawaan kegiatan", () => {
    expect(bacaProfilFitur(null, 1)).toEqual({ strategi: "status_per_sasaran", centang: {} });
    expect(bacaProfilFitur({ strategi: "ngawur", centang: { laporan: "ya", xx: true, siaran: false } }, 2)).toEqual({ strategi: "umum", centang: { siaran: false } });
    expect(bacaProfilFitur({ strategi: "sampel_sls", centang: [] }, 5)).toEqual({ strategi: "sampel_sls", centang: {} });
  });
});

describe("tab Kelola", () => {
  it("Persiapan selalu tampil, bahkan bila semua fitur mati", () => {
    const mati = Object.fromEntries(KODE_FITUR.map((k) => [k, false])) as PetaFitur;
    expect(tabTampilKelola(mati)).toEqual(["persiapan"]);
  });
  it("tabAktifKelola: tab yang dimatikan jatuh ke tab tampil pertama", () => {
    expect(tabAktifKelola("monitoring", ["persiapan", "tim"])).toBe("persiapan");
    expect(tabAktifKelola("tim", ["persiapan", "tim"])).toBe("tim");
  });
  it("subQcTampil mengikuti fitur QC", () => {
    const f = fiturEfektif("lembar_bantu", { qc_pemahaman: false }, 2);
    expect(subQcTampil(f)).toEqual({ hari: false, pengaturan: false, soal: false, dokumen: true, kuesioner: false });
    expect(defFitur("qc_dokumen").bergantung).toBe("umum");
  });
});
