import { describe, expect, it } from "vitest";
import { bacaKunciHari, bandingHariPenugasan, hariDibayarPerPeran } from "../rujukan";

describe("angka rujukan: hari dibayar", () => {
  it("kunci RAB dibaca menjadi peran dan periode", () => {
    expect(bacaKunciHari("524113|Translok PPL (kurang dari 8 jam)|Triwulan IV")).toEqual({ peran: "ppl", periode: "Triwulan IV", penginapan: false });
    expect(bacaKunciHari("524111|Penginapan PML|Triwulan IV")?.penginapan).toBe(true);
    expect(bacaKunciHari("524113|Translok Petugas entri (lebih dari 8 jam)|TW1")?.peran).toBe("entri");
    expect(bacaKunciHari("521211|Konsumsi|TW1")).toBeNull();
  });
  it("translok <8 dan >8 jam dijumlah, penginapan dan isian tidak sah dilewati", () => {
    const h = hariDibayarPerPeran({
      "524113|Translok PPL (kurang dari 8 jam)|TW4": "4",
      "524113|Translok PPL (lebih dari 8 jam)|TW4": 2,
      "524111|Penginapan PPL|TW4": "3",
      "524113|Translok PML (kurang dari 8 jam)|TW4": "x",
    });
    expect(h).toEqual([{ periode: "TW4", peran: "ppl", hari: 6, kunci: "hari:ppl:TW4" }]);
  });
  it("dibandingkan dengan penugasan pendataan (periode sama); pelatihan diabaikan", () => {
    const h = hariDibayarPerPeran({ "524113|Translok PPL (kurang dari 8 jam)|Triwulan IV": "4" });
    const p = [
      { ident_id: 7, kegiatan_id: 6, kegiatan_nama: "Seruti", fungsi: "pendataan", periode: "Triwulan IV", peran: "ppl", n: 15, maks_min: null, maks_max: null, n_kosong: 15 },
      { ident_id: 7, kegiatan_id: 7, kegiatan_nama: "Pelatihan", fungsi: "pelatihan", periode: "Triwulan IV", peran: "ppl", n: 15, maks_min: null, maks_max: null, n_kosong: 15 },
    ];
    const s = bandingHariPenugasan(h, p);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kegiatan_id: 6, hariRab: 4, penugasan: null, sama: false });
    expect(bandingHariPenugasan(h, [{ ...p[0], maks_min: 4, maks_max: 4, n_kosong: 0 }])[0].sama).toBe(true);
    expect(bandingHariPenugasan(h, [{ ...p[0], maks_min: 3, maks_max: 4, n_kosong: 0 }])[0].penugasan).toBe("campur");
    expect(bandingHariPenugasan(h, [{ ...p[0], dipilih: [10, 5, 4, 2] }])[0].lebih).toEqual({ orang: 2, maksDipilih: 10 });
  });
});
