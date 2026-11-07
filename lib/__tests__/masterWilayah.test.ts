import { describe, expect, it } from "vitest";
import { bacaBarisMaster, daftarKecamatan, peringatanMaster, rekapMaster, saringBaris, SARING_AWAL, statusKk, type BarisMaster } from "../masterWilayah";

const b = (o: Partial<BarisMaster> = {}): BarisMaster => ({
  idsubsls: "1303110005000101", kd_kec: "1303110", kecamatan: "KUBUNG", nagari: "GANTUANG CIRI", sls: "JORONG BARINGIN", sub_sls: "01", aktif: true,
  jumlah_kk: 50, kk_terbaru: "2026-11-01T00:00:00Z", gambar_peta: 1, jumlah_survei: 0, daftar_survei: [], batas: true, ...o,
});
const SEKARANG = "2026-11-07T10:00:00Z";

describe("statusKk", () => {
  it("belum / baru / ada", () => {
    expect(statusKk(b({ jumlah_kk: 0, kk_terbaru: null }), SEKARANG)).toBe("belum");
    expect(statusKk(b({ kk_terbaru: "2026-11-01T00:00:00Z" }), SEKARANG)).toBe("baru");
    expect(statusKk(b({ kk_terbaru: "2026-08-01T00:00:00Z" }), SEKARANG)).toBe("ada");
    expect(statusKk(b({ kk_terbaru: null }), SEKARANG)).toBe("ada");
  });
});

describe("saringBaris", () => {
  const semua = [
    b(),
    b({ idsubsls: "1303110005000102", sub_sls: "02", jumlah_kk: 0, gambar_peta: 0, jumlah_survei: 2, batas: false }),
    b({ idsubsls: "1303120001000101", kd_kec: "1303120", kecamatan: "X KOTO", nagari: "PASILIHAN", jumlah_survei: 1 }),
  ];
  it("tanpa saringan: semua", () => expect(saringBaris(semua, SARING_AWAL)).toHaveLength(3));
  it("kecamatan", () => expect(saringBaris(semua, { ...SARING_AWAL, kecamatan: "1303120" })).toHaveLength(1));
  it("cari nama (abaikan huruf besar) dan potongan kode", () => {
    expect(saringBaris(semua, { ...SARING_AWAL, cari: "pasilihan" })).toHaveLength(1);
    expect(saringBaris(semua, { ...SARING_AWAL, cari: "13031100050001" })).toHaveLength(2);
    expect(saringBaris(semua, { ...SARING_AWAL, cari: "02" })).toHaveLength(1);
  });
  it("kunci saring digabung dengan DAN", () => {
    expect(saringBaris(semua, { ...SARING_AWAL, kunci: ["tanpa_kk"] })).toHaveLength(1);
    expect(saringBaris(semua, { ...SARING_AWAL, kunci: ["multi_survei"] })).toHaveLength(1);
    expect(saringBaris(semua, { ...SARING_AWAL, kunci: ["ada_survei"] })).toHaveLength(2);
    expect(saringBaris(semua, { ...SARING_AWAL, kunci: ["tanpa_kk", "tanpa_gambar", "tanpa_batas"] })).toHaveLength(1);
    expect(saringBaris(semua, { ...SARING_AWAL, kunci: ["tanpa_survei"] })).toHaveLength(1);
  });
  it("tanpa_batas hanya menandai batas = false (null = tidak diketahui)", () => {
    expect(saringBaris([b({ batas: null })], { ...SARING_AWAL, kunci: ["tanpa_batas"] })).toHaveLength(0);
  });
});

describe("rekapMaster", () => {
  it("menghitung status", () => {
    const r = rekapMaster([b(), b({ jumlah_kk: 0, gambar_peta: 0, batas: false, jumlah_survei: 2 })]);
    expect(r).toMatchObject({ sub_sls: 2, dengan_kk: 1, tanpa_kk: 1, total_kk: 50, dengan_gambar: 1, dengan_batas: 1, dipakai_survei: 1, multi_survei: 1 });
  });
  it("batas tidak diketahui -> null", () => {
    expect(rekapMaster([b({ batas: null })]).dengan_batas).toBeNull();
  });
  it("kosong aman", () => {
    expect(rekapMaster([])).toMatchObject({ sub_sls: 0, total_kk: 0, dengan_batas: null });
  });
});

describe("daftarKecamatan", () => {
  it("unik, urut nama, jumlah sub SLS", () => {
    const k = daftarKecamatan([b(), b({ idsubsls: "1303110005000102" }), b({ kd_kec: "1303040", kecamatan: "ALAHAN PANJANG" })]);
    expect(k.map((x) => [x.nama, x.sub_sls])).toEqual([["ALAHAN PANJANG", 1], ["KUBUNG", 2]]);
  });
});

describe("bacaBarisMaster", () => {
  const mentah = { idsubsls: "1303110005000102", kd_kec: "1303110", kecamatan: "KUBUNG", nagari: "G", sls: "S", sub_sls: "02", aktif: true, jumlah_kk: "3", kk_terbaru: null, gambar_peta: 1, jumlah_survei: 1, daftar_survei: [{ kegiatan_id: 6, kegiatan: "Seruti", nks: "0001A", target: 10, ppl: "Ani", pml: null }] };
  it("angka teks dan jsonb dibaca; batas dari himpunan", () => {
    const r = bacaBarisMaster(mentah, new Set(["1303110005000102"]));
    expect(r).toMatchObject({ jumlah_kk: 3, batas: true, jumlah_survei: 1 });
    expect(r?.daftar_survei[0]).toMatchObject({ kegiatan_id: 6, nks: "0001A", ppl: "Ani", pml: null });
    expect(bacaBarisMaster(mentah, new Set())?.batas).toBe(false);
    expect(bacaBarisMaster(mentah, null)?.batas).toBeNull();
  });
  it("jsonb sebagai teks dan elemen rusak", () => {
    const r = bacaBarisMaster({ ...mentah, daftar_survei: JSON.stringify([{ kegiatan_id: 7, kegiatan: "X" }, { kegiatan_id: "bukan" }, 5]) }, null);
    expect(r?.daftar_survei).toHaveLength(1);
    expect(r?.daftar_survei[0].target).toBeNull();
  });
  it("kode tak sah ditolak", () => {
    expect(bacaBarisMaster({ ...mentah, idsubsls: "123" }, null)).toBeNull();
    expect(bacaBarisMaster(null, null)).toBeNull();
  });
});

describe("peringatanMaster", () => {
  it("memuat tanpa KK, tanpa batas, dan berkas batas tak terbaca", () => {
    const r = rekapMaster([b({ jumlah_kk: 0, batas: false }), b()]);
    const p = peringatanMaster(r, { versi: "v", dibuat: null, dibaca: true, kecamatan: 14, poligon: 1 });
    expect(p).toHaveLength(2);
    expect(peringatanMaster(rekapMaster([b({ batas: null })]), { versi: null, dibuat: null, dibaca: false, kecamatan: 0, poligon: 0 }).join(" ")).toContain("tidak terbaca");
  });
});
