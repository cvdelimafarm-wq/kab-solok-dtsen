import { describe, expect, it } from "vitest";
import {
  angka, kodeRoSah, penugasanRo, persen, pilihRab, ringkasRo, rupiah, susunAnggaran, tabDari, urlBaca,
  type BarisLembar, type BarisPenugasan, type BarisRabItem, type BarisRealisasi,
} from "../ro";

const L = (o: Partial<BarisLembar> & { detail_id: number }): BarisLembar => ({
  ro_kode: "2906.BMA.005", komponen_kode: "051", akun_kode: "521211", kunci_stabil: `k${o.detail_id}`, nomor_item: String(o.detail_id), uraian: `Item ${o.detail_id}`,
  volume: 1, satuan: "OH", jumlah: 100, ...o,
});

describe("format dan kode", () => {
  it("angka dan rupiah memakai pemisah ribuan titik", () => {
    expect(angka(1234567)).toBe("1.234.567");
    expect(angka("2500000")).toBe("2.500.000");
    expect(angka(null)).toBe("-");
    expect(angka(Number.NaN)).toBe("-");
    expect(rupiah(1000)).toBe("Rp 1.000");
    expect(rupiah(undefined)).toBe("-");
  });
  it("persen satu desimal dan pembagi nol", () => {
    expect(persen(1, 4)).toBe("25,0%");
    expect(persen(4567, 10000)).toBe("45,7%");
    expect(persen(5, 0)).toBe("-");
  });
  it("tabDari menolak nilai tak dikenal", () => {
    expect(tabDari("anggaran")).toBe("anggaran");
    expect(tabDari("kekurangan")).toBe("kekurangan");
    expect(tabDari("rab")).toBe("rab");
    expect(tabDari("x")).toBe("ringkasan");
    expect(tabDari(null)).toBe("ringkasan");
  });
  it("kodeRoSah", () => {
    expect(kodeRoSah("2906.BMA.005")).toBe(true);
    expect(kodeRoSah("2902.FAN.ZZ1")).toBe(true);
    expect(kodeRoSah("T-001")).toBe(true);
    for (const k of ["", null, undefined, "2906.bma.005", "T-1", "../x", "2906.BMA.005/../", "2906.BMA.0055"]) expect(kodeRoSah(k as string)).toBe(false);
  });
  it("urlBaca: kunci terurut, larik digabung, null jadi 'null', dikodekan", () => {
    expect(urlBaca("keu_v_rab_item", { rab_id: 7 })).toBe("/api/sigap/keu/baca?tampilan=keu_v_rab_item&rab_id=7");
    expect(urlBaca("keu_v_x", { b: ["a", "b"], a: null }, { urut: "-id", batas: 50 })).toBe("/api/sigap/keu/baca?tampilan=keu_v_x&a=null&b=a%7Cb&urut=-id&batas=50");
    expect(urlBaca("keu_v_x", {}, { kolom: ["a", "b"] })).toBe("/api/sigap/keu/baca?tampilan=keu_v_x&kolom=a%2Cb");
  });
});

describe("susunAnggaran", () => {
  const lembar = [
    L({ detail_id: 3, komponen_kode: "052", akun_kode: "524113", nomor_item: "2", jumlah: 300 }),
    L({ detail_id: 1, nomor_item: "1", jumlah: 100 }),
    L({ detail_id: 2, nomor_item: "10", jumlah: 250 }),
    L({ detail_id: 4, akun_kode: "521811", nomor_item: null, jumlah: "50" }),
  ];
  const real: BarisRealisasi[] = [{ detail_id: 1, real_sd: 40, pagu: 100 }, { detail_id: 1, real_sd: "10", pagu: 100 }, { detail_id: null, real_sd: 999, pagu: 0 }, { detail_id: 3, real_sd: 300, pagu: 300 }];
  const rab: BarisRabItem[] = [
    { pok_kunci: "k1", baru: false, status: "sama", jumlah_rab: 100, selesai: false },
    { pok_kunci: "k2", baru: false, status: "rinci", jumlah_rab: 200, selesai: true },
    { pok_kunci: "k99", baru: true, status: "rinci", jumlah_rab: 77, selesai: false },
    { pok_kunci: null, baru: true, status: "belum", jumlah_rab: 5, selesai: false },
  ];
  const h = susunAnggaran(lembar, real, rab);
  it("mengelompokkan Komponen -> Akun -> Item berurutan kode", () => {
    expect(h.map((k) => k.komponen)).toEqual(["051", "052"]);
    expect(h[0].akun.map((a) => a.akun)).toEqual(["521211", "521811"]);
    expect(h[0].akun[0].item.map((i) => i.detail_id)).toEqual([1, 2]); // "1" lalu "10"
    expect(h[0].akun[1].item[0].nomor_item).toBeNull();
  });
  it("menjumlah POK dan realisasi (per detail, baris tanpa detail diabaikan)", () => {
    expect(h[0].akun[0].pok).toBe(350);
    expect(h[0].akun[0].realisasi).toBe(50);
    expect(h[0].akun[1].pok).toBe(50);
    expect(h[1].pok).toBe(300);
    expect(h[1].realisasi).toBe(300);
  });
  it("RAB per kunci stabil; item baru RAB tidak dihitung; item selesai tidak dijumlah", () => {
    const i1 = h[0].akun[0].item[0];
    expect(i1.rab).toBe(100);
    expect(i1.statusRab).toBe("sama");
    const i2 = h[0].akun[0].item[1];
    expect(i2.rab).toBe(200);
    expect(i2.selesai).toBe(true);
    expect(h[0].akun[0].rab).toBe(100);
    expect(h[0].akun[1].item[0].rab).toBeNull();
  });
  it("kosong -> kosong", () => expect(susunAnggaran([], [], [])).toEqual([]));
});

describe("pilihRab", () => {
  it("memilih RAB yang sedang disusun, lalu disetujui terbaru", () => {
    const d = [
      { rab_id: 1, ro_kode: "A", nomor: 1, status: "digantikan" },
      { rab_id: 2, ro_kode: "A", nomor: 2, status: "disetujui" },
      { rab_id: 3, ro_kode: "A", nomor: 3, status: "draf" },
      { rab_id: 4, ro_kode: "B", nomor: 1, status: "disetujui" },
      { rab_id: 5, ro_kode: "B", nomor: 2, status: "disetujui" },
      { rab_id: 6, ro_kode: "C", nomor: 1, status: "dibatalkan" },
    ];
    expect(pilihRab(d, "A")?.rab_id).toBe(3);
    expect(pilihRab(d, "B")?.rab_id).toBe(5);
    expect(pilihRab(d, "C")).toBeNull();
    expect(pilihRab(d, "Z")).toBeNull();
  });
});

describe("penugasanRo", () => {
  const P = (o: Partial<BarisPenugasan>): BarisPenugasan => ({ sumber: "penugasan", peran_kode: "KETUA", ro_kode: "R1", akun_id: 1, akun_nama: "Budi", berlaku_mulai: "2026-01-01", berlaku_sampai: null, aktif_hari_ini: true, ...o });
  it("hanya yang aktif hari ini dan sesuai RO; nama unik terurut", () => {
    const h = penugasanRo([
      P({ akun_nama: "Citra" }), P({ akun_nama: "Ani", akun_id: 2 }), P({ akun_nama: "Ani", akun_id: 2, sumber: "penugasan" }),
      P({ akun_nama: "Lama", aktif_hari_ini: false }), P({ akun_nama: "RoLain", ro_kode: "R2" }),
      P({ peran_kode: "ADMINRO", akun_nama: "Dedi" }), P({ peran_kode: "PBJ", akun_nama: "Eko" }),
      P({ sumber: "akses_adm", peran_kode: "AKSES_ADM", akun_nama: "Fitri", ro_kode: null }),
      P({ sumber: "akses_adm", peran_kode: "AKSES_ADM", akun_nama: "Gita", ro_kode: "R2" }),
    ], "R1");
    expect(h.ketua).toEqual(["Ani", "Citra"]);
    expect(h.adminRo).toEqual(["Dedi"]);
    expect(h.pbj).toEqual(["Eko"]);
    expect(h.aksesAdministrasi).toEqual(["Fitri"]);
    expect(h.adaKetua).toBe(true);
  });
  it("ketua tanpa ro_kode tidak dianggap ketua RO ini", () => {
    const h = penugasanRo([P({ ro_kode: null })], "R1");
    expect(h.adaKetua).toBe(false);
    expect(h.ketua).toEqual([]);
  });
});

describe("ringkasRo", () => {
  const ang = susunAnggaran(
    [L({ detail_id: 1, jumlah: 100 }), L({ detail_id: 2, jumlah: 300, kunci_stabil: "k2" })],
    [{ detail_id: 1, real_sd: 25, pagu: 100 }],
    [{ pok_kunci: "k1", baru: false, status: "sama", jumlah_rab: 100, selesai: false }],
  );
  it("menggabungkan angka", () => {
    const r = ringkasRo(ang, { total: "0.82", kategori: "Baik", ada_rab_sah: true }, { n_terbuka: "2", jumlah_terbuka: "5000" }, { persen_terverifikasi: "40", n_dok: 10, n_belum: "6" });
    expect(r.pok).toBe(400);
    expect(r.realisasi).toBe(25);
    expect(r.rabJumlah).toBe(100);
    expect(r.nItem).toBe(2);
    expect(r.nItemBerRab).toBe(1);
    expect(r.skor).toEqual({ total: 0.82, kategori: "Baik" });
    expect(r.kekurangan).toEqual({ nTerbuka: 2, jumlahTerbuka: 5000 });
    expect(r.administrasi).toEqual({ persenVerifikasi: 40, nDok: 10, nBelum: 6 });
  });
  it("tanpa data: skor null dan nol", () => {
    const r = ringkasRo([], { total: null, kategori: null, ada_rab_sah: false }, null, undefined);
    expect(r.skor).toBeNull();
    expect(r.kekurangan).toEqual({ nTerbuka: 0, jumlahTerbuka: 0 });
    expect(r.administrasi).toEqual({ persenVerifikasi: null, nDok: 0, nBelum: 0 });
  });
});
