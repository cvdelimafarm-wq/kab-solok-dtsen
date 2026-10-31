import { describe, expect, it } from "vitest";
import { KODE_SURVEI_LAIN, bacaParamKelola, cariSurvei, pilihPelatihanAwal, ringkasSurvei, susunSurvei, urlKelola, type PelatihanSurvei } from "@/lib/sigapPelatihanSurvei";

const p = (id: number, status: PelatihanSurvei["status"], mulai: string | null, peserta = 0): PelatihanSurvei => ({ id, kode: `k${id}`, nama: `Pelatihan ${id}`, tanggal_mulai: mulai, tanggal_selesai: mulai, status, peserta, boleh_kelola: true });

describe("pilihPelatihanAwal", () => {
  it("kosong -> null", () => expect(pilihPelatihanAwal([])).toBeNull());
  it("berlangsung diutamakan, lalu akan datang terdekat, lalu selesai terbaru", () => {
    expect(pilihPelatihanAwal([p(1, "selesai", "2026-01-01"), p(2, "berlangsung", "2026-10-01"), p(3, "akan_datang", "2026-12-01")])?.id).toBe(2);
    expect(pilihPelatihanAwal([p(1, "selesai", "2026-01-01"), p(3, "akan_datang", "2026-12-01"), p(4, "akan_datang", "2026-11-05")])?.id).toBe(4);
    expect(pilihPelatihanAwal([p(1, "selesai", "2026-01-01"), p(5, "selesai", "2026-09-01"), p(6, "nonaktif", "2026-10-10")])?.id).toBe(5);
  });
});

describe("ringkasSurvei", () => {
  it("tanpa pelatihan = kosong", () => expect(ringkasSurvei({ pelatihan: [] })).toEqual({ jumlah: 0, peserta: 0, status: "kosong", mulai: null, selesai: null }));
  it("menjumlah peserta dan mengambil status terbaik + rentang tanggal", () => {
    const r = ringkasSurvei({ pelatihan: [p(1, "selesai", "2026-09-01", 10), p(2, "berlangsung", "2026-10-08", 94)] });
    expect(r).toEqual({ jumlah: 2, peserta: 104, status: "berlangsung", mulai: "2026-09-01", selesai: "2026-10-08" });
  });
});

describe("susunSurvei", () => {
  const induk = [
    { kode: "pascabencana", nama: "Pendataan Pascabencana", kegiatan_ids: ["1", "3"] },
    { kode: "spdt_ntp", nama: "SPDT NTP 2026", kegiatan_ids: ["2"] },
  ];
  it("induk tanpa pelatihan tampil bila lingkup semua", () => {
    const s = susunSurvei(induk, [p(3, "berlangsung", "2026-10-08")], "semua");
    expect(s.map((x) => x.kode)).toEqual(["pascabencana", "spdt_ntp"]);
    expect(s[1].pelatihan).toEqual([]);
  });
  it("lingkup terbatas: induk kosong disembunyikan bila di luar lingkup, tampil bila kegiatannya di lingkup", () => {
    expect(susunSurvei(induk, [p(3, "berlangsung", "2026-10-08")], [3]).map((x) => x.kode)).toEqual(["pascabencana"]);
    expect(susunSurvei(induk, [p(3, "berlangsung", "2026-10-08")], [2, 3]).map((x) => x.kode)).toEqual(["pascabencana", "spdt_ntp"]);
  });
  it("pelatihan di luar induk masuk 'Pelatihan lainnya'", () => {
    const s = susunSurvei(induk, [p(3, "berlangsung", "2026-10-08"), p(9, "selesai", "2026-01-01")], [3, 9]);
    expect(s.at(-1)).toMatchObject({ kode: KODE_SURVEI_LAIN, nama: "Pelatihan lainnya" });
    expect(s.at(-1)?.pelatihan.map((x) => x.id)).toEqual([9]);
  });
  it("kegiatan_ids null aman", () => {
    expect(susunSurvei([{ kode: "x", nama: "X", kegiatan_ids: null }], [], "semua").map((x) => x.kode)).toEqual(["x"]);
  });
  it("satu pelatihan tidak muncul di dua induk", () => {
    const s = susunSurvei([{ kode: "a", nama: "A", kegiatan_ids: [3] }, { kode: "b", nama: "B", kegiatan_ids: [3] }], [p(3, "berlangsung", null)], "semua");
    expect(s.find((x) => x.kode === "a")?.pelatihan.length).toBe(1);
    expect(s.find((x) => x.kode === "b")?.pelatihan.length).toBe(0);
  });
  it("pelatihan diurutkan: berlangsung dulu, lalu terbaru", () => {
    const s = susunSurvei([{ kode: "a", nama: "A", kegiatan_ids: [1, 2, 3] }], [p(1, "selesai", "2026-01-01"), p(2, "berlangsung", "2026-10-01"), p(3, "selesai", "2026-06-01")], "semua");
    expect(s[0].pelatihan.map((x) => x.id)).toEqual([2, 3, 1]);
  });
});

describe("alamat", () => {
  it("bacaParamKelola menolak nilai tidak sah", () => {
    expect(bacaParamKelola("?kegiatan=3&survei=spdt_ntp&tab=monitoring")).toEqual({ kegiatan: 3, survei: "spdt_ntp", tab: "monitoring" });
    expect(bacaParamKelola("?kegiatan=abc&survei=a b&tab=<x>")).toEqual({ kegiatan: null, survei: null, tab: null });
    expect(bacaParamKelola("?kegiatan=0")).toEqual({ kegiatan: null, survei: null, tab: null });
    expect(bacaParamKelola("")).toEqual({ kegiatan: null, survei: null, tab: null });
  });
  it("urlKelola mengisi/menghapus parameter dan membiarkan ?tab", () => {
    expect(urlKelola("/sigap/kelola/pelatihan", "?tab=monitoring", { survei: "spdt_ntp", kegiatan: 5 })).toBe("/sigap/kelola/pelatihan?tab=monitoring&survei=spdt_ntp&kegiatan=5");
    expect(urlKelola("/x", "?survei=a&kegiatan=3&tab=kuis", { survei: "b", kegiatan: null })).toBe("/x?survei=b&tab=kuis");
    expect(urlKelola("/x", "?survei=a&kegiatan=3", { survei: null, kegiatan: null })).toBe("/x");
  });
  it("cariSurvei: dari kegiatan, lalu dari kode", () => {
    const d = susunSurvei([{ kode: "a", nama: "A", kegiatan_ids: [3] }, { kode: "b", nama: "B", kegiatan_ids: [2] }], [p(3, "berlangsung", null)], "semua");
    expect(cariSurvei(d, 3, null)?.kode).toBe("a");
    expect(cariSurvei(d, null, "b")?.kode).toBe("b");
    expect(cariSurvei(d, 99, "b")?.kode).toBe("b");
    expect(cariSurvei(d, null, null)).toBeNull();
  });
});
