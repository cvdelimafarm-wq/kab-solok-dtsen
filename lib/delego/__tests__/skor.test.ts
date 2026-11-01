import { describe, expect, it } from "vitest";
import { BAWAAN_KERTAS, bacaKertas, bandingSkor, bulatkanSkor, galatAlasanSkor, hitungKertas, kalibrasi, median, menitPerSatuan, poinDariMenit, type KertasKerja } from "../skor";
import type { JenisSkor } from "../tipe";

const j = (id: number, nama: string, satuan: string, poin: number, o: Partial<JenisSkor> = {}): JenisSkor => ({
  id, kode: `k${id}`, nama, satuan, poin_per_satuan: poin, uraian: "", aktif: true, skor_status: "disetujui", skor_alasan: "", kertas_kerja: null, diusulkan_oleh: null, diusulkan_nama: null, urut: id, ...o,
});
const katalog = [j(1, "Periksa dokumen Susenas", "dokumen", 4), j(2, "Periksa dokumen Seruti", "dokumen", 4), j(3, "Periksa dokumen pengadaan", "dokumen", 5), j(4, "Periksa peta", "peta", 5)];

describe("konversi poin dan menit", () => {
  it("1 poin = 6 menit pada kapasitas 75 poin per 450 menit", () => {
    expect(poinDariMenit(450)).toBe(75);
    expect(poinDariMenit(30)).toBeCloseTo(5, 5);
  });
  it("median", () => {
    expect(median([])).toBeNull();
    expect(median([4, 4, 5])).toBe(4);
    expect(median([1, 3])).toBe(2);
  });
});

describe("bandingSkor", () => {
  it("setaraLain menunjukkan pekerjaan bersatuan lain yang skornya terdekat", () => {
    const b = bandingSkor(katalog, "dokumen", 4.8);
    expect(b.setaraLain.every((x) => x.satuan !== "dokumen")).toBe(true);
    expect(b.setaraLain[0].nama).toBe("Periksa peta");
    const c = bandingSkor(katalog, "satuan baru", 5);
    expect(c.n).toBe(0);
    expect(c.setaraLain).toHaveLength(3);
  });
  it("skor wajar tidak diperingatkan dan menampilkan tiga pembanding terdekat", () => {
    const b = bandingSkor(katalog, "dokumen", 4.5);
    expect(b.n).toBe(3);
    expect(b.median).toBe(4);
    expect(b.peringatan).toBeNull();
    expect(b.perluAlasan).toBe(false);
    expect(b.setara).toHaveLength(3);
    expect(b.setara[0].poin).toBe(4);
  });
  it("skor lebih dari 2 kali median diperingatkan dan wajib beralasan", () => {
    const b = bandingSkor(katalog, "dokumen", 9);
    expect(b.rasio).toBe(2.25);
    expect(b.peringatan).toBe("tinggi");
    expect(b.menit).toBe(54);
    expect(b.pesan).toContain("Jelaskan alasannya");
    expect(galatAlasanSkor(b, "")).toContain("alasan");
    expect(galatAlasanSkor(b, "Tiap dokumen memuat 400 butir bukti")).toBeNull();
  });
  it("skor kurang dari separuh median diperingatkan rendah", () => {
    const b = bandingSkor(katalog, "dokumen", 1.5);
    expect(b.peringatan).toBe("rendah");
  });
  it("batas tepat 2 kali dan 0,5 kali tidak diperingatkan", () => {
    expect(bandingSkor(katalog, "dokumen", 8).peringatan).toBeNull();
    expect(bandingSkor(katalog, "dokumen", 2).peringatan).toBeNull();
  });
  it("satuan dicocokkan tanpa memedulikan huruf besar dan spasi; satuan lain tidak ikut", () => {
    const b = bandingSkor(katalog, "  Dokumen ", 4);
    expect(b.n).toBe(3);
    expect(bandingSkor(katalog, "peta", 5).n).toBe(1);
  });
  it("tanpa pembanding hanya menampilkan setara menit", () => {
    const b = bandingSkor(katalog, "rapat", 12);
    expect(b.n).toBe(0);
    expect(b.peringatan).toBeNull();
    expect(b.menit).toBe(72);
    expect(b.pesan).toContain("Belum ada pekerjaan");
  });
  it("usulan, ditolak, nonaktif, dan jenis yang sedang diedit tidak menjadi pembanding", () => {
    const k = [...katalog, j(9, "Usulan", "dokumen", 100, { skor_status: "usulan", aktif: false }), j(10, "Mati", "dokumen", 100, { aktif: false }), j(11, "Ditolak", "dokumen", 100, { skor_status: "ditolak", aktif: false })];
    expect(bandingSkor(k, "dokumen", 4).n).toBe(3);
    expect(bandingSkor(katalog, "dokumen", 4, 1).n).toBe(2);
  });
  it("skor nol atau tidak sah tidak menghasilkan peringatan", () => {
    expect(bandingSkor(katalog, "dokumen", 0).pesan).toBe("");
    expect(bandingSkor(katalog, "dokumen", Number.NaN).peringatan).toBeNull();
  });
});

describe("kertas kerja", () => {
  it("memeriksa dokumen: contoh rancangan menghasilkan sekitar 4 poin", () => {
    const h = hitungKertas(BAWAAN_KERTAS.dokumen);
    expect(h.galat).toBeNull();
    expect(h.menit).toBe(25);
    expect(h.skor).toBe(4.17);
    expect(h.skorUsul).toBe(4);
    expect(h.rincian.map((r) => r.label)).toContain("Pertanyaan diperiksa");
  });
  it("pertanyaan per sel isian memakai kolom yang sama (jumlah pertanyaan terisi)", () => {
    const h = hitungKertas({ jenis: "dokumen", halaman: 10, persenIsi: 100, pertanyaan: 30, detik: 6, tambahan: 0 });
    expect(h.menit).toBe(30);
  });
  it("keuangan, register, peta, susun, dan tetap dapat dihitung", () => {
    for (const k of Object.values(BAWAAN_KERTAS)) {
      const h = hitungKertas(k);
      expect(h.galat).toBeNull();
      expect(h.menit).toBeGreaterThan(0);
      expect(h.skor).toBeGreaterThan(0);
    }
    expect(hitungKertas({ jenis: "tetap", durasi: 120, persiapan: 30, perjalanan: 0 }).menit).toBe(150);
    expect(hitungKertas({ jenis: "susun", halaman: 10, menitHalaman: 30, revisi: 1, tambahan: 0 }).menit).toBe(600);
  });
  it("menolak angka negatif, persen di atas 100, dan pembagi nol", () => {
    expect(hitungKertas({ ...BAWAAN_KERTAS.dokumen, halaman: -1 } as KertasKerja).galat).toContain("angka 0");
    expect(hitungKertas({ ...BAWAAN_KERTAS.dokumen, persenIsi: 120 } as KertasKerja).galat).toContain("100");
    expect(hitungKertas({ ...BAWAAN_KERTAS.dokumen, halaman: 0 } as KertasKerja).galat).toContain("lebih dari 0");
    expect(hitungKertas({ ...BAWAAN_KERTAS.keuangan, baris: 0 } as KertasKerja).galat).toContain("lebih dari 0");
    expect(hitungKertas({ jenis: "tetap", durasi: 0, persiapan: 0, perjalanan: 0 }).galat).toContain("durasi");
    expect(hitungKertas({ ...BAWAAN_KERTAS.dokumen, detik: Number.NaN } as KertasKerja).galat).not.toBeNull();
  });
  it("pembulatan skor usulan", () => {
    expect(bulatkanSkor(0.04)).toBe(0.1);
    expect(bulatkanSkor(0.76)).toBe(0.8);
    expect(bulatkanSkor(3.89)).toBe(4);
    expect(bulatkanSkor(9.3)).toBe(9.5);
    expect(bulatkanSkor(27.4)).toBe(27);
    expect(bulatkanSkor(0)).toBe(0);
  });
  it("bacaKertas melengkapi angka yang hilang dan menolak bentuk asing", () => {
    expect(bacaKertas(null)).toBeNull();
    expect(bacaKertas({ jenis: "x" })).toBeNull();
    const k = bacaKertas({ jenis: "dokumen", halaman: 30, detik: "lima" }) as KertasKerja;
    expect(k.jenis).toBe("dokumen");
    expect((k as { halaman: number }).halaman).toBe(30);
    expect((k as { detik: number }).detik).toBe(5);
  });
});

describe("kalibrasi", () => {
  it("menit per satuan hanya dari laporan yang memuat jam dan jumlah", () => {
    expect(menitPerSatuan([{ jumlah: 4, menit_nyata: 120 }, { jumlah: "2", menit_nyata: 60 }, { jumlah: 0, menit_nyata: 30 }, { jumlah: 3, menit_nyata: null }])).toEqual([30, 30]);
  });
  it("dalam batas 25% tidak menyimpang; di luar batas ditandai", () => {
    const a = kalibrasi(25, [29, 29, 29]);
    expect(a.rata).toBe(29);
    expect(a.selisih).toBe(0.16);
    expect(a.menyimpang).toBe(false);
    expect(kalibrasi(25, [40, 36]).menyimpang).toBe(true);
    expect(kalibrasi(25, [10]).menyimpang).toBe(true);
  });
  it("tanpa data nyata tidak menandai apa pun", () => {
    expect(kalibrasi(25, [])).toEqual({ n: 0, rata: null, selisih: null, menyimpang: false });
    expect(kalibrasi(0, [10]).menyimpang).toBe(false);
  });
});
