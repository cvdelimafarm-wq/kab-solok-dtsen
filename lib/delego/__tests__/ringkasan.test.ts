import { describe, expect, it } from "vitest";
import { awalBulan, geserBulan, kelompokBidang, namaBulan, periksaBulan, ringkasanKeCsv, tanganiRingkasan, teksNilai, type IsiRingkasan } from "../ringkasan";

type Jawab = { data: unknown; error: { message: string } | null };
function dbPalsu(peta: Record<string, Jawab>, catat: { fn: string; args: unknown }[] = []) {
  return {
    rpc: async (fn: string, args: unknown) => {
      catat.push({ fn, args });
      return peta[fn] ?? { data: null, error: { message: "tidak ada" } };
    },
  } as never;
}
const sesi = { akunId: 354, aktorId: null };
const R = [{ urut: 1, bidang: "Manajemen & strategi", kode: "M1", ukuran: "Delegasi", nilai: "12", satuan: "delegasi", keterangan: "" }];
const P = [{ akun_id: 5, nama: "Fuji, Zahara", delegasi: "3", selesai: 2, laporan: 10, terlambat: 1, poin: "42.5", kualitas: null, kepatuhan: "4.5" }];

describe("bulan", () => {
  it("periksaBulan menerima yyyy-mm dan yyyy-mm-dd, menolak selebihnya", () => {
    expect(periksaBulan("2026-10")).toBe("2026-10-01");
    expect(periksaBulan("2026-10-17")).toBe("2026-10-01");
    expect(periksaBulan(" 2026-02 ")).toBe("2026-02-01");
    for (const x of ["2026-13", "2026-00", "26-10", "2023-12", "2100-01", "", null, undefined, "2026/10", "2026-10-1"]) expect(periksaBulan(x as string)).toBeNull();
  });
  it("awalBulan, geserBulan lintas tahun, namaBulan", () => {
    expect(awalBulan("2026-10-29")).toBe("2026-10-01");
    expect(geserBulan("2026-10-01", 1)).toBe("2026-11-01");
    expect(geserBulan("2026-12-01", 1)).toBe("2027-01-01");
    expect(geserBulan("2026-01-01", -1)).toBe("2025-12-01");
    expect(geserBulan("2026-03-01", -15)).toBe("2024-12-01");
    expect(namaBulan("2026-10-01")).toBe("Oktober 2026");
  });
});

describe("tampilan", () => {
  it("teksNilai: kosong jadi tanda strip, persen diberi tanda, angka berlokal Indonesia", () => {
    expect(teksNilai(null, "%")).toBe("–");
    expect(teksNilai(93.4, "%")).toBe("93,4%");
    expect(teksNilai(1234.5, "poin")).toBe("1.234,5");
    expect(teksNilai(0, "kasus")).toBe("0");
  });
  it("kelompokBidang mengurut dan mengelompokkan", () => {
    const g = kelompokBidang([
      { urut: 3, bidang: "B", kode: "B1", ukuran: "", nilai: 1, satuan: "", keterangan: "" },
      { urut: 1, bidang: "A", kode: "A1", ukuran: "", nilai: 1, satuan: "", keterangan: "" },
      { urut: 2, bidang: "A", kode: "A2", ukuran: "", nilai: 1, satuan: "", keterangan: "" },
    ]);
    expect(g.map((x) => [x.bidang, x.baris.length])).toEqual([["A", 2], ["B", 1]]);
  });
  it("CSV: pegawai hanya bila diminta, koma dan tanda kutip diamankan", () => {
    const isi: IsiRingkasan = {
      bulan: "2026-10-01",
      ringkasan: [{ urut: 1, bidang: "M", kode: "M1", ukuran: 'Ukuran "x", y', nilai: 5, satuan: "orang", keterangan: "" }],
      pegawai: [{ akun_id: 1, nama: "Fuji; Z", delegasi: 1, selesai: 1, laporan: 2, terlambat: 0, poin: 3, kualitas: null, kepatuhan: 4 }],
    };
    const tanpa = ringkasanKeCsv(isi, false);
    expect(tanpa).not.toContain("Rincian per pegawai");
    expect(tanpa.startsWith("﻿")).toBe(true);
    expect(tanpa).toContain('"Ukuran ""x"", y"');
    const dengan = ringkasanKeCsv(isi, true);
    expect(dengan).toContain("Rincian per pegawai");
    expect(dengan).toContain('"Fuji; Z";1;1;2;0;3;;4');
  });
});

describe("tanganiRingkasan", () => {
  it("tanpa sesi 401, bulan salah 400", async () => {
    expect((await tanganiRingkasan(dbPalsu({}), null, "2026-10")).status).toBe(401);
    expect((await tanganiRingkasan(dbPalsu({}), sesi, "bukan")).status).toBe(400);
  });
  it("bukan pemberi semua RO: 403 dan fungsi ringkasan tidak dipanggil", async () => {
    const catat: { fn: string; args: unknown }[] = [];
    const r = await tanganiRingkasan(dbPalsu({ keu_boleh: { data: false, error: null } }, catat), sesi, "2026-10");
    expect(r.status).toBe(403);
    expect(catat.map((c) => c.fn)).toEqual(["keu_boleh"]);
    expect(catat[0].args).toEqual({ p_akun: 354, p_kew: "delegasi_beri", p_ro: null });
  });
  it("pemeriksaan hak gagal: 500", async () => {
    expect((await tanganiRingkasan(dbPalsu({ keu_boleh: { data: null, error: { message: "x" } } }), sesi, "2026-10")).status).toBe(500);
  });
  it("berhasil: bilangan dinormalkan dan bulan dikirim sebagai awal bulan", async () => {
    const catat: { fn: string; args: unknown }[] = [];
    const db = dbPalsu({ keu_boleh: { data: true, error: null }, keu_ringkasan_bulanan: { data: R, error: null }, keu_ringkasan_pegawai: { data: P, error: null } }, catat);
    const r = await tanganiRingkasan(db, sesi, "2026-10-17");
    expect(r.status).toBe(200);
    const isi = (r.json as { data: IsiRingkasan }).data;
    expect(isi.bulan).toBe("2026-10-01");
    expect(isi.ringkasan[0].nilai).toBe(12);
    expect(isi.pegawai[0]).toMatchObject({ delegasi: 3, poin: 42.5, kualitas: null, kepatuhan: 4.5 });
    expect(catat.filter((c) => c.fn === "keu_ringkasan_bulanan")[0].args).toEqual({ p_bulan: "2026-10-01" });
  });
  it("nilai kosong tetap null, bukan 0", async () => {
    const db = dbPalsu({ keu_boleh: { data: true, error: null }, keu_ringkasan_bulanan: { data: [{ ...R[0], nilai: null }], error: null }, keu_ringkasan_pegawai: { data: [], error: null } });
    const isi = ((await tanganiRingkasan(db, sesi, "2026-10")).json as { data: IsiRingkasan }).data;
    expect(isi.ringkasan[0].nilai).toBeNull();
    expect(isi.pegawai).toEqual([]);
  });
  it("fungsi belum dipasang: 503 dengan petunjuk", async () => {
    const db = dbPalsu({ keu_boleh: { data: true, error: null }, keu_ringkasan_bulanan: { data: null, error: { message: "Could not find the function public.keu_ringkasan_bulanan in the schema cache" } }, keu_ringkasan_pegawai: { data: null, error: { message: "Could not find the function" } } });
    const r = await tanganiRingkasan(db, sesi, "2026-10");
    expect(r.status).toBe(503);
    expect(String(r.json.error)).toContain("20261029b");
  });
  it("galat lain: 500 tanpa membocorkan pesan basis data", async () => {
    const db = dbPalsu({ keu_boleh: { data: true, error: null }, keu_ringkasan_bulanan: { data: null, error: { message: "rahasia internal" } }, keu_ringkasan_pegawai: { data: [], error: null } });
    const r = await tanganiRingkasan(db, sesi, "2026-10");
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.json)).not.toContain("rahasia");
  });
});
