import { describe, expect, it } from "vitest";
import { arahSapuan, geserTanggal, kelompokDariTanggal, nilaiHariArsip, tanggalAwalArsip, type HariArsip } from "../sigapArsipTanggal";

const A = { wajibLaporan: true, jumlahFoto: 5 };
const hari = (o: Partial<HariArsip>): HariArsip => ({ tanggal: "2026-10-20", kunci: "terlewat", lengkap: false, laporan: false, laporanDianggap: false, jumlahFoto: 0, ...o });

describe("nilaiHariArsip", () => {
  it("lengkap -> hijau, tidak perlu dilengkapi", () => {
    expect(nilaiHariArsip(hari({ lengkap: true, laporan: true, jumlahFoto: 5 }), A)).toMatchObject({ nada: "hijau", label: "Lengkap", kurang: false });
  });
  it("lampau tidak lengkap -> merah Terlewat; hari ini/izin tidak lengkap -> kuning", () => {
    expect(nilaiHariArsip(hari({ jumlahFoto: 3 }), A)).toMatchObject({ nada: "merah", label: "Terlewat", kurang: true });
    expect(nilaiHariArsip(hari({ kunci: "hari_ini" }), A)).toMatchObject({ nada: "kuning", label: "Belum lengkap", kurang: true });
    expect(nilaiHariArsip(hari({ kunci: "izin" }), A)).toMatchObject({ nada: "kuning", kurang: true });
  });
  it("rencana (akan datang) -> abu dan bukan kekurangan", () => {
    expect(nilaiHariArsip(hari({ kunci: "akan_datang" }), A)).toMatchObject({ nada: "abu", label: "Rencana", kurang: false });
  });
  it("rincian laporan dan foto", () => {
    expect(nilaiHariArsip(hari({ laporan: true }), A).laporan).toBe("ok");
    expect(nilaiHariArsip(hari({ laporanDianggap: true }), A).laporan).toBe("dianggap");
    expect(nilaiHariArsip(hari({}), A).laporan).toBe("kurang");
    expect(nilaiHariArsip(hari({}), { wajibLaporan: false, jumlahFoto: 5 }).laporan).toBe("tidak_wajib");
    expect(nilaiHariArsip(hari({ jumlahFoto: 4 }), A).foto).toEqual({ ada: 4, total: 5, ok: false });
    expect(nilaiHariArsip(hari({ jumlahFoto: 5 }), A).foto.ok).toBe(true);
  });
});

describe("tanggalAwalArsip", () => {
  const t = ["2026-10-22", "2026-10-20", "2026-10-26"];
  it("hari ini bila hari kerja", () => expect(tanggalAwalArsip(t, "2026-10-22")).toBe("2026-10-22"));
  it("kalau bukan: hari kerja terakhir sebelum hari ini", () => expect(tanggalAwalArsip(t, "2026-10-24")).toBe("2026-10-22"));
  it("belum ada yang lampau: yang pertama", () => expect(tanggalAwalArsip(t, "2026-10-01")).toBe("2026-10-20"));
  it("kosong -> null", () => expect(tanggalAwalArsip([], "2026-10-01")).toBeNull());
});

describe("geserTanggal", () => {
  const t = ["2026-10-22", "2026-10-20", "2026-10-26"];
  it("maju/mundur menurut urutan tanggal, berhenti di ujung", () => {
    expect(geserTanggal(t, "2026-10-20", 1)).toBe("2026-10-22");
    expect(geserTanggal(t, "2026-10-22", 1)).toBe("2026-10-26");
    expect(geserTanggal(t, "2026-10-26", 1)).toBe("2026-10-26");
    expect(geserTanggal(t, "2026-10-20", -1)).toBe("2026-10-20");
  });
  it("tanggal tak dikenal -> yang pertama", () => expect(geserTanggal(t, "2026-01-01", 1)).toBe("2026-10-20"));
});

describe("kelompokDariTanggal", () => {
  const k = [
    { mulai: "2026-10-20", selesai: "2026-10-22", tanggal: ["2026-10-20", "2026-10-22"], nominal: 100 },
    { mulai: "2026-10-26", selesai: "2026-10-27", tanggal: ["2026-10-26"], nominal: 50 },
  ];
  it("menemukan kelompok yang memuat tanggal; hari yang tidak masuk -> null", () => {
    expect(kelompokDariTanggal(k, "2026-10-22")?.nominal).toBe(100);
    expect(kelompokDariTanggal(k, "2026-10-21")).toBeNull();
  });
});

describe("arahSapuan", () => {
  it("sapuan mendatar jelas -> arah; ke kiri = berikutnya", () => {
    expect(arahSapuan(-90, 10)).toBe(1);
    expect(arahSapuan(90, -10)).toBe(-1);
  });
  it("pendek atau terutama tegak (menggulir) -> diabaikan", () => {
    expect(arahSapuan(-30, 0)).toBe(0);
    expect(arahSapuan(-80, 70)).toBe(0);
  });
});
