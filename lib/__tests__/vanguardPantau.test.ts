import { describe, expect, it } from "vitest";
import { SEL_PER_BLOK } from "../vanguard/sel";
import { KOLOM_IV1, KOLOM_IV2, SKEMA_PANTAU, adaKolomPantau, kolomCetakKeVariabelIv1, kolomRekapIv32, namaVariabelKomoditas, petaSel, tabelKomoditas } from "../vanguard/pantau/peta";

describe("pemetaan ke nama kolom PANTAU (V6-pra)", () => {
  it("skema.json memuat 10 berkas ekspor dan hanya nama/tipe kolom (tanpa data)", () => {
    expect(Object.keys(SKEMA_PANTAU)).toHaveLength(10);
    for (const t of Object.values(SKEMA_PANTAU)) { expect(t.kolom.length).toBeGreaterThan(30); for (const k of t.kolom) expect(Object.keys(k).sort().join()).toMatch(/^(d,)?n,p,t$/); }
  });
  it("setiap id sel V.A–VII punya padanan, dan kolomnya ada di skema PANTAU", () => {
    const semua = Object.values(SEL_PER_BLOK).flat();
    expect(semua.length).toBe(88);
    for (const s of semua) {
      const p = petaSel(s.id);
      expect(p, s.id).not.toBeNull();
      expect(adaKolomPantau(p!.tabel, p!.kolom), `${s.id} → ${p!.tabel}.${p!.kolom}`).toBe(true);
    }
  });
  it("tiap kolom PANTAU hanya dipakai satu id (per baris untuk tabel ART)", () => {
    const peta = new Map<string, string>();
    for (const s of Object.values(SEL_PER_BLOK).flat()) {
      const p = petaSel(s.id)!; const k = `${p.tabel}.${p.kolom}#${p.baris ?? 0}`;
      expect(peta.has(k), `${s.id} bentrok dengan ${peta.get(k)}`).toBe(false);
      peta.set(k, s.id);
    }
  });
  it("contoh padanan: upah uang = B5AK5; produksi usaha = B5BK5; transfer RT lain uang dibayar = B5ER3K4; tambah lahan = B5GR4K2; VII pengambilan tabungan = B7R1K2", () => {
    expect(petaSel("a1_uang")).toMatchObject({ tabel: "ART_B5A", kolom: "B5AK5", baris: 1, kepastian: "pasti" });
    expect(petaSel("b2_produksi")).toMatchObject({ tabel: "ART_B5B", kolom: "B5BK5", baris: 2 });
    expect(petaSel("e_rtLain_uangB")?.kolom).toBe("B5ER3K4");
    expect(petaSel("e_bantuan_barangD")?.kolom).toBe("B5ER12K3");
    expect(petaSel("d_keuntunganSaham_diterima")?.kolom).toBe("B5DR3K2");
    expect(petaSel("f_pemerintah_lahanB")?.kolom).toBe("B5FR1K5");
    expect(petaSel("g_lahan_tambah")?.kolom).toBe("B5GR4K2");
    expect(petaSel("vii_p1")?.kolom).toBe("B7R1K2");
    expect(petaSel("tidak_ada")).toBeNull();
  });
  it("komoditas: R.x → tabel; kolom (5)–(10) → KOLOM1–6; kolom rekap B432 ada", () => {
    expect([1, 186, 187, 225, 226, 347, 348].map(tabelKomoditas)).toEqual(["Komoditi_Makanan_RT", "Komoditi_Makanan_RT", "Komoditi_Makanan_ART", "Komoditi_Makanan_ART", "Komoditi_Non_Makanan", "Komoditi_Non_Makanan", null]);
    for (const [k, kol] of Object.entries(KOLOM_IV1)) { expect(Number(k)).toBeGreaterThanOrEqual(5); expect(adaKolomPantau("Komoditi_Makanan_RT", kol) || kol === "KOLOM7", kol).toBe(true); }
    for (const kol of Object.values(KOLOM_IV2)) expect(adaKolomPantau("Komoditi_Non_Makanan", kol), kol).toBe(true);
    for (let r = 1; r <= 16; r++) for (const k of [3, 4, 5] as const) expect(adaKolomPantau("Rekap_B43_RT", kolomRekapIv32(r, k)), `${r}/${k}`).toBe(true);
  });
  it("dua dialek: V.A/V.B per baris dan barang berharga V.G punya nama berbeda pada aturan konsistensi PANTAU; selebihnya sama", () => {
    expect(petaSel("a1_uang")).toMatchObject({ kolom: "B5AK5", aturan: "MB5AK5" });
    expect(petaSel("b1_biaya")).toMatchObject({ kolom: "B5BK6", aturan: "MB5BK6" });
    expect(petaSel("g_berharga_tambah")).toMatchObject({ kolom: "B5GR5K2", aturan: "B5GR5_1K2", kepastian: "dugaan" });
    expect(petaSel("g_mesin_kurang")).toMatchObject({ kolom: "B5GR13K3", kepastian: "pasti" });
    expect(petaSel("e_rtLain_uangB")?.aturan).toBeUndefined();
  });
  it("nama variabel komoditas: R{no}K{n}; kolom cetak (5)–(10) = K1–K6", () => {
    expect([5, 6, 7, 8, 9, 10].map(kolomCetakKeVariabelIv1)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(namaVariabelKomoditas(74, 6)).toBe("R74K6");
    expect(namaVariabelKomoditas(199, 7)).toBe("R199K7");
  });
});
