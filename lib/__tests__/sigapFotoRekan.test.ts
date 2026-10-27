// lib/__tests__/sigapFotoRekan.test.ts
//
// (27 Okt 2026) Foto rekan yang sudah diterima lalu tergeser (tag 'dilepas') muncul lagi di Foto cadangan.

import { describe, expect, it } from "vitest";
import { labelDariRekan, layakCadanganRekan, type FotoRekan, type TagRekan } from "@/lib/sigapFotoRekan";

const k = { penugasanId: 53, akunId: 699, idDok: [11, 12] as number[] };
const foto = (p: Partial<FotoRekan> = {}): FotoRekan => ({ id: 70, akun_pengambil: 91, kepercayaan: "hijau", status_periksa: "belum", ...p });
const tag = (p: Partial<TagRekan> = {}): TagRekan => ({ id: 5, foto_id: 70, akun_id: 699, peran_tag: "tim", status: "dilepas", penugasan_id: 53, ...p });

describe("layakCadanganRekan", () => {
  it("foto tim yang tergeser (dilepas) layak; luar_tim juga", () => {
    expect(layakCadanganRekan(foto(), tag(), k)).toBe(true);
    expect(layakCadanganRekan(foto(), tag({ peran_tag: "luar_tim" }), k)).toBe(true);
  });

  it("hanya status 'dilepas': diajukan, diterima, ditolak, ditahan tidak", () => {
    for (const status of ["diajukan", "diterima", "ditolak", "ditahan"]) expect(layakCadanganRekan(foto(), tag({ status }), k)).toBe(false);
  });

  it("tag pemotret (foto sendiri) bukan urusan jalur ini", () => {
    expect(layakCadanganRekan(foto(), tag({ peran_tag: "pemotret" }), k)).toBe(false);
    expect(layakCadanganRekan(foto({ akun_pengambil: 699 }), tag(), k)).toBe(false);
    expect(layakCadanganRekan(foto({ akun_pengambil: null }), tag(), k)).toBe(false);
  });

  it("tag milik akun lain atau penugasan lain ditolak; penugasan kosong diterima", () => {
    expect(layakCadanganRekan(foto(), tag({ akun_id: 1 }), k)).toBe(false);
    expect(layakCadanganRekan(foto(), tag({ penugasan_id: 99 }), k)).toBe(false);
    expect(layakCadanganRekan(foto(), tag({ penugasan_id: null }), k)).toBe(true);
  });

  it("foto yang sedang bernomor tidak layak", () => {
    expect(layakCadanganRekan(foto({ id: 11 }), tag({ foto_id: 11 }), k)).toBe(false);
  });

  it("tag tidak cocok dengan fotonya ditolak", () => {
    expect(layakCadanganRekan(foto({ id: 71 }), tag(), k)).toBe(false);
  });

  it("dipertanyakan, merah belum diperiksa, dan foto terhapus tidak layak; merah yang sudah diperiksa layak", () => {
    expect(layakCadanganRekan(foto({ status_periksa: "dipertanyakan" }), tag(), k)).toBe(false);
    expect(layakCadanganRekan(foto({ kepercayaan: "merah" }), tag(), k)).toBe(false);
    expect(layakCadanganRekan(foto({ kepercayaan: "merah", status_periksa: "diperiksa" }), tag(), k)).toBe(true);
    expect(layakCadanganRekan(foto({ kepercayaan: "kuning" }), tag(), k)).toBe(true);
    expect(layakCadanganRekan(foto({ file_dihapus_at: "2026-10-27T01:00:00Z" }), tag(), k)).toBe(false);
    expect(layakCadanganRekan(foto({ hapus_disetujui_at: "2026-10-27T01:00:00Z" }), tag(), k)).toBe(false);
  });
});

describe("labelDariRekan", () => {
  it("memakai nama; nama kosong -> 'dari rekan'", () => {
    expect(labelDariRekan("Dina Putri")).toBe("dari Dina Putri");
    expect(labelDariRekan("  ")).toBe("dari rekan");
    expect(labelDariRekan(null)).toBe("dari rekan");
  });
});
