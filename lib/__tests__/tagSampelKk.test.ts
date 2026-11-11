import { describe, expect, it } from "vitest";
import { adalahSintetis, cocokkanKkUnggah, rapatNama, type MasterKk } from "@/lib/tagSampelKk";

const S1 = "1303110001000100";
const S2 = "1303110001000200";
const master: MasterKk[] = [
  { id: 11, idsubsls: S1, nama_kk: "Budi Santoso", anggota_lain: "Siti", patokan: null },
  { id: 12, idsubsls: S1, nama_kk: "Ani Lestari", anggota_lain: null, patokan: null },
  { id: 13, idsubsls: S1, nama_kk: "Joni", anggota_lain: "A", patokan: null },
  { id: 14, idsubsls: S1, nama_kk: "Joni", anggota_lain: "B", patokan: null },
  { id: 21, idsubsls: S2, nama_kk: "Dedi", anggota_lain: null, patokan: null },
];
const alokasi = new Map([[S1, 10], [S2, 10]]);
const baris = (o: Record<string, unknown>) => ({ "Kode Sub SLS": S1, "ID KK": "", "Peran Sampel": "utama", "Nama KK": "", ...o });

describe("cocokkanKkUnggah", () => {
  it("cocok ID", () => {
    const h = cocokkanKkUnggah([baris({ "ID KK": "11" })], master, alokasi);
    expect(h.ringkas.cocok_id).toBe(1);
    expect(h.rows[0]["ID KK"]).toBe("11");
    expect(h.perlu).toHaveLength(0);
  });

  it("cocok nama bila ID kosong", () => {
    const h = cocokkanKkUnggah([baris({ "Nama KK": "  ani  LESTARI " })], master, alokasi);
    expect(h.ringkas.cocok_nama).toBe(1);
    expect(h.rows[0]["ID KK"]).toBe("12");
  });

  it("tidak ada di master -> bawaan tambah dengan ID sintetis", () => {
    const h = cocokkanKkUnggah([baris({ "Nama KK": "Orang Baru" })], master, alokasi);
    expect(h.perlu).toHaveLength(1);
    expect(h.perlu[0].alasan).toBe("tidak_ada");
    expect(h.baru).toHaveLength(1);
    expect(adalahSintetis(h.baru[0].sintetis)).toBe(true);
    expect(h.rows[0]["ID KK"]).toBe(String(h.baru[0].sintetis));
    expect(h.galat).toHaveLength(0);
  });

  it("kandidat banyak wajib diputuskan; keputusan pakai:ID menyelesaikan", () => {
    const a = cocokkanKkUnggah([baris({ "Nama KK": "Joni" })], master, alokasi);
    expect(a.perlu[0].alasan).toBe("kandidat_banyak");
    expect(a.ringkas.belum_diputuskan).toBe(1);
    expect(a.galat).toHaveLength(1);
    const b = cocokkanKkUnggah([baris({ "Nama KK": "Joni" })], master, alokasi, { "2": "pakai:14" });
    expect(b.galat).toHaveLength(0);
    expect(b.rows[0]["ID KK"]).toBe("14");
  });

  it("anggota lain mempersempit kandidat", () => {
    const h = cocokkanKkUnggah([baris({ "Nama KK": "Joni", "Anggota Lain": "B" })], master, alokasi);
    expect(h.rows[0]["ID KK"]).toBe("14");
    expect(h.perlu).toHaveLength(0);
  });

  it("lewati mengosongkan peran", () => {
    const h = cocokkanKkUnggah([baris({ "Nama KK": "Orang Baru" })], master, alokasi, { "2": "lewati" });
    expect(h.rows[0]["Peran Sampel"]).toBe("");
    expect(h.baru).toHaveLength(0);
    expect(h.ringkas.dilewati).toBe(1);
  });

  it("master yang sudah dipakai baris lain tidak dipakai dua kali", () => {
    const h = cocokkanKkUnggah([baris({ "ID KK": "11" }), baris({ "Nama KK": "Budi Santoso" })], master, alokasi);
    expect(h.perlu[0].alasan).toBe("master_terpakai");
    expect(h.baru).toHaveLength(1);
  });

  it("pakai KK dari sub SLS lain ditolak", () => {
    const h = cocokkanKkUnggah([baris({ "Nama KK": "Orang Baru" })], master, alokasi, { "2": "pakai:21" });
    expect(h.galat).toHaveLength(1);
  });

  it("tambah tanpa nama -> galat", () => {
    const h = cocokkanKkUnggah([baris({})], master, alokasi);
    expect(h.galat).toHaveLength(1);
  });

  it("baris bukan sampel dilewatkan apa adanya", () => {
    const h = cocokkanKkUnggah([baris({ "Peran Sampel": "" })], master, alokasi);
    expect(h.rows).toHaveLength(1);
    expect(h.perlu).toHaveLength(0);
  });

  it("rapatNama", () => {
    expect(rapatNama(" Budi,  SANTOSO ")).toBe("budi santoso");
  });
});
