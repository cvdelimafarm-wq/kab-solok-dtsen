import { describe, expect, it } from "vitest";
import { bacaManifestDasar } from "@/lib/petaDasar";
import { kelompokPetaKegiatan, kunciPetaKegiatan, kunciPetaSaya, perintahPeta, rekapPeta, sidikAlokasi, statusPetaTim } from "@/lib/petaKegiatan";

// skrip laptop (.mjs): impor relatif biasa (URL berkas dengan spasi gagal dimuat vitest di Windows); tipe diabaikan karena .mjs tanpa deklarasi
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mjs = any;
// @ts-ignore -- modul .mjs tanpa deklarasi tipe
const muat = (_nama: string): Promise<Mjs> => import("../../scripts/peta/wilayah-kegiatan.mjs");

const kotak = (w: number, s: number, e: number, n: number) => [[[[w, s], [e, s], [e, n], [w, n], [w, s]]]]; // MultiPolygon satu cincin

const ALOKASI = [
  { idsubsls: "1303040001000100", ppl_akun_id: 11, pml_akun_id: 21, ppl_nama: "Ani", pml_nama: "Budi" },
  { idsubsls: "1303040001000200", ppl_akun_id: 12, pml_akun_id: 21, ppl_nama: "Cici", pml_nama: "Budi" },
  { idsubsls: "1303040001000300", ppl_akun_id: 13, pml_akun_id: 22, ppl_nama: "Dedi", pml_nama: "Eko" },
  { idsubsls: "1303040001000400", ppl_akun_id: null, pml_akun_id: null },
];

describe("kunci peta kegiatan", () => {
  it("rumus numerik dan batasnya", () => {
    expect(kunciPetaKegiatan(12, "ppl", 345)).toBe(100_000_000_000 + 12 * 10_000_000 + 1_000_000 + 345);
    expect(kunciPetaKegiatan(12, "pml", 345)).toBe(100_000_000_000 + 12 * 10_000_000 + 2_000_000 + 345);
    expect(kunciPetaKegiatan(12, "semua")).toBe(100_000_000_000 + 12 * 10_000_000 + 3_000_000);
    expect(kunciPetaKegiatan(12, "semua", 999)).toBe(kunciPetaKegiatan(12, "semua"));
    expect(kunciPetaKegiatan(0, "semua")).toBeNull();
    expect(kunciPetaKegiatan(10_000, "semua")).toBeNull();
    expect(kunciPetaKegiatan(1, "ppl", 0)).toBeNull();
    expect(kunciPetaKegiatan(1, "ppl", 1_000_000)).toBeNull();
    expect(kunciPetaKegiatan(1.5, "semua")).toBeNull();
  });

  it("tidak pernah bentrok dengan kunci lama dan lolos validator manifest", () => {
    const k = kunciPetaKegiatan(1, "ppl", 1)!;
    expect(k).toBeGreaterThan(9_300_000);
    const m = bacaManifestDasar({ versi: "x", tim: { [String(k)]: { berkas: `tim-${k}.pmtiles`, ukuran: 10, versi: "v", hash: "0123abcd", subsls: 3 } } });
    expect(m?.tim[String(k)]).toEqual({ berkas: `tim-${k}.pmtiles`, ukuran: 10, versi: "v", hash: "0123abcd", subsls: 3 });
  });

  it("kunci menurut peran pemakai", () => {
    expect(kunciPetaSaya(3, "ppl", 11)).toBe(kunciPetaKegiatan(3, "ppl", 11));
    expect(kunciPetaSaya(3, "pml", 21)).toBe(kunciPetaKegiatan(3, "pml", 21));
    expect(kunciPetaSaya(3, "korwil", null)).toBe(kunciPetaKegiatan(3, "semua"));
    expect(kunciPetaSaya(3, "supervisor", 5)).toBe(kunciPetaKegiatan(3, "semua"));
    expect(kunciPetaSaya(3, "ppl", null)).toBeNull();
    expect(kunciPetaSaya(3, null, 4)).toBeNull();
  });
});

describe("kelompok dan status", () => {
  it("semua, PML, PPL; PML memuat sub SLS semua PPL-nya; semua memuat juga yang tanpa petugas", () => {
    const k = kelompokPetaKegiatan(ALOKASI, 7);
    expect(k.map((x) => x.peran)).toEqual(["semua", "pml", "pml", "ppl", "ppl", "ppl"]);
    expect(k[0].subsls).toHaveLength(4);
    expect(k.find((x) => x.nama === "Budi")?.subsls).toEqual(["1303040001000100", "1303040001000200"]);
    expect(k.find((x) => x.nama === "Eko")?.subsls).toEqual(["1303040001000300"]);
    expect(k.find((x) => x.nama === "Ani")?.subsls).toEqual(["1303040001000100"]);
  });

  it("status: belum, ada, usang, lama; rekap", () => {
    const k = kelompokPetaKegiatan(ALOKASI, 7);
    const [semua, pml1, pml2, ppl1] = k;
    const m = bacaManifestDasar({
      versi: "v",
      tim: {
        [String(semua.kunci)]: { berkas: `tim-${semua.kunci}.pmtiles`, ukuran: 1000, versi: "a", hash: semua.hash },
        [String(pml1.kunci)]: { berkas: `tim-${pml1.kunci}.pmtiles`, ukuran: 500, versi: "a", hash: "00000000" },
        [String(pml2.kunci)]: { berkas: `tim-${pml2.kunci}.pmtiles`, ukuran: 200, versi: "a" },
      },
    });
    expect(statusPetaTim(m, semua).status).toBe("ada");
    expect(statusPetaTim(m, pml1)).toEqual({ status: "usang", ukuran: 500 });
    expect(statusPetaTim(m, pml2).status).toBe("lama");
    expect(statusPetaTim(m, ppl1)).toEqual({ status: "belum", ukuran: 0 });
    expect(statusPetaTim(null, semua).status).toBe("belum");
    expect(rekapPeta(m, k)).toEqual({ total: 6, ada: 1, usang: 1, belum: 3, lama: 1, byte: 1700 });
  });

  it("hash tidak bergantung urutan dan duplikat, tetapi berubah bila himpunan berubah", () => {
    expect(sidikAlokasi(["b", "a", "a"])).toBe(sidikAlokasi(["a", "b"]));
    expect(sidikAlokasi(["a", "b"])).not.toBe(sidikAlokasi(["a", "b", "c"]));
  });

  it("perintah laptop", () => {
    expect(perintahPeta(7)).toBe("node scripts/peta/potong-peta.mjs --kegiatan=7 --unggah");
    expect(perintahPeta(7, 100_071_000_011)).toBe("node scripts/peta/potong-peta.mjs --kegiatan=7 --tim=100071000011 --unggah");
  });
});

describe("silang TS dan skrip laptop", () => {
  it("kunci dan sidik sama persis", async () => {
    const mjs = await muat("wilayah-kegiatan.mjs");
    for (const [keg, peran, akun] of [[1, "ppl", 1], [7, "pml", 345], [9999, "ppl", 999_999], [12, "semua", 0], [0, "semua", 0], [3, "ppl", 0], [3, "bukan", 1]] as const) {
      expect(mjs.kunciPetaKegiatan(keg, peran, akun)).toBe(peran === "bukan" ? null : kunciPetaKegiatan(keg, peran as "ppl", akun));
    }
    for (const ids of [[], ["a"], ["b", "a", "b"], ALOKASI.map((a) => a.idsubsls)]) expect(mjs.sidikAlokasi(ids)).toBe(sidikAlokasi(ids));
  });

  it("kelompokkanKegiatan menghasilkan kunci dan hash yang sama dengan kelompokPetaKegiatan", async () => {
    const mjs = await muat("wilayah-kegiatan.mjs");
    const fitur = new Map<string, number[][][][]>(ALOKASI.map((a, i) => [a.idsubsls, kotak(100 + i * 0.05, -1, 100.03 + i * 0.05, -0.97)]));
    const hasil = mjs.kelompokkanKegiatan(7, ALOKASI, fitur);
    const ts = kelompokPetaKegiatan(ALOKASI, 7);
    expect(Object.keys(hasil).sort()).toEqual(ts.map((k) => String(k.kunci)).sort());
    for (const k of ts) {
      expect(hasil[String(k.kunci)].hash).toBe(k.hash);
      expect(hasil[String(k.kunci)].subsls).toBe(k.subsls.length);
    }
  });
});

describe("poligon ke sel", () => {
  it("persegi kecil di tengah sel: margin 500 m melebar ke sel tetangga yang dekat saja", async () => {
    const { selDariMultiPoligon, MARGIN_DERAJAT } = await muat("wilayah-kegiatan.mjs");
    // poligon 0,004 x 0,004 derajat di tengah sel (100.00..100.01, -1.00..-0.99) => hanya sel itu bila tanpa margin
    const g = kotak(100.003, -0.997, 100.007, -0.993);
    expect([...selDariMultiPoligon(g, 0)].sort()).toEqual(["10000,-100"]);
    const dgMargin = selDariMultiPoligon(g, MARGIN_DERAJAT);
    // margin 0,0045 dari tepi 100.003 menyentuh 99.9985 -> sel kiri; dari 100.007 menyentuh 100.0115 -> sel kanan; sama untuk lintang
    expect(dgMargin.has("10000,-100")).toBe(true);
    expect(dgMargin.has("9999,-100")).toBe(true);
    expect(dgMargin.has("10001,-100")).toBe(true);
    expect(dgMargin.has("10000,-101")).toBe(true);
    expect(dgMargin.has("10000,-99")).toBe(true);
    expect(dgMargin.size).toBe(9);
  });

  it("poligon besar: bagian dalam terisi penuh, tanpa sel jauh dari batas", async () => {
    const { selDariMultiPoligon } = await muat("wilayah-kegiatan.mjs");
    const s = selDariMultiPoligon(kotak(100.001, -0.999, 100.099, -0.901), 0); // 10 x 10 sel (tepi tidak tepat di garis sel)
    expect(s.size).toBe(100);
    expect(s.has("10005,-95")).toBe(true);
    expect(s.has("10010,-95")).toBe(false);
  });

  it("lubang tidak dikosongkan di tengah (cukup konservatif), tepi lubang tetap ditandai", async () => {
    const { selDariMultiPoligon } = await muat("wilayah-kegiatan.mjs");
    const luar = [[100.001, -0.999], [100.099, -0.999], [100.099, -0.901], [100.001, -0.901], [100.001, -0.999]];
    const lubang = [[100.041, -0.959], [100.059, -0.959], [100.059, -0.941], [100.041, -0.941], [100.041, -0.959]];
    const s = selDariMultiPoligon([[luar, lubang]], 0);
    expect(s.size).toBe(100); // sel di sekitar lubang dilewati batas lubang; luas lubang 2 x 2 sel, tepinya menyentuh sel di dalamnya
  });

  it("poligon miring tidak menutupi bounding box penuh", async () => {
    const { selDariMultiPoligon } = await muat("wilayah-kegiatan.mjs");
    // segitiga: separuh kotak 20 x 20 sel
    const segitiga = [[[[100.0, -1.0], [100.2, -1.0], [100.0, -0.8], [100.0, -1.0]]]];
    const s = selDariMultiPoligon(segitiga, 0);
    expect(s.size).toBeLessThan(300);
    expect(s.size).toBeGreaterThan(190);
    expect(s.has("10000,-100")).toBe(true);
    expect(s.has("10019,-81")).toBe(false);
  });

  it("kelompok tanpa batas dibuang; sub SLS tanpa poligon dilaporkan", async () => {
    const { kelompokkanKegiatan } = await muat("wilayah-kegiatan.mjs");
    const fitur = new Map([[ALOKASI[0].idsubsls, kotak(100.0, -1.0, 100.03, -0.97)]]);
    const h = kelompokkanKegiatan(7, ALOKASI, fitur);
    const semua = h[String(kunciPetaKegiatan(7, "semua"))];
    expect(semua.tanpaBatas).toHaveLength(3);
    expect(semua.subsls).toBe(4);
    expect(h[String(kunciPetaKegiatan(7, "ppl", 12))]).toBeUndefined(); // PPL 12 tak punya batas satu pun
    expect(h[String(kunciPetaKegiatan(7, "ppl", 11))].lari.length).toBeGreaterThan(0);
    expect(h[String(kunciPetaKegiatan(7, "pml", 21))].tanpaBatas).toEqual([ALOKASI[1].idsubsls]);
  });
});
