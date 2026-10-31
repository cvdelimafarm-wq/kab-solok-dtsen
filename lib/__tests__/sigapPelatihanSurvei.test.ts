import { describe, expect, it } from "vitest";
import { KODE_SURVEI_LAIN, bacaParamKelola, bolehBuatPelatihan, cariSurvei, kodePelatihan, pilihPelatihanAwal, ringkasSurvei, susunSurvei, tesBawaan, urlKelola, validasiPelatihanBaru, type PelatihanSurvei } from "@/lib/sigapPelatihanSurvei";

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

describe("bolehBuatPelatihan", () => {
  it("admin lingkup semua dan PJ yang lingkupnya mencakup survei boleh", () => {
    expect(bolehBuatPelatihan([{ kode: "admin_aplikasi", kegiatan_id: null }], [2])).toBe(true);
    expect(bolehBuatPelatihan([{ kode: "pj_kegiatan", kegiatan_id: 2 }], ["2"])).toBe(true);
    expect(bolehBuatPelatihan([{ kode: "admin_anggaran", kegiatan_id: 2 }], [2])).toBe(true);
  });
  it("PJ di survei lain, peran non-pembuat, atau tanpa peran tidak boleh", () => {
    expect(bolehBuatPelatihan([{ kode: "pj_kegiatan", kegiatan_id: 2 }], [1, 3])).toBe(false);
    expect(bolehBuatPelatihan([{ kode: "panitia_pelatihan", kegiatan_id: null }], [3])).toBe(false);
    expect(bolehBuatPelatihan([{ kode: "pengelola_psp", kegiatan_id: 3 }], [1, 3])).toBe(false);
    expect(bolehBuatPelatihan([], [3])).toBe(false);
    expect(bolehBuatPelatihan([{ kode: "pj_kegiatan", kegiatan_id: 2 }], null)).toBe(false);
  });
});

describe("validasiPelatihanBaru", () => {
  it("menerima isian sah; selesai kosong = mulai; spasi dirapikan", () => {
    expect(validasiPelatihanBaru({ nama: "  Pelatihan   Petugas SPDT NTP ", tanggal_mulai: "2026-11-10", tanggal_selesai: "" })).toEqual({ ok: true, data: { nama: "Pelatihan Petugas SPDT NTP", tanggal_mulai: "2026-11-10", tanggal_selesai: "2026-11-10" } });
  });
  it("menolak nama pendek/panjang, tanggal salah, selesai sebelum mulai, rentang > 60 hari", () => {
    expect(validasiPelatihanBaru({ nama: "abc", tanggal_mulai: "2026-11-10" }).ok).toBe(false);
    expect(validasiPelatihanBaru({ nama: "x".repeat(121), tanggal_mulai: "2026-11-10" }).ok).toBe(false);
    expect(validasiPelatihanBaru({ nama: "Pelatihan Baru", tanggal_mulai: "10-11-2026" }).ok).toBe(false);
    expect(validasiPelatihanBaru({ nama: "Pelatihan Baru", tanggal_mulai: "2026-02-30" }).ok).toBe(false);
    expect(validasiPelatihanBaru({ nama: "Pelatihan Baru", tanggal_mulai: "2026-11-10", tanggal_selesai: "2026-11-09" }).ok).toBe(false);
    expect(validasiPelatihanBaru({ nama: "Pelatihan Baru", tanggal_mulai: "2026-11-10", tanggal_selesai: "2027-02-01" }).ok).toBe(false);
    expect(validasiPelatihanBaru(null).ok).toBe(false);
  });
});

describe("kodePelatihan", () => {
  it("huruf kecil, tanpa tanda baca, memuat kode survei dan tahun", () => {
    expect(kodePelatihan("spdt_ntp", "Pelatihan Petugas SPDT NTP 2026!", "2026-11-10")).toBe("pelatihan_spdt_ntp_pelatihan_petugas_spdt_ntp_2026_2026");
    expect(kodePelatihan("a", "Café Ünik", "2027-01-01")).toBe("pelatihan_a_cafe_unik_2027");
  });
  it("tidak melebihi 80 karakter dan tidak berakhir garis bawah", () => {
    const k = kodePelatihan("x".repeat(60), "y".repeat(100), "2026-01-01");
    expect(k.length).toBeLessThanOrEqual(80);
    expect(k.endsWith("_")).toBe(false);
  });
});

describe("tesBawaan", () => {
  it("dua tes tidak aktif, buka 07.00 WIB hari mulai, tutup 22.00 WIB hari selesai", () => {
    const t = tesBawaan("Pelatihan X", "2026-11-10", "2026-11-12");
    expect(t.map((x) => x.jenis)).toEqual(["pretest", "posttest"]);
    expect(t[0].buka_at).toBe("2026-11-10T00:00:00.000Z");
    expect(t[0].tutup_at).toBe("2026-11-12T15:00:00.000Z");
    expect(t.every((x) => x.aktif === false && x.wajib_lulus === false && x.durasi_menit === 15 && x.ulang_maks === 1)).toBe(true);
    expect(Date.parse(t[0].tutup_at)).toBeGreaterThan(Date.parse(t[0].buka_at));
  });
  it("sehari penuh tetap valid (tutup sesudah buka)", () => {
    const t = tesBawaan("Pelatihan X", "2026-11-10", "2026-11-10");
    expect(Date.parse(t[1].tutup_at)).toBeGreaterThan(Date.parse(t[1].buka_at));
  });
});
