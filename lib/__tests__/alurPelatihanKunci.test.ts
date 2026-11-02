import { describe, expect, it } from "vitest";
import { hitungLangkahPelatihan, statusLangkah, type MasukanLangkah } from "../alurPelatihan";

const dasar = (tes: MasukanLangkah["tes"]): MasukanLangkah => ({
  langkah: { undangan_dibuka: true, instrumen_diunduh: true, foto_total: 5, slot: [] },
  tes,
  presensi: null,
  kuis: null,
  fotoTranslok: false,
  mulaiMs: Date.parse("2026-11-09T01:00:00Z"),
  now: Date.parse("2026-11-09T04:00:00Z"),
});
const cari = (m: MasukanLangkah, kode: string) => hitungLangkahPelatihan(m).find((l) => l.kode === kode)!;

describe("langkah tes yang terkunci (blokir tahapan)", () => {
  it("tes terbuka tetapi terkunci: bukan 'bisa sekarang' dan ditandai terkunci", () => {
    const l = cari(dasar([{ jenis: "posttest", status: "buka", terkunci: { oleh: "pretest" } }]), "posttest");
    expect(l.bisaSekarang).toBe(false);
    expect(l.terkunci).toBe(true);
    expect(l.selesai).toBe(false);
  });
  it("tanpa kunci: perilaku lama, tanpa properti terkunci", () => {
    const l = cari(dasar([{ jenis: "posttest", status: "buka" }]), "posttest");
    expect(l.bisaSekarang).toBe(true);
    expect("terkunci" in l).toBe(false);
    expect("terkunci" in cari(dasar([{ jenis: "posttest", status: "buka", terkunci: null }]), "posttest")).toBe(false);
  });
  it("tes yang sedang dikerjakan tidak diputus oleh kunci", () => {
    // sesi yang sudah berjalan tidak pernah dikunci server; hub tidak mengirim terkunci untuk status ini, tetapi bila terkirim tetap tidak 'bisa sekarang'
    expect(cari(dasar([{ jenis: "posttest", status: "mengerjakan" }]), "posttest").bisaSekarang).toBe(true);
  });
  it("pretest yang belum selesai tetap menjadi langkah 'Berikutnya' ketika posttest terkunci", () => {
    const m = dasar([{ jenis: "pretest", status: "buka" }, { jenis: "posttest", status: "buka", terkunci: { oleh: "pretest" } }]);
    const daftar = hitungLangkahPelatihan(m);
    const st = statusLangkah(daftar);
    const iPre = daftar.findIndex((l) => l.kode === "pretest");
    const iPost = daftar.findIndex((l) => l.kode === "posttest");
    expect(st[iPre]).toBe("sekarang");
    expect(st[iPost]).toBe("menyusul");
  });
});
