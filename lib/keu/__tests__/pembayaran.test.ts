import { describe, expect, it } from "vitest";
import {
  akhirMinggu, antreanJatuhTempo, hitungPengaruh, isiCatat, periksaIsian, periksaTautan, ringkasBayar, selisihHariTgl, sisaBaris, usulTercermin,
  type BarisBayar, type BarisRabLepas, type IsianCatat, type JadwalRabLepas,
} from "../pembayaran";

const baris = (id: number, kunci: string | null, jumlah: number, item = id * 10): BarisRabLepas => ({ baris_id: id, item_id: item, pok_kunci: kunci, jumlah, ket: `baris ${id}` });
const bayar = (o: Partial<BarisBayar> & { id: number; rab_baris_id: number | null; pok_kunci: string }): BarisBayar => ({
  rab_id: 1, rab_item_id: 10, jenis: "bayar", tanggal: "2026-11-10", jumlah: 0, menutup: true, status: "dicatat", dibatalkan_at: null, ...o,
});

describe("hitungPengaruh", () => {
  const B = [baris(1, "K1", 1000), baris(2, "K1", 500), baris(3, "K2", 800), baris(4, null, 999)];
  it("pembayaran menutup: seluruh baris keluar dari RAB sisa, jumlah dicatat ikut dihitung", () => {
    const p = hitungPengaruh(B, [bayar({ id: 1, rab_baris_id: 1, pok_kunci: "K1", jumlah: 900 })]);
    expect(p.get("K1")).toEqual({ tutup: 1000, dicatat: 900 });
  });
  it("pembayaran sebagian tanpa menutup: hanya yang dibayar keluar; tidak melebihi jumlah baris", () => {
    expect(hitungPengaruh(B, [bayar({ id: 1, rab_baris_id: 3, pok_kunci: "K2", jumlah: 300, menutup: false })]).get("K2")).toEqual({ tutup: 300, dicatat: 300 });
    expect(hitungPengaruh(B, [bayar({ id: 1, rab_baris_id: 3, pok_kunci: "K2", jumlah: 5000, menutup: false })]).get("K2")).toEqual({ tutup: 800, dicatat: 5000 });
  });
  it("cicilan berurutan dijumlahkan", () => {
    const p = hitungPengaruh(B, [bayar({ id: 1, rab_baris_id: 3, pok_kunci: "K2", jumlah: 300, menutup: false }), bayar({ id: 2, rab_baris_id: 3, pok_kunci: "K2", jumlah: 200, menutup: false })]);
    expect(p.get("K2")).toEqual({ tutup: 500, dicatat: 500 });
  });
  it("status tercermin tidak masuk jumlah dicatat tetapi tetap menutup baris", () => {
    expect(hitungPengaruh(B, [bayar({ id: 1, rab_baris_id: 3, pok_kunci: "K2", jumlah: 800, status: "tercermin" })]).get("K2")).toEqual({ tutup: 800, dicatat: 0 });
  });
  it("jenis batal menutup baris tanpa jumlah dicatat", () => {
    expect(hitungPengaruh(B, [bayar({ id: 1, rab_baris_id: 2, pok_kunci: "K1", jenis: "batal", jumlah: 0 })]).get("K1")).toEqual({ tutup: 500, dicatat: 0 });
  });
  it("catatan dibatalkan diabaikan seluruhnya", () => {
    const p = hitungPengaruh(B, [bayar({ id: 1, rab_baris_id: 1, pok_kunci: "K1", jumlah: 900, dibatalkan_at: "2026-11-11T00:00:00Z" })]);
    expect(p.size).toBe(0);
  });
  it("baris yang sudah tidak ada pada RAB: jumlah dibayar mengurangi RAB butir tanpa menutup baris lain", () => {
    const p = hitungPengaruh(B, [bayar({ id: 1, rab_baris_id: 999, pok_kunci: "K2", jumlah: 250 }), bayar({ id: 2, rab_baris_id: null, pok_kunci: "K2", jumlah: 50, menutup: false })]);
    expect(p.get("K2")).toEqual({ tutup: 300, dicatat: 300 });
  });
  it("pembayaran pada baris tanpa pok_kunci diperlakukan seperti pembayaran tanpa baris", () => {
    expect(hitungPengaruh(B, [bayar({ id: 1, rab_baris_id: 4, pok_kunci: "K9", jumlah: 100 })]).get("K9")).toEqual({ tutup: 100, dicatat: 100 });
  });
  it("dua baris satu butir dijumlahkan", () => {
    const p = hitungPengaruh(B, [bayar({ id: 1, rab_baris_id: 1, pok_kunci: "K1", jumlah: 1000 }), bayar({ id: 2, rab_baris_id: 2, pok_kunci: "K1", jumlah: 500 })]);
    expect(p.get("K1")).toEqual({ tutup: 1500, dicatat: 1500 });
  });
});

describe("sisaBaris", () => {
  it("tanpa catatan = jumlah baris", () => expect(sisaBaris(1000, [])).toBe(1000));
  it("tertutup = 0", () => expect(sisaBaris(1000, [{ jenis: "bayar", jumlah: 100, menutup: true }])).toBe(0));
  it("sebagian = jumlah dikurangi dibayar, tidak negatif", () => {
    expect(sisaBaris(1000, [{ jenis: "bayar", jumlah: 400, menutup: false }])).toBe(600);
    expect(sisaBaris(1000, [{ jenis: "bayar", jumlah: 1400, menutup: false }])).toBe(0);
  });
  it("catatan dibatalkan tidak dihitung", () => {
    expect(sisaBaris(1000, [{ jenis: "bayar", jumlah: 1000, menutup: true, dibatalkan_at: "x" }])).toBe(1000);
  });
});

describe("akhirMinggu dan selisih hari", () => {
  it("minggu 1-3 berakhir tanggal 7, 14, 21", () => {
    expect(akhirMinggu(2026, 11, 1)).toBe("2026-11-07");
    expect(akhirMinggu(2026, 11, 2)).toBe("2026-11-14");
    expect(akhirMinggu(2026, 11, 3)).toBe("2026-11-21");
  });
  it("minggu 4 berakhir di akhir bulan (termasuk Februari)", () => {
    expect(akhirMinggu(2026, 11, 4)).toBe("2026-11-30");
    expect(akhirMinggu(2026, 2, 4)).toBe("2026-02-28");
    expect(akhirMinggu(2028, 2, 4)).toBe("2028-02-29");
    expect(akhirMinggu(2026, 12, 4)).toBe("2026-12-31");
  });
  it("selisih hari", () => {
    expect(selisihHariTgl("2026-11-21", "2026-11-25")).toBe(4);
    expect(selisihHariTgl("2026-12-31", "2027-01-02")).toBe(2);
    expect(selisihHariTgl("x", "2026-11-25")).toBe(0);
  });
});

describe("antreanJatuhTempo", () => {
  const B = [baris(1, "K1", 1000, 10), baris(2, "K2", 600, 20), baris(3, "K3", 400, 30), baris(4, null, 700, 40), baris(5, "K5", 300, 50)];
  const J: JadwalRabLepas[] = [
    { baris_id: 1, bulan: 11, minggu: 3, nilai: 1000 }, { baris_id: 2, bulan: 11, minggu: 1, nilai: 300 }, { baris_id: 2, bulan: 12, minggu: 1, nilai: 300 },
    { baris_id: 3, bulan: 11, minggu: 3, nilai: 400 }, { baris_id: 4, bulan: 11, minggu: 1, nilai: 700 }, { baris_id: 5, bulan: 11, minggu: 2, nilai: 300 },
  ];
  it("hanya yang minggunya sudah lewat; item baru dan item selesai dilewati", () => {
    const a = antreanJatuhTempo(B, J, [], "2026-11-25", 2026, new Set([30]));
    expect(a.map((x) => x.baris_id)).toEqual([2, 5, 1]);
    expect(a.find((x) => x.baris_id === 2)?.tunggak).toBe(300); // Desember belum jatuh tempo
    expect(a.find((x) => x.baris_id === 1)?.hari).toBe(4);
    expect(a.find((x) => x.baris_id === 2)?.hari).toBe(18);
  });
  it("batas: tanggal sama dengan akhir minggu belum jatuh tempo", () => {
    expect(antreanJatuhTempo(B, J, [], "2026-11-21", 2026).map((x) => x.baris_id).sort()).toEqual([2, 5]);
  });
  it("baris tertutup keluar dari antrean; pembayaran sebagian mengurangi tunggakan", () => {
    const tutup = bayar({ id: 1, rab_baris_id: 1, pok_kunci: "K1", jumlah: 900 });
    const cicil = bayar({ id: 2, rab_baris_id: 2, pok_kunci: "K2", jumlah: 100, menutup: false });
    const a = antreanJatuhTempo(B, J, [tutup, cicil], "2026-11-25", 2026);
    expect(a.find((x) => x.baris_id === 1)).toBeUndefined();
    expect(a.find((x) => x.baris_id === 2)?.tunggak).toBe(200);
  });
  it("pembayaran yang menutup jadwal lewat membuat baris tidak lagi menunggak; yang dibatalkan kembali menunggak", () => {
    const cicil = bayar({ id: 2, rab_baris_id: 2, pok_kunci: "K2", jumlah: 300, menutup: false });
    expect(antreanJatuhTempo(B, J, [cicil], "2026-11-25", 2026).find((x) => x.baris_id === 2)).toBeUndefined();
    const batal = { ...cicil, dibatalkan_at: "2026-11-26T00:00:00Z" };
    expect(antreanJatuhTempo(B, J, [batal], "2026-11-25", 2026).find((x) => x.baris_id === 2)?.tunggak).toBe(300);
  });
  it("tanpa jadwal tidak masuk antrean", () => {
    expect(antreanJatuhTempo([baris(9, "K9", 100)], [], [], "2026-12-31", 2026)).toEqual([]);
  });
});

describe("tautan dan isian", () => {
  it("tautan: kosong boleh; http/https sah; selainnya galat", () => {
    expect(periksaTautan("")).toBeNull();
    expect(periksaTautan("  ")).toBeNull();
    expect(periksaTautan("https://drive.google.com/drive/folders/abc?usp=sharing")).toBeNull();
    expect(periksaTautan("drive.google.com/x")).not.toBeNull();
    expect(periksaTautan("https://a b.com")).not.toBeNull();
    expect(periksaTautan("javascript:alert(1)")).not.toBeNull();
    expect(periksaTautan(`https://x.com/${"a".repeat(500)}`)).not.toBeNull();
  });
  const dasar: IsianCatat = { jenis: "bayar", tanggal: "2026-11-10", jumlah: 500, menutup: true, tercermin: false, nomorRef: "", tautan: "", catatan: "" };
  it("isian sah tanpa galat; jumlah melebihi sisa hanya peringatan", () => {
    expect(periksaIsian(dasar, 1000, "2026-11-12")).toEqual({ galat: [], peringatan: [] });
    const r = periksaIsian({ ...dasar, jumlah: 1500 }, 1000, "2026-11-12");
    expect(r.galat).toEqual([]);
    expect(r.peringatan).toHaveLength(1);
  });
  it("galat: tanggal kosong atau masa depan, jumlah nol, tautan buruk, batal tanpa alasan", () => {
    expect(periksaIsian({ ...dasar, tanggal: "" }, 0, "2026-11-12").galat).toHaveLength(1);
    expect(periksaIsian({ ...dasar, tanggal: "2026-11-13" }, 0, "2026-11-12").galat[0]).toMatch(/masa depan/);
    expect(periksaIsian({ ...dasar, jumlah: 0 }, 0, "2026-11-12").galat[0]).toMatch(/lebih dari nol/);
    expect(periksaIsian({ ...dasar, jumlah: null }, 0, "2026-11-12").galat).toHaveLength(1);
    expect(periksaIsian({ ...dasar, tautan: "abc" }, 0, "2026-11-12").galat).toHaveLength(1);
    expect(periksaIsian({ ...dasar, jenis: "batal", jumlah: null, catatan: "abc" }, 0, "2026-11-12").galat[0]).toMatch(/Alasan/);
    expect(periksaIsian({ ...dasar, jenis: "batal", jumlah: null, catatan: "tidak jadi dilaksanakan" }, 0, "2026-11-12").galat).toEqual([]);
  });
  it("usulTercermin: tanggal bayar sampai tanggal unggahan realisasi", () => {
    expect(usulTercermin("2026-10-31", "2026-10-31")).toBe(true);
    expect(usulTercermin("2026-11-01", "2026-10-31")).toBe(false);
    expect(usulTercermin("2026-10-01", null)).toBe(false);
  });
  it("isiCatat: bayar dan batal", () => {
    const p = { ro: "2906.BMA.006", rabId: 1, itemId: 10, barisId: 5, pokKunci: "K1" };
    expect(isiCatat(p, { ...dasar, jumlah: 123.456, tautan: " https://x.y/z ", nomorRef: " SPM-1 ", tercermin: true })).toEqual({
      ro_kode: "2906.BMA.006", rab_id: 1, rab_item_id: 10, rab_baris_id: 5, pok_kunci: "K1", jenis: "bayar", tanggal: "2026-11-10", jumlah: 123.46, menutup: true,
      status: "tercermin", nomor_ref: "SPM-1", tautan: "https://x.y/z", catatan: null,
    });
    const b = isiCatat(p, { ...dasar, jenis: "batal", jumlah: 77, menutup: false, tercermin: true, catatan: "kegiatan dibatalkan" });
    expect(b).toMatchObject({ jenis: "batal", jumlah: 0, menutup: true, status: "dicatat", catatan: "kegiatan dibatalkan" });
  });
  it("ringkasBayar", () => {
    const l = [
      bayar({ id: 1, rab_baris_id: 1, pok_kunci: "K1", jumlah: 100, tautan: "https://a.b/c" }),
      bayar({ id: 2, rab_baris_id: 2, pok_kunci: "K2", jumlah: 200, status: "tercermin" }),
      bayar({ id: 3, rab_baris_id: 3, pok_kunci: "K3", jumlah: 50, dibatalkan_at: "x" }),
      bayar({ id: 4, rab_baris_id: 3, pok_kunci: "K3", jenis: "batal", jumlah: 0 }),
    ];
    expect(ringkasBayar(l, [{ tunggak: 70 } as never, { tunggak: 30 } as never])).toEqual({
      nTunggak: 2, jumlahTunggak: 100, nBelumTercermin: 1, jumlahBelumTercermin: 100, nTanpaBukti: 1, nDibatalkan: 1, nAktif: 3,
    });
  });
});
