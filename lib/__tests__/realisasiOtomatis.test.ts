import { describe, expect, it } from "vitest";
import { MAKS_LOKASI, bandingkanOtomatis, laporanDianggap, satuanLaporan, sumberUntukPeran, susunRealisasiOtomatis, type BarisOtomatis, type WilayahRingkas } from "@/lib/realisasiOtomatis";

// (11 Okt 2026) Uji isian otomatis Laporan realisasi PML (identifikasi) dan PPL (pendataan).
const W: WilayahRingkas[] = [
  { idsubsls: "1303080001000801", kecamatan: "GUNUNG TALANG", nagari: "CUPAK", sls: "JORONG SAWAH TALUAK" },
  { idsubsls: "1303080001000802", kecamatan: "GUNUNG TALANG", nagari: "CUPAK", sls: "JORONG SAWAH TALUAK" },
  { idsubsls: "1303080001000901", kecamatan: "GUNUNG TALANG", nagari: "CUPAK", sls: "JORONG TANGAH PADANG" },
  { idsubsls: "1303050001000101", kecamatan: "LEMBAH GUMANTI", nagari: "ALAHAN PANJANG", sls: "JORONG B" },
];
const idf = (tanggal: string, idsubsls: string): BarisOtomatis => ({ tanggal, idsubsls, n: 1, sumber: "identifikasi" });
const pen = (tanggal: string, idsubsls: string, n: number): BarisOtomatis => ({ tanggal, idsubsls, n, sumber: "pendataan" });

describe("satuan & sumber menurut peran", () => {
  it("PML Pascabencana memakai Sub SLS, lainnya satuan kegiatan", () => {
    expect(satuanLaporan("pascabencana_2026", "pml", "keluarga")).toBe("Sub SLS");
    expect(satuanLaporan("pascabencana_2026", "ppl", "keluarga")).toBe("keluarga");
    expect(satuanLaporan("spdt_ntp_2026", "pml", "ruta")).toBe("ruta");
  });
  it("sumber otomatis hanya untuk Pascabencana", () => {
    expect(sumberUntukPeran("pascabencana_2026", "pml")).toBe("identifikasi");
    expect(sumberUntukPeran("pascabencana_2026", "ppl")).toBe("pendataan");
    expect(sumberUntukPeran("pascabencana_2026", "korwil")).toBe("pendataan");
    expect(sumberUntukPeran("pascabencana_2026", "lainnya")).toBeNull();
    expect(sumberUntukPeran("spdt_ntp_2026", "ppl")).toBeNull();
  });
});

describe("susunRealisasiOtomatis", () => {
  it("PML: jumlah = Sub SLS, lokasi = jorong berbeda dan terurut", () => {
    const m = susunRealisasiOtomatis([idf("2026-10-10", "1303080001000901"), idf("2026-10-10", "1303080001000802"), idf("2026-10-10", "1303080001000801"), idf("2026-10-11", "1303050001000101")], W, "Sub SLS");
    const h = m.get("2026-10-10")!;
    expect(h.jumlah).toBe(3);
    expect(h.sumber).toBe("identifikasi");
    expect(h.lokasi.map((l) => l.jorong)).toEqual(["JORONG SAWAH TALUAK", "JORONG TANGAH PADANG"]);
    expect(h.lokasi[0].idsubsls).toBe("1303080001000801");
    expect(h.lokasi_terpotong).toBe(0);
    expect(m.get("2026-10-11")!.jumlah).toBe(1);
    expect(m.has("2026-10-12")).toBe(false);
  });
  it("PPL: jumlah = jumlah KK per Sub SLS", () => {
    const m = susunRealisasiOtomatis([pen("2026-10-11", "1303080001000801", 7), pen("2026-10-11", "1303080001000802", 5), pen("2026-10-11", "1303080001000901", 3)], W, "keluarga");
    const h = m.get("2026-10-11")!;
    expect(h.jumlah).toBe(15);
    expect(h.lokasi).toHaveLength(2);
    expect(h.satuan).toBe("keluarga");
  });
  it("Sub SLS tak dikenal tetap dihitung di jumlah tetapi tanpa lokasi; baris n=0 dibuang", () => {
    const m = susunRealisasiOtomatis([pen("2026-10-11", "9999999999999999", 4), pen("2026-10-11", "1303080001000801", 0)], W, "keluarga");
    expect(m.get("2026-10-11")!.jumlah).toBe(4);
    expect(m.get("2026-10-11")!.lokasi).toEqual([]);
  });
  it("lokasi dibatasi MAKS_LOKASI dan sisanya dihitung", () => {
    const wil: WilayahRingkas[] = Array.from({ length: 13 }, (_, i) => ({ idsubsls: `13030800010${String(i).padStart(5, "0")}`, kecamatan: "K", nagari: "N", sls: `J${String(i).padStart(2, "0")}` }));
    const m = susunRealisasiOtomatis(wil.map((w) => idf("2026-10-11", w.idsubsls)), wil, "Sub SLS");
    const h = m.get("2026-10-11")!;
    expect(h.jumlah).toBe(13);
    expect(h.lokasi).toHaveLength(MAKS_LOKASI);
    expect(h.lokasi_terpotong).toBe(3);
  });
});

describe("bandingkanOtomatis", () => {
  const oto = susunRealisasiOtomatis([idf("2026-10-10", "1303080001000801"), idf("2026-10-10", "1303080001000901")], W, "Sub SLS").get("2026-10-10")!;
  const lokasi = oto.lokasi.map(({ kecamatan, nagari, jorong }) => ({ kecamatan, nagari, jorong }));
  it("sama persis", () => {
    expect(bandingkanOtomatis({ lokasi, jumlah: 2 }, oto).semuaSama).toBe(true);
  });
  it("urutan dan huruf besar/kecil tidak berpengaruh", () => {
    const acak = [...lokasi].reverse().map((l) => ({ ...l, jorong: l.jorong.toLowerCase() }));
    expect(bandingkanOtomatis({ lokasi: acak, jumlah: 2 }, oto).lokasiSama).toBe(true);
  });
  it("beda jumlah / lokasi dikenali terpisah; jumlah kosong tidak sama", () => {
    expect(bandingkanOtomatis({ lokasi, jumlah: 3 }, oto)).toEqual({ lokasiSama: true, jumlahSama: false, semuaSama: false });
    expect(bandingkanOtomatis({ lokasi: lokasi.slice(0, 1), jumlah: 2 }, oto)).toEqual({ lokasiSama: false, jumlahSama: true, semuaSama: false });
    expect(bandingkanOtomatis({ lokasi, jumlah: null }, oto).jumlahSama).toBe(false);
  });
});

describe("laporanDianggap (12 Okt 2026)", () => {
  const oto = { jumlah: 4 };
  it("hari lampau, tanpa laporan manual, ada hasil -> dianggap", () => {
    expect(laporanDianggap("2026-10-10", "2026-10-12", false, oto)).toBe(true);
  });
  it("hari ini dan hari mendatang tidak dianggap", () => {
    expect(laporanDianggap("2026-10-12", "2026-10-12", false, oto)).toBe(false);
    expect(laporanDianggap("2026-10-13", "2026-10-12", false, oto)).toBe(false);
  });
  it("sudah ada laporan manual -> bukan 'dianggap'", () => {
    expect(laporanDianggap("2026-10-10", "2026-10-12", true, oto)).toBe(false);
  });
  it("tanpa hasil lapangan -> tidak dianggap", () => {
    expect(laporanDianggap("2026-10-10", "2026-10-12", false, null)).toBe(false);
    expect(laporanDianggap("2026-10-10", "2026-10-12", false, { jumlah: 0 })).toBe(false);
  });
});
