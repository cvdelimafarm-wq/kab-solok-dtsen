// lib/__tests__/revisit.test.ts -- revisit pendataan bencana (31 Okt 2026)
import { describe, expect, it } from "vitest";
import { MAKS_SUB_SEKALI_ATUR, daftarSubRevisit, periksaAturRevisit, revisitBerlaku, tampilkanRevisit, type SubPermintaan } from "../revisit";
import { periksaCatat } from "../pendataan";

const A = "1306010001000100";
const B = "1306010001000200";
const C = "1306010002000100";

describe("periksaAturRevisit", () => {
  it("menerima daftar id sah + aktif, membuang duplikat", () => {
    const r = periksaAturRevisit({ ids: [A, B, A], aktif: true });
    expect(r).toEqual({ ok: true, isi: { ids: [A, B], aktif: true } });
  });
  it("menerima aktif=false (cabut)", () => {
    expect(periksaAturRevisit({ ids: [A], aktif: false })).toEqual({ ok: true, isi: { ids: [A], aktif: false } });
  });
  it("menolak aktif bukan boolean, ids kosong, id tak sah, terlalu banyak", () => {
    expect(periksaAturRevisit({ ids: [A], aktif: "ya" }).ok).toBe(false);
    expect(periksaAturRevisit({ ids: [], aktif: true }).ok).toBe(false);
    expect(periksaAturRevisit({ ids: ["abc"], aktif: true }).ok).toBe(false);
    expect(periksaAturRevisit({ ids: [123], aktif: true }).ok).toBe(false);
    expect(periksaAturRevisit({ aktif: true }).ok).toBe(false);
    expect(periksaAturRevisit(null).ok).toBe(false);
    const banyak = Array.from({ length: MAKS_SUB_SEKALI_ATUR + 1 }, (_, i) => String(1306010000000000 + i));
    expect(periksaAturRevisit({ ids: banyak, aktif: true }).ok).toBe(false);
  });
});

describe("revisitBerlaku & tampilkanRevisit", () => {
  it("revisit hanya bermakna untuk hasil terdampak", () => {
    expect(revisitBerlaku("terdampak", true)).toBe(true);
    expect(revisitBerlaku("terdampak", false)).toBe(false);
    expect(revisitBerlaku("terdampak", "true")).toBe(false);
    expect(revisitBerlaku("tidak_terdampak", true)).toBe(false);
    expect(revisitBerlaku("belum", true)).toBe(false);
  });
  it("pilihan revisit tampil hanya bila Sub SLS bertanda dan bukan mode perbaikan", () => {
    expect(tampilkanRevisit(true, false)).toBe(true);
    expect(tampilkanRevisit(true, true)).toBe(false);
    expect(tampilkanRevisit(false, false)).toBe(false);
    expect(tampilkanRevisit(undefined, false)).toBe(false);
  });
});

describe("periksaCatat membawa revisit", () => {
  const dasar = { kk_id: 5, alasan: null, waktu: "2026-10-31T03:00:00.000Z", kunci: "3f6c0d3e-7d3a-4c1a-9b53-0a1b2c3d4e5f" };
  it("tanpa revisit: bentuk isi tidak berubah (tidak ada kunci revisit)", () => {
    const r = periksaCatat({ ...dasar, hasil: "terdampak" });
    expect(r.ok).toBe(true);
    if (r.ok) expect("revisit" in r.isi).toBe(false);
  });
  it("terdampak + revisit:true -> revisit true", () => {
    const r = periksaCatat({ ...dasar, hasil: "terdampak", revisit: true });
    expect(r.ok && r.isi.revisit).toBe(true);
  });
  it("revisit untuk hasil lain diabaikan, bukan galat (antrean offline tidak boleh macet)", () => {
    for (const hasil of ["tidak_terdampak", "tidak_ditemukan", "belum"]) {
      const r = periksaCatat({ ...dasar, hasil, revisit: true });
      expect(r.ok).toBe(true);
      if (r.ok) expect("revisit" in r.isi).toBe(false);
    }
  });
});

describe("daftarSubRevisit", () => {
  const p = (idsubsls: string, status: string, sls: string, o: Partial<SubPermintaan> = {}): SubPermintaan => ({ idsubsls, status, kecamatan: "Kec X", nagari: "Nag Y", sls, sub_sls: "", pml_nama: "PML", ppl_nama: "PPL", ...o });
  it("hanya Sub SLS sudah keluar; menunggu & dibatalkan tidak ikut", () => {
    const r = daftarSubRevisit([p(A, "sudah_keluar", "A"), p(B, "menunggu", "B"), p(C, "dibatalkan", "C")], new Set());
    expect(r.map((x) => x.idsubsls)).toEqual([A]);
  });
  it("yang masih bertanda tetap tampil walau status lain (supaya bisa dicabut), dan didahulukan", () => {
    const r = daftarSubRevisit([p(A, "sudah_keluar", "A"), p(B, "menunggu", "B")], new Set([B]));
    expect(r.map((x) => [x.idsubsls, x.aktif])).toEqual([[B, true], [A, false]]);
  });
  it("satu baris per Sub SLS, memilih yang sudah keluar bila ada beberapa permintaan", () => {
    const r = daftarSubRevisit([p(A, "menunggu", "A", { ppl_nama: "lama" }), p(A, "sudah_keluar", "A", { ppl_nama: "baru" })], new Set());
    expect(r).toHaveLength(1);
    expect(r[0].ppl_nama).toBe("baru");
  });
  it("urut menurut wilayah", () => {
    const r = daftarSubRevisit([p(C, "sudah_keluar", "Z", { kecamatan: "B" }), p(A, "sudah_keluar", "M", { kecamatan: "A" }), p(B, "sudah_keluar", "A", { kecamatan: "A" })], new Set());
    expect(r.map((x) => x.idsubsls)).toEqual([B, A, C]);
  });
});
