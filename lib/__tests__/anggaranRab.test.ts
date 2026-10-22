// (22 Okt 2026) Uji lib/anggaranRab.ts: RAB berversi, persetujuan, vonis sisa/kurang, RPD, serapan, pasangan revisi.
import { describe, expect, it } from "vitest";
import {
  alasanRevisiSah,
  bandingRpd,
  batasAmanGeser,
  bolehMenyetujui,
  cekSetujuRab,
  jenisPergeseran,
  jumlahBaris,
  pasangkanRevisi,
  pergeseranTerjauh,
  polaBawaan,
  rentangBawaan,
  ringkasSerapan,
  rp,
  rpdDariRab,
  salinPokKeRab,
  sebarKeBulan,
  simpanganPersen,
  totalRab,
  vonisRab,
  type BarisRab,
  type SelisihItem,
} from "../anggaranRab";

const PAGU_RO = 937_222_000;
const RAB_V4 = 748_164_540;

describe("RAB: salinan POK dan total", () => {
  it("v1 disalin dari POK: total sama dengan jumlah pagu, baris tanpa rincian jadi 1 PAKET", () => {
    const detail = [
      { komponen: "051", subKomponen: "A", akun: "524113", uraian: "Transport lokal", volume: 100, satuan: "OH", harga: 170_000, jumlah: 17_000_000 },
      { komponen: "051", subKomponen: "A", akun: "521213", uraian: "Honor petugas", volume: null, satuan: "", harga: null, jumlah: 5_500_000 },
      // rincian tidak cocok dengan jumlah -> dipakai jumlah sebagai satu paket
      { komponen: "052", subKomponen: "", akun: "521211", uraian: "Bahan", volume: 3, satuan: "BH", harga: 1000, jumlah: 9999 },
    ];
    const rab = salinPokKeRab(detail);
    expect(totalRab(rab)).toBe(17_000_000 + 5_500_000 + 9999);
    expect(rab[0]).toMatchObject({ volume: 100, satuan: "OH", harga: 170_000 });
    expect(rab[1]).toMatchObject({ volume: 1, satuan: "PAKET", harga: 5_500_000 });
    expect(rab[2]).toMatchObject({ volume: 1, satuan: "PAKET", harga: 9999 });
    expect(rab[0].kunci).toBe("051|A|524113|transport lokal");
  });

  it("jumlah baris dibulatkan ke rupiah", () => {
    expect(jumlahBaris({ volume: 2.5, harga: 1001 })).toBe(2503);
  });
});

describe("persetujuan RAB (cermin trigger SQL)", () => {
  it("boleh bila total <= pagu x (100 - cadangan)%", () => {
    const r = cekSetujuRab(RAB_V4, PAGU_RO, 5);
    expect(r.boleh).toBe(true);
    expect(r.batas).toBeCloseTo(890_360_900, 0);
    expect(r.pesan).toBeNull();
  });
  it("tepat di batas masih boleh; lebih satu rupiah tidak", () => {
    expect(cekSetujuRab(950, 1000, 5).boleh).toBe(true);
    const r = cekSetujuRab(951, 1000, 5);
    expect(r.boleh).toBe(false);
    expect(r.lebih).toBeCloseTo(1, 5);
    expect(r.pesan).toContain("cadangan 5%");
  });
  it("penyusun tidak boleh menyetujui versinya sendiri", () => {
    expect(bolehMenyetujui(7, 7)).toBe(false);
    expect(bolehMenyetujui(7, 8)).toBe(true);
  });
});

describe("rentang dan vonis", () => {
  it("rentang bawaan menurun menurut versi: 22, 14, 8, 5, 5", () => {
    expect([1, 2, 3, 4, 9].map(rentangBawaan)).toEqual([22, 14, 8, 5, 5]);
    expect(rentangBawaan(0)).toBe(22);
  });

  it("contoh rancangan: RAB v4 +-5% terhadap pagu RO 2907.BMA.009 = sisa hampir pasti, sisa tengah Rp 189.057.460", () => {
    const v = vonisRab(PAGU_RO, RAB_V4, 5);
    expect(v.vonis).toBe("sisa_pasti");
    expect(v.selisihTengah).toBe(189_057_460);
    expect(v.selisihMin).toBeGreaterThan(0);
    expect(v.selisihMin).toBeLessThan(v.selisihTengah);
    expect(v.selisihMaks).toBeGreaterThan(v.selisihTengah);
    expect(v.teks).toContain("Sisa hampir pasti");
  });

  it("v1 +-22% pada RAB yang sama belum pasti bila kisaran memotong pagu", () => {
    // 748 juta x 1,22 = 912 juta < 937 juta -> masih sisa pasti; pakai RAB lebih besar supaya memotong
    expect(vonisRab(PAGU_RO, 800_000_000, 22).vonis).toBe("belum_pasti");
    expect(vonisRab(PAGU_RO, 748_164_540, 22).vonis).toBe("sisa_pasti");
  });

  it("batas bawah > pagu = kekurangan hampir pasti", () => {
    const v = vonisRab(1_000_000, 1_200_000, 10);
    expect(v.vonis).toBe("kurang_pasti");
    expect(v.teks).toContain("Kekurangan hampir pasti");
    expect(v.selisihTengah).toBe(-200_000);
  });

  it("batas tepat sama dengan pagu = belum pasti (tidak berani memvonis)", () => {
    expect(vonisRab(1100, 1000, 10).vonis).toBe("belum_pasti"); // atas = 1100 = pagu
    expect(vonisRab(900, 1000, 10).vonis).toBe("belum_pasti"); // bawah = 900 = pagu
  });

  it("simpangan versi lama terhadap realisasi untuk kalibrasi rentang", () => {
    expect(simpanganPersen(110, 100)).toBe(10);
    expect(simpanganPersen(90, 100)).toBe(10);
    expect(simpanganPersen(100, 0)).toBeNull();
  });
});

describe("RPD: sebaran per bulan", () => {
  it("jumlah 12 bulan selalu sama dengan jumlah awal (sisa terbesar), tanpa selisih satu rupiah", () => {
    for (const jumlah of [100, 101, 1_000_001, 937_222_000, 7]) {
      const per = sebarKeBulan(jumlah, [{ bulan: 3, bobot: 1 }, { bulan: 4, bobot: 1 }, { bulan: 5, bobot: 1 }], 1);
      expect(per.reduce((a, b) => a + b, 0)).toBe(jumlah);
      expect(per[0]).toBe(0);
      expect(per[11]).toBe(0);
    }
  });

  it("bobot tidak sama mengikuti proporsi", () => {
    const per = sebarKeBulan(1000, [{ bulan: 1, bobot: 3 }, { bulan: 2, bobot: 1 }], 1);
    expect(per[0]).toBe(750);
    expect(per[1]).toBe(250);
  });

  it("tanpa jadwal atau bobot nol: seluruhnya ke bulan bawaan; bulan di luar 1-12 diabaikan", () => {
    expect(sebarKeBulan(500, undefined, 6)[5]).toBe(500);
    expect(sebarKeBulan(500, [{ bulan: 13, bobot: 1 }, { bulan: 2, bobot: 0 }], 12)[11]).toBe(500);
  });

  it("pola bawaan: pelatihan di awal, transport merata, honor sebulan setelah selesai", () => {
    expect(polaBawaan("524111", "Pelatihan petugas", 10, 12)).toEqual([{ bulan: 10, bobot: 1 }]);
    expect(polaBawaan("524113", "Transport lokal", 10, 12)).toEqual([
      { bulan: 10, bobot: 1 },
      { bulan: 11, bobot: 1 },
      { bulan: 12, bobot: 1 },
    ]);
    expect(polaBawaan("521213", "Honor PPL", 10, 11)).toEqual([{ bulan: 12, bobot: 1 }]);
    expect(polaBawaan("521213", "Honor PPL", 10, 12)).toEqual([{ bulan: 12, bobot: 1 }]); // tidak melewati Desember
  });

  it("RPD dari RAB menjumlahkan semua baris dan totalnya = total RAB", () => {
    const baris: BarisRab[] = [
      { kunci: "a", akun: "524111", uraian: "Pelatihan", volume: 1, satuan: "PAKET", harga: 30_000_000, jadwal: [{ bulan: 10, bobot: 1 }] },
      { kunci: "b", akun: "524113", uraian: "Transport", volume: 100, satuan: "OH", harga: 170_001, jadwal: [{ bulan: 10, bobot: 1 }, { bulan: 11, bobot: 1 }, { bulan: 12, bobot: 1 }] },
      { kunci: "c", akun: "521213", uraian: "Honor", volume: 1, satuan: "PAKET", harga: 5_000_000 },
    ];
    const rpd = rpdDariRab(baris, 12);
    expect(rpd).toHaveLength(12);
    expect(rpd.reduce((a, b) => a + b, 0)).toBe(totalRab(baris));
    expect(rpd[9]).toBeGreaterThan(30_000_000);
    expect(rpd[11]).toBeGreaterThan(5_000_000); // honor tanpa jadwal -> bulan bawaan (12)
  });

  it("bandingan RPD dengan v1: selisih dan kumulatif", () => {
    const v1 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 100, 100];
    const kini = [0, 0, 0, 0, 0, 0, 0, 0, 0, 120, 80, 50];
    const b = bandingRpd(kini, v1);
    expect(b[9].selisih).toBe(20);
    expect(b[10].selisih).toBe(-20);
    expect(b[11].kumulatifRpd).toBe(250);
    expect(b[11].kumulatifV1).toBe(300);
  });
});

describe("serapan", () => {
  it("terpakai = realisasi + komitmen yang belum direalisasikan; persen satu desimal", () => {
    const s = ringkasSerapan(1_000_000, 200_000, 300_000);
    expect(s.terpakai).toBe(500_000);
    expect(s.sisa).toBe(500_000);
    expect(s.persenRealisasi).toBe(30);
    expect(s.persenTerpakai).toBe(50);
  });
  it("pagu 0 tidak membagi nol", () => {
    expect(ringkasSerapan(0, 0, 0).persenRealisasi).toBeNull();
  });
});

const item = (kunci: string, program: string, ro: string, selisih: number): SelisihItem => ({ kunci, uraian: kunci, programKode: program, roKode: ro, selisih });

describe("revisi: pasangan sisa dan kurang", () => {
  it("jenis pergeseran: dalam RO, antar RO, antar program", () => {
    expect(jenisPergeseran(item("a", "P1", "R1", 1), item("b", "P1", "R1", -1))).toBe("dalam_ro");
    expect(jenisPergeseran(item("a", "P1", "R1", 1), item("b", "P1", "R2", -1))).toBe("antar_ro");
    expect(jenisPergeseran(item("a", "P1", "R1", 1), item("b", "P2", "R1", -1))).toBe("antar_program");
  });

  it("menutup kekurangan dari sisa terdekat lebih dulu (dalam RO sebelum antar RO)", () => {
    const hasil = pasangkanRevisi([item("sisa-dekat", "P1", "R1", 100), item("sisa-jauh", "P1", "R2", 500), item("kurang", "P1", "R1", -80)]);
    expect(hasil.pasangan).toHaveLength(1);
    expect(hasil.pasangan[0]).toMatchObject({ jumlah: 80, jenis: "dalam_ro" });
    expect(hasil.pasangan[0].dari.kunci).toBe("sisa-dekat");
    expect(hasil.sisaBelumDipakai.map((x) => [x.item.kunci, x.jumlah])).toEqual([["sisa-dekat", 20], ["sisa-jauh", 500]]);
    expect(hasil.kurangBelumTertutup).toEqual([]);
  });

  it("kekurangan dilayani dari beberapa sisa; yang tak tertutup dilaporkan", () => {
    const hasil = pasangkanRevisi([item("s1", "P1", "R1", 60), item("s2", "P1", "R1", 30), item("k1", "P1", "R1", -150)]);
    expect(hasil.totalDigeser).toBe(90);
    expect(hasil.pasangan.map((p) => p.jumlah)).toEqual([60, 30]);
    expect(hasil.kurangBelumTertutup).toEqual([{ item: expect.objectContaining({ kunci: "k1" }), jumlah: 60 }]);
    expect(hasil.sisaBelumDipakai).toEqual([]);
  });

  it("antar program dipakai paling akhir dan menentukan pergeseran terjauh", () => {
    const hasil = pasangkanRevisi([item("s-program-lain", "P2", "R9", 100), item("s-ro-lain", "P1", "R2", 40), item("k", "P1", "R1", -100)]);
    expect(hasil.pasangan.map((p) => [p.dari.kunci, p.jumlah, p.jenis])).toEqual([
      ["s-ro-lain", 40, "antar_ro"],
      ["s-program-lain", 60, "antar_program"],
    ]);
    expect(pergeseranTerjauh(hasil.pasangan)).toBe("antar_program");
    expect(pergeseranTerjauh([])).toBeNull();
  });

  it("jumlah digeser selalu sama dari dua sisi: tidak ada uang tercipta atau hilang", () => {
    const hasil = pasangkanRevisi([item("a", "P1", "R1", 70), item("b", "P1", "R2", 33), item("c", "P2", "R1", 11), item("d", "P1", "R1", -50), item("e", "P1", "R2", -40), item("f", "P3", "R1", -10)]);
    const dariSisa = hasil.pasangan.reduce((t, p) => t + p.jumlah, 0);
    const sisaAwal = 70 + 33 + 11;
    const kurangAwal = 50 + 40 + 10;
    expect(dariSisa + hasil.sisaBelumDipakai.reduce((t, x) => t + x.jumlah, 0)).toBe(sisaAwal);
    expect(dariSisa + hasil.kurangBelumTertutup.reduce((t, x) => t + x.jumlah, 0)).toBe(kurangAwal);
  });

  it("item selisih 0 diabaikan", () => {
    const hasil = pasangkanRevisi([item("nol", "P1", "R1", 0)]);
    expect(hasil.pasangan).toEqual([]);
    expect(hasil.sisaBelumDipakai).toEqual([]);
  });

  it("hasil tidak bergantung urutan masukan", () => {
    const a = [item("s1", "P1", "R1", 100), item("s2", "P1", "R2", 100), item("k1", "P1", "R1", -120), item("k2", "P1", "R2", -50)];
    const hasil1 = pasangkanRevisi(a);
    const hasil2 = pasangkanRevisi([...a].reverse());
    expect(hasil2.pasangan.map((p) => [p.dari.kunci, p.ke.kunci, p.jumlah])).toEqual(hasil1.pasangan.map((p) => [p.dari.kunci, p.ke.kunci, p.jumlah]));
  });

  it("batas aman = sisa dikurangi cadangan 5% RAB, tidak pernah negatif", () => {
    expect(batasAmanGeser(189_057_460, RAB_V4, 5)).toBe(Math.round(189_057_460 - RAB_V4 * 0.05));
    expect(batasAmanGeser(1000, 1_000_000, 5)).toBe(0);
  });

  it("alasan revisi minimal 20 karakter bermakna", () => {
    expect(alasanRevisiSah("   terlalu pendek   ")).toBe(false);
    expect(alasanRevisiSah("Kebutuhan transport lokal naik karena jumlah wilayah bertambah")).toBe(true);
  });
});

describe("format rupiah", () => {
  it("titik ribuan dan tanda negatif", () => {
    expect(rp(937_222_000)).toBe("Rp 937.222.000");
    expect(rp(-1500)).toBe("-Rp 1.500");
    expect(rp(0)).toBe("Rp 0");
  });
});
