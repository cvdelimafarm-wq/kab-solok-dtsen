import { describe, expect, it } from "vitest";
import { SETELAN_ESKALASI_AWAL as S, argsJawab, galatJawab, saranBina, sisaJamJelas, teksJawaban, terbukaLewatJawab, type ButirEskalasi, type IsianJawab } from "@/lib/delego/eskalasi";

const kosong: IsianJawab = { putusan: null, catatan: "", tenggat: "", target: "", ke: null };
const HARI = "2026-11-14";

describe("galatJawab", () => {
  it("wajib memilih jawaban dan catatan minimal 10 huruf", () => {
    expect(galatJawab(kosong, HARI)).toMatch(/Pilih/);
    expect(galatJawab({ ...kosong, putusan: "tetap_bantuan", catatan: "pendek" }, HARI)).toMatch(/Catatan/);
    expect(galatJawab({ ...kosong, putusan: "tetap_bantuan", catatan: "Dibantu rekan satu tim" }, HARI)).toBeNull();
  });
  it("perpanjang wajib tenggat yang tidak mundur", () => {
    const f = { ...kosong, putusan: "perpanjang" as const, catatan: "Diperpanjang seminggu" };
    expect(galatJawab(f, HARI)).toMatch(/tenggat/);
    expect(galatJawab({ ...f, tenggat: "2026-11-13" }, HARI)).toMatch(/tenggat/);
    expect(galatJawab({ ...f, tenggat: "2026-11-20" }, HARI)).toBeNull();
  });
  it("kurangi wajib target, alihkan wajib penerima", () => {
    expect(galatJawab({ ...kosong, putusan: "kurangi", catatan: "Target terlalu besar" }, HARI)).toMatch(/target/);
    expect(galatJawab({ ...kosong, putusan: "kurangi", catatan: "Target terlalu besar", target: "40" }, HARI)).toBeNull();
    expect(galatJawab({ ...kosong, putusan: "alihkan", catatan: "Penerima sedang cuti" }, HARI)).toMatch(/penerima/);
    expect(galatJawab({ ...kosong, putusan: "alihkan", catatan: "Penerima sedang cuti", ke: 12 }, HARI)).toBeNull();
  });
});

describe("argsJawab", () => {
  it("menyusun argumen fungsi basis data", () => {
    expect(argsJawab(5, { putusan: "kurangi", catatan: " Dikurangi ", tenggat: "2026-11-20", target: "40,5", ke: null })).toEqual({
      p_id: 5, p_putusan: "kurangi", p_catatan: "Dikurangi", p_data: { tenggat: "2026-11-20", target_total: 40.5 },
    });
    expect(argsJawab(6, { putusan: "batalkan", catatan: "Tidak diperlukan lagi", tenggat: "2026-11-20", target: "", ke: null }).p_data).toEqual({});
  });
});

describe("teksJawaban dan saran", () => {
  it("menerangkan jawaban untuk pegawai", () => {
    expect(teksJawaban({ putusan: "perpanjang", data: { tenggat: "2026-11-20" } }, (t) => t)).toBe("Tenggat diperpanjang sampai 2026-11-20");
    expect(teksJawaban({ putusan: "batalkan", data: null }, (t) => t)).toBe("Pekerjaan dibatalkan");
  });
  it("saran pembinaan mulai 3 kali dalam 30 hari", () => {
    expect(saranBina(2, S)).toBe(false);
    expect(saranBina(3, S)).toBe(true);
  });
  it("sisa jam penjelasan", () => {
    expect(sisaJamJelas("2026-11-15T03:00:00Z", new Date("2026-11-14T03:00:00Z"))).toBe(24);
    expect(sisaJamJelas("2026-11-14T02:00:00Z", new Date("2026-11-14T03:00:00Z"))).toBe(-1);
  });
  it("menghitung butir terbuka yang lewat batas jawab", () => {
    const b = (x: Partial<ButirEskalasi>) => ({ ditutup_at: null, lewat_jawab: false, ...x }) as ButirEskalasi;
    expect(terbukaLewatJawab([b({ lewat_jawab: true }), b({}), b({ lewat_jawab: true, ditutup_at: "x" })])).toBe(1);
  });
});
