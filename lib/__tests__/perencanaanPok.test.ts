// (11 Okt 2026) Uji baris POK, alokasi banyak kegiatan, dan rencana realisasi (uji coba perencanaan)
import { expect, test } from "vitest";
import {
  alokasiSisa,
  anggaranKegiatan,
  bacaTempelanPok,
  gabungMuatan,
  matriksRencana,
  nilaiAlokasi,
  parseAngka,
  periksaAlokasiDetail,
  ringkasDetail,
  ringkasRo,
  type Alokasi,
  type DetailPok,
} from "../perencanaanPok";

test("parseAngka gaya Indonesia & Excel", () => {
  expect(parseAngka("1.234.567")).toBe(1234567);
  expect(parseAngka("Rp 170.000")).toBe(170000);
  expect(parseAngka("1,234,567.00")).toBe(1234567);
  expect(parseAngka("1.234.567,50")).toBe(1234567.5);
  expect(parseAngka("12,5")).toBe(12.5);
  expect(parseAngka("12.5")).toBe(12.5);
  expect(parseAngka(" ")).toBeNull();
  expect(parseAngka("abc")).toBeNull();
  expect(parseAngka(42)).toBe(42);
});

test("tempelan Excel: judul dilewati, jumlah dihitung, baris salah dilaporkan", () => {
  const teks = [
    "Komponen\tSub Komponen\tAkun\tUraian\tVolume\tSatuan\tHarga satuan\tJumlah",
    "052\tA\t524113\tTransport lokal pencacah Susenas\t120\tO-K\t170.000\t",
    "052\tA\t521213\tHonor pencacah\t60\tDok\t\t9.000.000",
    "052\tA\t52411\tAkun salah\t1\tO-K\t1\t1",
    "052\tB\t524113\t\t1\tO-K\t1\t1",
    "",
  ].join("\n");
  const h = bacaTempelanPok(teks);
  expect(h.baris).toHaveLength(2);
  expect(h.baris[0]).toMatchObject({ komponen: "052", subKomponen: "A", akun: "524113", volume: 120, harga: 170000, jumlah: 20400000, satuan: "O-K" });
  expect(h.baris[1].jumlah).toBe(9000000);
  expect(h.galat.map((g) => g.baris)).toEqual([4, 5]);
});

test("tempelan dengan titik koma juga terbaca", () => {
  const h = bacaTempelanPok("051;A;521211;Konsumsi rapat;10;OK;50.000;500.000");
  expect(h.baris[0]).toMatchObject({ akun: "521211", jumlah: 500000 });
});

const d1: DetailPok = { id: "d1", roId: "r", komponen: "052", subKomponen: "A", akun: "524113", uraian: "Transport lokal", volume: 100, satuan: "O-K", harga: 170000, jumlah: 17000000 };
const d2: DetailPok = { id: "d2", roId: "r", komponen: "052", subKomponen: "B", akun: "521213", uraian: "Honor", volume: null, satuan: "", harga: null, jumlah: 9000000 };

test("muat ulang: kunci sama diperbarui (id tetap), baru ditambah, lama tidak dihapus", () => {
  let n = 0;
  const g = gabungMuatan(
    [d1, d2, { ...d1, id: "x", roId: "ro-lain" }],
    "r",
    [
      { komponen: "052", subKomponen: "A", akun: "524113", uraian: "transport  LOKAL", volume: 120, satuan: "O-K", harga: 170000, jumlah: 20400000 },
      { komponen: "051", subKomponen: "A", akun: "521211", uraian: "Konsumsi", volume: null, satuan: "", harga: null, jumlah: 500000 },
    ],
    () => `baru${++n}`
  );
  expect(g).toMatchObject({ ditambah: 1, diperbarui: 1, tidakAdaDiMuatan: 1 });
  expect(g.detail.find((d) => d.id === "d1")?.jumlah).toBe(20400000);
  expect(g.detail.map((d) => d.id).sort()).toEqual(["baru1", "d1", "d2", "x"]);
});

test("satu baris POK ke banyak kegiatan: status belum/sebagian/penuh/lebih", () => {
  expect(ringkasDetail(d1, []).status).toBe("belum");
  const a1: Alokasi = { id: "a1", detailId: "d1", kegiatanId: "k1", volume: 60, nilai: nilaiAlokasi(d1, 60, null), rencana: [] };
  expect(a1.nilai).toBe(10200000);
  expect(ringkasDetail(d1, [a1])).toMatchObject({ status: "sebagian", sisa: 6800000, jumlahKegiatan: 1 });
  const a2 = alokasiSisa(d1, [a1], "k2", "a2")!;
  expect(a2.nilai).toBe(6800000);
  expect(ringkasDetail(d1, [a1, a2])).toMatchObject({ status: "penuh", sisa: 0, jumlahKegiatan: 2 });
  expect(ringkasDetail(d1, [a1, { ...a2, nilai: 9000000 }]).status).toBe("lebih");
  expect(alokasiSisa(d1, [a1, a2], "k3", "a3")).toBeNull();
});

test("periksa alokasi: pagu, kegiatan ganda, rencana bayar", () => {
  const a = (x: Partial<Alokasi>): Alokasi => ({ id: "a", detailId: "d1", kegiatanId: "k1", volume: null, nilai: 1000000, rencana: [], ...x });
  expect(periksaAlokasiDetail(d1, [a({})], 2026)).toBeNull();
  expect(periksaAlokasiDetail(d1, [a({}), a({ id: "b" })], 2026)).toMatch(/Satu kegiatan/);
  expect(periksaAlokasiDetail(d1, [a({ nilai: 18000000 })], 2026)).toMatch(/melebihi pagu/);
  expect(periksaAlokasiDetail(d1, [a({ rencana: [{ bulan: "2026-03", nilai: 1500000 }] })], 2026)).toMatch(/Rencana bayar melebihi/);
  expect(periksaAlokasiDetail(d1, [a({ rencana: [{ bulan: "2025-12", nilai: 100 }] })], 2026)).toMatch(/tahun anggaran 2026/);
  expect(periksaAlokasiDetail(d1, [a({ kegiatanId: "" })], 2026)).toMatch(/Pilih kegiatan/);
});

test("RAB kegiatan diakumulasi dari beberapa baris; ringkasan RO; matriks rencana", () => {
  const al: Alokasi[] = [
    { id: "a1", detailId: "d1", kegiatanId: "k1", volume: 60, nilai: 10200000, rencana: [{ bulan: "2026-03", nilai: 6000000 }, { bulan: "2026-04", nilai: 4200000 }] },
    { id: "a2", detailId: "d1", kegiatanId: "k2", volume: 40, nilai: 6800000, rencana: [{ bulan: "2026-06", nilai: 6800000 }] },
    { id: "a3", detailId: "d2", kegiatanId: "k1", volume: null, nilai: 4000000, rencana: [] },
  ];
  const r1 = anggaranKegiatan("k1", [d1, d2], al);
  expect(r1).toMatchObject({ total: 14200000, terjadwal: 10200000 });
  expect(r1.baris).toHaveLength(2);
  expect(ringkasRo([d1, d2], al)).toMatchObject({ pagu: 26000000, teralokasi: 21000000, belumBaris: 0, sebagianBaris: 1, belumNilai: 5000000 });
  const m = matriksRencana([d1, d2], al, [{ id: "k1", nama: "Susenas Maret" }, { id: "k2", nama: "Seruti TW II" }, { id: "k3", nama: "Tanpa alokasi" }], 2026);
  expect(m.baris.map((b) => b.kunci)).toEqual(["k1", "k2", "__belum"]);
  expect(m.baris[0].perBulan[2]).toBe(6000000);
  expect(m.baris[0].belumDijadwalkan).toBe(4000000);
  expect(m.totalBulan[5]).toBe(6800000);
  expect(m.total).toBe(26000000);
});
