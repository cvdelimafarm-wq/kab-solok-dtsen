import { describe, expect, it } from "vitest";
import { hitungRuntutanVanguard, periksaKelayakan, type AturanVanguard } from "../runtutanVanguard";
import { ringkasRuntutanPeserta, teksRuntutan, type RuntutanKartu } from "../vanguardPelatihan";

const A: AturanVanguard = { mode: "wajib", hari_berturut: 3, sesi_min_per_hari: 1, nilai_minimal: 0 };
const s = (tgl: string) => ({ selesai_at: `${tgl}T05:00:00Z`, skor: 50 });
const kartu = (sesi: ReturnType<typeof s>[], hariIni: string, pretest = "2026-11-09", mode: AturanVanguard["mode"] = "wajib"): RuntutanKartu => {
  const r = hitungRuntutanVanguard(sesi, hariIni, { ...A, mode });
  return { mode, tuntas: r.tuntas, berturut: r.berturut, hari_berturut: 3, hari_ini_sudah: r.hari_ini_sudah, terputus: r.terputus, petak: r.petak, kelayakan: periksaKelayakan(r, hariIni, pretest), tanggal_pretest: pretest };
};

describe("teksRuntutan", () => {
  it("belum mulai: menyebut batas mulai dan kunci Pretest", () => {
    const t = teksRuntutan(kartu([], "2026-11-02"));
    expect(t.judul).toBe("Latihan 0 dari 3 hari berturut-turut");
    expect(t.ket).toMatch(/Batas mulai/);
    expect(t.ket).toMatch(/Pretest terkunci/);
    expect(t.peringatan).toBe(false);
  });
  it("hari terakhir mulai menonjol; lewat batas menonjol", () => {
    expect(teksRuntutan(kartu([], "2026-11-06")).peringatan).toBe(true);
    const lewat = teksRuntutan(kartu([], "2026-11-07"));
    expect(lewat.peringatan).toBe(true);
    expect(lewat.ket).toMatch(/sudah lewat/);
  });
  it("terputus, sudah hari ini, dan tuntas", () => {
    expect(teksRuntutan(kartu([s("2026-11-02")], "2026-11-04")).ket).toMatch(/terputus/);
    expect(teksRuntutan(kartu([s("2026-11-04")], "2026-11-04")).ket).toMatch(/Hari ini sudah ada latihan/);
    const tuntas = teksRuntutan(kartu([s("2026-11-02"), s("2026-11-03"), s("2026-11-04")], "2026-11-04"));
    expect(tuntas.judul).toBe("Latihan 3 dari 3 hari berturut-turut");
    expect(tuntas.ket).toMatch(/Selesai/);
  });
  it("opsional: tidak menyebut kunci atau batas mulai", () => {
    const t = teksRuntutan(kartu([], "2026-11-02", "2026-11-09", "opsional"));
    expect(t.ket).not.toMatch(/terkunci/);
    expect(t.ket).not.toMatch(/Batas mulai/);
  });
});

describe("ringkasRuntutanPeserta", () => {
  it("menghitung tuntas, berjalan, belum mulai, terputus, dan lewat batas", () => {
    const hasil = (sesi: ReturnType<typeof s>[], hariIni: string) => {
      const r = hitungRuntutanVanguard(sesi, hariIni, A);
      return { ...r, kelayakan: periksaKelayakan(r, hariIni, "2026-11-09") };
    };
    const r = ringkasRuntutanPeserta([
      hasil([s("2026-11-02"), s("2026-11-03"), s("2026-11-04")], "2026-11-04"),
      hasil([s("2026-11-03")], "2026-11-04"),
      hasil([], "2026-11-04"),
      hasil([s("2026-11-01")], "2026-11-04"),
      hasil([], "2026-11-08"),
    ]);
    expect(r).toEqual({ total: 5, tuntas: 1, berjalan: 1, belum_mulai: 2, terputus: 1, lewat_batas: 1 });
  });
});
