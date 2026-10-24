import { describe, expect, it } from "vitest";
import {
  arahSelisih, bandingRincian, bandingRo, hitungDampak, hitungRpd, labelVersi, pasanganVersi, polaPerKunci, sebarBulan, selisihTeks, totalVersi, urutVersi, versiTerbaru,
  type BarisKkVersi, type DetailVersi, type NodeVersi, type VersiPok,
} from "../versi";

const v = (id: number, nomor_revisi: number, status: string): VersiPok => ({ id, tahun: 2026, nomor_revisi, jenis: null, nomor_pok: null, tanggal_efektif: null, status, dibuat_at: null });
const n = (id: number, versi_id: number, induk: number | null, tingkat: string, kode: string, pagu: number | null, ro_kode: string | null = null, nama = kode): NodeVersi => ({ id, versi_id, induk_id: induk, tingkat, kode, nama, pagu, ro_kode });

const nodes: NodeVersi[] = [
  n(1, 2, null, "program", "GG", 1000), n(2, 2, 1, "ro", "007", 400, "2903.BMA.007", "RO tujuh [x]"), n(3, 2, 1, "ro", "008", 300, "2903.BMA.008"), n(4, 2, 1, "ro", "009", 300, "2903.BMA.009"),
  n(11, 3, null, "program", "GG", 990), n(12, 3, 11, "ro", "007", 400, "2903.BMA.007", "RO tujuh [x]"), n(13, 3, 11, "ro", "008", 290, "2903.BMA.008"), n(14, 3, 11, "ro", "010", 300, "2903.BMA.010"),
  n(5, 2, 2, "akun", "521211", null), n(15, 3, 12, "akun", "521211", null), n(16, 3, 13, "akun", "521811", null),
];
const det = (id: number, versi_id: number, akun_node_id: number, kunci_stabil: string, jumlah: number): DetailVersi => ({ id, versi_id, akun_node_id, kunci_stabil, uraian: kunci_stabil.split("/")[3] ?? "", jumlah });

describe("versi", () => {
  it("urut nomor revisi, label, terbaru", () => {
    const u = urutVersi([v(3, 2, "berlaku"), v(2, 1, "digantikan")]);
    expect(u.map((x) => x.id)).toEqual([2, 3]);
    expect(labelVersi(v(1, 0, "x"))).toBe("POK semula");
    expect(labelVersi(v(1, 2, "x"))).toBe("Revisi 2");
    expect(versiTerbaru(u)!.id).toBe(3);
    expect(versiTerbaru([v(2, 1, "digantikan"), v(3, 2, "digantikan")])!.id).toBe(3);
    expect(versiTerbaru([])).toBeNull();
  });
  it("pasangan: berurutan dan pertama ke terakhir", () => {
    expect(pasanganVersi([v(2, 1, "a"), v(3, 2, "b")]).map((p) => p.nama)).toEqual(["Revisi 1 ke 2"]);
    expect(pasanganVersi([v(1, 0, "a"), v(2, 1, "b"), v(3, 2, "c")]).map((p) => [p.a, p.b])).toEqual([[1, 2], [2, 3], [1, 3]]);
    expect(pasanganVersi([v(1, 0, "a")])).toEqual([]);
  });
  it("total versi dari simpul program, cadangan simpul RO", () => {
    expect(totalVersi(nodes, 2)).toBe(1000);
    expect(totalVersi(nodes, 3)).toBe(990);
    expect(totalVersi(nodes.filter((x) => x.tingkat !== "program"), 3)).toBe(990);
    expect(totalVersi(nodes, 99)).toBe(0);
  });
  it("selisih teks dan arah", () => {
    expect(selisihTeks(0)).toBe("0");
    expect(selisihTeks(2000)).toBe("+2.000");
    expect(selisihTeks(-2000)).toBe("-2.000");
    expect(arahSelisih(5)).toBe("naik"); expect(arahSelisih(-5)).toBe("turun"); expect(arahSelisih(0)).toBe("nol");
  });
  it("banding RO: hanya yang berbeda, RO hanya di satu versi, total dari semua RO", () => {
    const h = bandingRo(nodes, 2, 3);
    expect(h.nSemua).toBe(4);
    expect(h.nBeda).toBe(3);
    expect(h.a).toBe(1000); expect(h.b).toBe(990); expect(h.d).toBe(-10);
    expect(h.kelompok).toHaveLength(1);
    expect(h.kelompok[0].kro).toBe("2903.BMA");
    expect(h.kelompok[0].ro.map((r) => [r.ro, r.ada, r.d])).toEqual([["2903.BMA.008", "dua", -10], ["2903.BMA.009", "hanyaA", -300], ["2903.BMA.010", "hanyaB", 300]]);
    expect(bandingRo(nodes, 2, 3, true).kelompok[0].ro).toHaveLength(4);
    expect(bandingRo(nodes, 2, 3, true).kelompok[0].ro[0].nama).toBe("RO tujuh");
  });
  it("banding rincian: berubah, baru, hilang; RO dan akun dari simpul induk", () => {
    const d = [
      det(1, 2, 5, "2903.BMA.007/051/521211/rapat#1", 700), det(2, 3, 15, "2903.BMA.007/051/521211/rapat#1", 900),
      det(3, 2, 5, "2903.BMA.007/051/521211/lama#1", 100), det(4, 3, 16, "2903.BMA.008/051/521811/atk#1", 50),
      det(5, 2, 5, "2903.BMA.007/051/521211/sama#1", 20), det(6, 3, 15, "2903.BMA.007/051/521211/sama#1", 20),
    ];
    const b = bandingRincian(nodes, d, 2, 3);
    expect(b).toHaveLength(3);
    expect(b.find((x) => x.status === "berubah")).toMatchObject({ ro: "2903.BMA.007", akun: "521211", a: 700, b: 900, d: 200 });
    expect(b.find((x) => x.status === "hilang")).toMatchObject({ a: 100, b: 0, d: -100 });
    expect(b.find((x) => x.status === "baru")).toMatchObject({ ro: "2903.BMA.008", akun: "521811", a: 0, b: 50 });
  });
});

describe("RPD", () => {
  it("pola menjadi bobot berjumlah 1; abaikan bulan tak sah dan kunci tanpa nilai", () => {
    const p = polaPerKunci([
      { pok_kunci: "k1", bulan: 1, nilai: 100 }, { pok_kunci: "k1", bulan: 3, nilai: 300 }, { pok_kunci: "k1", bulan: 13, nilai: 999 }, { pok_kunci: null, bulan: 1, nilai: 5 },
      { pok_kunci: "k2", bulan: 2, nilai: 0 }, { pok_kunci: "k3", bulan: 5, nilai: -5 },
    ]);
    expect([...p.keys()]).toEqual(["k1"]);
    expect(p.get("k1")![0]).toBeCloseTo(0.25); expect(p.get("k1")![2]).toBeCloseTo(0.75);
  });
  it("sebar bulan: bulat dan berjumlah tepat", () => {
    const w = [1 / 3, 1 / 3, 1 / 3, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const s = sebarBulan(100, w);
    expect(s.reduce((x, y) => x + y, 0)).toBe(100);
    expect(s.slice(3).every((x) => x === 0)).toBe(true);
    expect(sebarBulan(0, w).every((x) => x === 0)).toBe(true);
  });
  const kk = (id: number, kunci: string | null, a: number, b: number, baru = false): BarisKkVersi => ({ id, jadwal_id: 7, ro_kode: "2903.BMA.008", detail_id: id, pok_kunci: kunci, akun_menjadi: "521211", uraian_menjadi: "u", jumlah_semula: a, jumlah_menjadi: b, selisih: b - a, baru });
  const pola = [{ pok_kunci: "k1", bulan: 7, nilai: 1 }, { pok_kunci: "k1", bulan: 8, nilai: 1 }];
  it("hitung RPD: baris berpola disebar, tanpa pola hanya yang berubah dihitung terpisah", () => {
    const h = hitungRpd([kk(1, "k1", 1000, 1200), kk(2, "k2", 500, 500), kk(3, "k3", 300, 100)], pola);
    expect(h.nBerpola).toBe(1); expect(h.nBerubah).toBe(2); expect(h.nBerubahTanpaPola).toBe(1);
    expect(h.bulan[6]).toMatchObject({ a: 500, b: 600, d: 100, geser: true });
    expect(h.bulan[7]).toMatchObject({ a: 500, b: 600, geser: true });
    expect(h.bulan[0].geser).toBe(false);
    expect(h.tanpaPola).toEqual({ n: 1, a: 300, b: 100, d: -200 });
    expect(h.total).toEqual({ a: 1300, b: 1300, d: 0 });
    expect(h.maks).toBe(600);
  });
  it("tanpa data: nol semua", () => {
    const h = hitungRpd([], []);
    expect(h.total).toEqual({ a: 0, b: 0, d: 0 }); expect(h.maks).toBe(1); expect(h.bulan).toHaveLength(12);
  });
});

describe("dampak", () => {
  const kk = (id: number, detail: number | null, a: number, b: number, baru = false): BarisKkVersi => ({ id, jadwal_id: 7, ro_kode: "2900.BMA.005", detail_id: detail, pok_kunci: "2900.BMA.005/051/521811/atk#1", akun_menjadi: "521811", uraian_menjadi: "atk", jumlah_semula: a, jumlah_menjadi: b, selisih: b - a, baru });
  it("hanya baris berubah; status aman, di bawah realisasi, belum ada realisasi; merah di atas", () => {
    const h = hitungDampak([kk(1, 10, 100, 50), kk(2, 11, 100, 300), kk(3, 12, 100, 90), kk(4, 13, 100, 100), kk(5, null, 0, 40, true)], [{ detail_id: 10, real_sd: 80 }, { detail_id: 11, real_sd: 100 }, { detail_id: 11, real_sd: 50 }]);
    expect(h.baris.map((x) => x.id)).toEqual([1, 2, 3, 5]);
    expect(h.baris[0]).toMatchObject({ id: 1, status: "bawah", realisasi: 80, ruang: -30 });
    expect(h.baris.find((x) => x.id === 2)).toMatchObject({ status: "aman", realisasi: 150, ruang: 150 });
    expect(h.baris.find((x) => x.id === 3)!.status).toBe("belum");
    expect(h.baris.find((x) => x.id === 5)!.status).toBe("belum");
    expect([h.nBawah, h.nAman, h.nBelum]).toEqual([1, 1, 2]);
    expect(h.baris[0].kode).toBe("051.521811");
  });
  it("kosong", () => {
    expect(hitungDampak([], [])).toEqual({ baris: [], nBawah: 0, nBelum: 0, nAman: 0 });
  });
});
