import { describe, expect, it } from "vitest";
import { bacaJumlah, butuhJumlah, hitungNeraca, isiSimpan, jumlahSah, kalimatRencana, niatUntuk, normalisasiNiat, susunRencana, tampilJumlah } from "../niat";
import { hitungItem } from "../pokTata";
import type { ItemAnggaran } from "../ro";

const item = (id: number, pok: number, realisasi: number, rab: number | null): ItemAnggaran => ({
  detail_id: id, kunci: `K${id}`, komponen: "051", akun: "521213", nomor_item: null, uraian: `butir ${id}`, volume: 1, satuan: "OK", pok, realisasi, rab,
  statusRab: rab === null ? null : "rinci", selesai: false,
});
const sel = (id: number, pok: number, realisasi: number, rab: number | null) => hitungItem(item(id, pok, realisasi, rab));

// 1: lebih 2.000.000 ; 2: kurang 4.000.000 ; 3: cukup ; 4: belum dikaji ; 5: kurang 900.000 ; 6: lebih 500.000
const DAFTAR = [
  sel(1, 10_000_000, 2_000_000, 6_000_000), sel(2, 8_000_000, 1_000_000, 11_000_000), sel(3, 5_000_000, 0, 5_000_000),
  sel(4, 3_000_000, 500_000, null), sel(5, 2_000_000, 0, 2_900_000), sel(6, 4_000_000, 1_000_000, 2_500_000),
];

describe("normalisasiNiat", () => {
  it("menerima baris sah dan membuang yang tidak sah", () => {
    const m = normalisasiNiat([
      { pok_kunci: "K1", niat: "lepas", jumlah: "1500000.00", catatan: "donor" },
      { pok_kunci: "K2", niat: "tunda", jumlah: null },
      { pok_kunci: "", niat: "lepas", jumlah: 1 }, { pok_kunci: "K3", niat: "ngawur", jumlah: 1 }, null, "x", { pok_kunci: "K4", niat: "tambal", jumlah: -5 },
    ]);
    expect([...m.keys()]).toEqual(["K1", "K2", "K4"]);
    expect(m.get("K1")).toMatchObject({ niat: "lepas", jumlah: 1_500_000, catatan: "donor" });
    expect(m.get("K2")).toMatchObject({ niat: "tunda", jumlah: null, catatan: null });
    expect(m.get("K4")?.jumlah).toBeNull();
    expect(normalisasiNiat("bukan larik").size).toBe(0);
  });
});

describe("jumlahSah", () => {
  it("niat tanpa jumlah selalu 0", () => {
    expect(jumlahSah("biarkan", 500, 1000)).toEqual({ jumlah: 0, disesuaikan: false });
    expect(jumlahSah("tunda", null, 1000)).toEqual({ jumlah: 0, disesuaikan: false });
  });
  it("kosong = seluruh besar; lebih dari besar dipotong; negatif jadi 0; dibulatkan", () => {
    expect(jumlahSah("lepas", null, 1000)).toEqual({ jumlah: 1000, disesuaikan: false });
    expect(jumlahSah("tambal", 2500, 1000)).toEqual({ jumlah: 1000, disesuaikan: true });
    expect(jumlahSah("tambal", -3, 1000)).toEqual({ jumlah: 0, disesuaikan: false });
    expect(jumlahSah("lepas", 400.6, 1000)).toEqual({ jumlah: 401, disesuaikan: false });
    expect(jumlahSah("lepas", Number.NaN, 1000)).toEqual({ jumlah: 1000, disesuaikan: false });
  });
});

describe("susunRencana", () => {
  it("hanya butir Lebih dan Kurang; kurang dahulu, lalu menurut besar", () => {
    const r = susunRencana(DAFTAR, new Map());
    expect(r.map((x) => [x.detail_id, x.golongan, x.besar])).toEqual([[2, "kurang", 4_000_000], [5, "kurang", 900_000], [1, "lebih", 2_000_000], [6, "lebih", 500_000]]);
  });
  it("tanpa pilihan: niat bawaan (biarkan, tunda) dan ditandai bawaan", () => {
    const r = susunRencana(DAFTAR, new Map());
    expect(r.every((x) => x.bawaan && x.jumlah === 0 && (x.niat === "biarkan" || x.niat === "tunda"))).toBe(true);
  });
  it("pilihan tersimpan dipakai; jumlah kosong = seluruh besar", () => {
    const t = normalisasiNiat([{ pok_kunci: "K1", niat: "lepas", jumlah: null }, { pok_kunci: "K2", niat: "tambal", jumlah: 3_000_000 }, { pok_kunci: "K5", niat: "tambahan", jumlah: 900_000 }]);
    const r = new Map(susunRencana(DAFTAR, t).map((x) => [x.detail_id, x]));
    expect(r.get(1)).toMatchObject({ niat: "lepas", jumlah: 2_000_000, bawaan: false });
    expect(r.get(2)).toMatchObject({ niat: "tambal", jumlah: 3_000_000, bawaan: false });
    expect(r.get(5)).toMatchObject({ niat: "tambahan", jumlah: 900_000 });
  });
  it("niat tersimpan yang tidak cocok golongan sekarang diabaikan", () => {
    const t = normalisasiNiat([{ pok_kunci: "K1", niat: "tambal", jumlah: 100 }, { pok_kunci: "K2", niat: "lepas", jumlah: 100 }]);
    const r = new Map(susunRencana(DAFTAR, t).map((x) => [x.detail_id, x]));
    expect(r.get(1)).toMatchObject({ niat: "biarkan", bawaan: true });
    expect(r.get(2)).toMatchObject({ niat: "tunda", bawaan: true });
  });
  it("jumlah tersimpan melebihi besar sekarang dipotong dan ditandai disesuaikan", () => {
    const t = normalisasiNiat([{ pok_kunci: "K1", niat: "lepas", jumlah: 9_000_000 }]);
    expect(susunRencana(DAFTAR, t).find((x) => x.detail_id === 1)).toMatchObject({ jumlah: 2_000_000, disesuaikan: true });
  });
  it("pilihan sah per golongan", () => {
    expect(niatUntuk("lebih")).toEqual(["biarkan", "lepas"]);
    expect(niatUntuk("kurang")).toEqual(["tunda", "tambal", "tambahan"]);
  });
});

describe("hitungNeraca", () => {
  const t = normalisasiNiat([
    { pok_kunci: "K1", niat: "lepas", jumlah: 2_000_000 }, { pok_kunci: "K6", niat: "lepas", jumlah: 500_000 },
    { pok_kunci: "K2", niat: "tambal", jumlah: 2_500_000 }, { pok_kunci: "K5", niat: "tunda", jumlah: null },
  ]);
  const r = susunRencana(DAFTAR, t);
  it("seimbang: pagu RO tetap", () => {
    const n = hitungNeraca(r, 0);
    expect(n).toMatchObject({ lepas: 2_500_000, tambal: 2_500_000, tambahan: 0, baru: 0, tunda: 900_000, kebutuhanSumber: 2_500_000, perubahanPagu: 0, status: "tetap" });
    expect(kalimatRencana(n)).toContain("pagu RO tetap");
  });
  it("item baru menambah kebutuhan sumber: pagu RO perlu naik", () => {
    const n = hitungNeraca(r, 9_745_000);
    expect(n).toMatchObject({ baru: 9_745_000, kebutuhanSumber: 12_245_000, perubahanPagu: 9_745_000, status: "naik" });
    expect(kalimatRencana(n)).toMatch(/Pagu RO perlu naik Rp 9\.745\.000/);
    expect(kalimatRencana(n)).toContain("termasuk item baru Rp 9.745.000");
  });
  it("minta tambahan pagu dihitung sebagai kebutuhan dari luar RO", () => {
    const n = hitungNeraca(susunRencana(DAFTAR, normalisasiNiat([{ pok_kunci: "K2", niat: "tambahan", jumlah: 4_000_000 }])), 0);
    expect(n).toMatchObject({ tambahan: 4_000_000, lepas: 0, perubahanPagu: 4_000_000, status: "naik" });
  });
  it("dana dilepas melebihi yang dipakai: pagu RO turun", () => {
    const n = hitungNeraca(susunRencana(DAFTAR, normalisasiNiat([{ pok_kunci: "K1", niat: "lepas", jumlah: 2_000_000 }])), 0);
    expect(n).toMatchObject({ lepas: 2_000_000, kebutuhanSumber: 0, perubahanPagu: -2_000_000, status: "turun" });
    expect(kalimatRencana(n)).toContain("pagu RO turun");
  });
  it("tanpa rencana apa pun", () => {
    const n = hitungNeraca(susunRencana(DAFTAR, new Map()), 0);
    expect(n).toMatchObject({ lepas: 0, kebutuhanSumber: 0, status: "tetap", tunda: 4_900_000 });
    expect(kalimatRencana(n)).toContain("ditunda");
    expect(kalimatRencana(hitungNeraca([], 0))).toBe("Belum ada rencana pelepasan atau penambalan.");
  });
});

describe("isiSimpan", () => {
  it("niat berjumlah membawa jumlah bulat; tunda dan biarkan tanpa jumlah", () => {
    expect(isiSimpan("2906.BMA.006", "K1", "lepas", 1500.4, null)).toEqual({ ro_kode: "2906.BMA.006", pok_kunci: "K1", niat: "lepas", jumlah: 1500, catatan: null });
    expect(isiSimpan("R", "K2", "tunda", 999, "  nanti ")).toEqual({ ro_kode: "R", pok_kunci: "K2", niat: "tunda", jumlah: null, catatan: "nanti" });
    expect(isiSimpan("R", "K3", "biarkan", null, "   ").catatan).toBeNull();
    expect((isiSimpan("R", "K4", "tambal", null, "x".repeat(900)).catatan as string).length).toBe(500);
  });
});

describe("isian jumlah", () => {
  it("tampilJumlah memberi titik ribuan; kosong untuk 0 atau tidak sah", () => {
    expect(tampilJumlah(2_500_000)).toBe("2.500.000"); expect(tampilJumlah(0)).toBe(""); expect(tampilJumlah(Number.NaN)).toBe("");
  });
  it("bacaJumlah mengabaikan selain angka", () => {
    expect(bacaJumlah("2.500.000")).toBe(2_500_000); expect(bacaJumlah("Rp 1.200")).toBe(1200); expect(bacaJumlah("")).toBeNull(); expect(bacaJumlah("abc")).toBeNull();
    expect(bacaJumlah("9".repeat(30))).toBeNull();
  });
  it("butuhJumlah", () => {
    expect(["biarkan", "lepas", "tunda", "tambal", "tambahan"].map((n) => butuhJumlah(n as never))).toEqual([false, true, false, true, true]);
  });
});
