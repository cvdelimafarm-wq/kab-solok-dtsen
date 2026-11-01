import { describe, expect, it } from "vitest";
import { KODE_KEGIATAN_PELATIHAN } from "../sigapTes";
import { judulPelatihan, tujuanKembali } from "../sigapPelatihanNama";

describe("judulPelatihan", () => {
  it("PSP memakai judul lama; pelatihan lain memakai nama kegiatan; belum termuat -> Pelatihan", () => {
    expect(judulPelatihan({ kode: KODE_KEGIATAN_PELATIHAN, nama: "Pelatihan Petugas PSP Pascabencana 2026" })).toBe("Pelatihan PSP Pascabencana 2026");
    expect(judulPelatihan({ kode: "pelatihan_seruti_tw4_2026", nama: " Pelatihan Petugas Seruti Triwulan IV 2026 " })).toBe("Pelatihan Petugas Seruti Triwulan IV 2026");
    expect(judulPelatihan({ kode: "x", nama: "  " })).toBe("Pelatihan");
    expect(judulPelatihan(null)).toBe("Pelatihan");
    expect(judulPelatihan(undefined)).toBe("Pelatihan");
  });
});

describe("tujuanKembali", () => {
  it("induk pelatihan; tanpa induk atau kode aneh -> Pascabencana", () => {
    expect(tujuanKembali({ induk_kode: "seruti_tw4" })).toBe("/sigap/kegiatan/seruti_tw4");
    expect(tujuanKembali({ induk_kode: "pascabencana" })).toBe("/sigap/kegiatan/pascabencana");
    expect(tujuanKembali({ induk_kode: null })).toBe("/sigap/kegiatan/pascabencana");
    expect(tujuanKembali(null)).toBe("/sigap/kegiatan/pascabencana");
    expect(tujuanKembali({ induk_kode: "../x?y" })).toBe("/sigap/kegiatan/pascabencana");
  });
});
