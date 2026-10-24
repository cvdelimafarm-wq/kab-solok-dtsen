import { describe, expect, it } from "vitest";
import { berkasUtuh, uraiRkks, urai_volume, type ItemPdf } from "../rkks";

// Fixture sintetis mengikuti tata letak RKKS asli: kolom kode x<78, nama struktur x=83, tanda "-" x=89.9, uraian x=101,
// volume x~290-300, harga rata kanan 415, jumlah rata kanan 520 (struktur) / 523 (rincian), flag x>=530. Y menurun ke bawah halaman.
const t = (str: string, x: number, y: number, hal = 1, w?: number): ItemPdf => ({ str, x, y, w: w ?? str.length * 4.4, hal });
const kananJumlah = (s: string, y: number, hal = 1, r = 520) => t(s, r - s.length * 4.4, y, hal);
const kananHarga = (s: string, y: number, hal = 1) => t(s, 415 - s.length * 4.4, y, hal);

function dokumen(opsi: { salahTotal?: boolean; alokasi?: string } = {}): ItemPdf[] {
  const a = opsi.alokasi ?? "1,600,000";
  return [
    // kepala halaman (harus diabaikan)
    t("RINCIAN KERTAS KERJA SATKER T.A. 2026", 191, 810), t("ALOKASI", 20, 756.6), t("Rp.", 120, 756.6), t(a, 142, 756.6),
    t("KODE", 38, 722), t("(1)", 45, 703), t("Halaman :", 496, 744), t("1", 550, 744),
    // program, kegiatan
    t("054.01.GG", 23, 689), t("Program Penyediaan dan Pelayanan Informasi Statistik", 83, 689), kananJumlah("1,600,000", 689),
    t("2906", 25, 676), t("Penyediaan Statistik Kesejahteraan Rakyat", 83, 676), kananJumlah("1,600,000", 676),
    // KRO dua baris volume
    t("2906.BMA", 25, 663), t("Data dan Informasi Publik[Base Line]", 83, 662), t("1.0 dokumen,", 289, 665.5), t("Peta, Data", 294, 657.4), kananJumlah("1,600,000", 663),
    t("Lokasi : KAB. S O L O K", 83, 648.5),
    // RO nama tiga baris, jumlah 5.5 di atas kode
    t("PUBLIKASI/LAPORAN STATISTIK", 83, 520.5 + 100), t("2906.BMA.005", 27, 612.5), t("KESEJAHTERAAN RAKYAT DAN", 83, 612.5), t("PEMBANGUNAN", 83, 604.4),
    t("1.0 dokumen", 289, 620.4), kananJumlah("1,600,000", 618),
    // komponen + sub
    t("052", 27, 594), t("PENGUMPULAN DATA", 83, 594), kananJumlah("1,600,000", 594), t("U", 533, 594.1),
    t("A", 29, 581), t("TANPA SUB KOMPONEN", 83, 581), kananJumlah("1,600,000", 581),
    // akun 1 dengan satu rincian
    t("524113", 32, 567), t("Belanja Perjalanan Dinas Dalam Kota", 83, 567), kananJumlah("1,000,000", 567, 1, 523), t("RM", 556.6, 567),
    t("(KPPN.090-Solok )", 83, 554),
    t("-", 89.9, 541), t("transport lokal", 101, 541), t("20.0 OK", 299, 541), kananHarga("50,000", 541), kananJumlah("1,000,000", 541, 1, 523),
    // akun 2 dengan rincian bertiga baris (uraian di atas dan di bawah tanda "-") dan satu rincian biasa
    t("521211", 32, 515), t("Belanja Bahan", 83, 515), kananJumlah("600,000", 515, 1, 523), t("RM", 556.6, 515),
    t("Perjalanan dinas dalam rangka pengawasan", 101, 495), t("-", 89.9, 487), t("kegiatan pencacahan lapangan", 101, 487), t("Kabupaten/Kota", 101, 479),
    t("1.0 OK", 299.6, 487), kananHarga("500,000", 487), kananJumlah("500,000", 487, 1, 523),
    t("-", 89.9, 460), t("ATK", 101, 460), t("1.0 PAKET", 292, 460), kananHarga("100,000", 460), kananJumlah("100,000", 460, 1, 523),
    // catatan kaki (harus diabaikan)
    t("Catatan :", 21, 150), t("1. U = Komponen Utama", 54, 150),
  ];
}

describe("urai_volume", () => {
  it("memisahkan angka dan satuan, merapikan alias", () => {
    expect(urai_volume("64.0 Segmn")).toEqual({ angka: 64, satuan: "SGMN" });
    expect(urai_volume("1.0 dokumen, Peta, Data")).toEqual({ angka: 1, satuan: "DOKUMEN, PETA, DATA" });
    expect(urai_volume("3.0 O-K")).toEqual({ angka: 3, satuan: "OK" });
    expect(urai_volume("tanpa angka")).toBeNull();
  });
});

describe("uraiRkks", () => {
  const h = uraiRkks(dokumen());
  it("membaca struktur, nama bertingkat, dan volume RO", () => {
    expect(h.baris).toHaveLength(3);
    const b = h.baris[0];
    expect(b.prog_kode).toBe("GG");
    expect(b.keg_kode).toBe("2906");
    expect(b.kro_kode).toBe("BMA");
    expect(b.ro_sub).toBe("005");
    expect(b.ro_nama).toBe("PUBLIKASI/LAPORAN STATISTIK KESEJAHTERAAN RAKYAT DAN PEMBANGUNAN");
    expect(b.ro_volume).toBe(1);
    expect(b.ro_satuan).toBe("DOKUMEN");
    expect(b.komp_kode).toBe("052");
    expect(b.sub_kode).toBe("A");
    expect(b.sub_nama).toBe("TANPA SUB KOMPONEN");
    expect(b.akun_kode).toBe("524113");
    expect(b.akun_nama).toBe("Belanja Perjalanan Dinas Dalam Kota");
    expect(b.sumber_dana).toBe("RM");
  });
  it("membaca rincian: uraian, volume, harga, jumlah; tanda '-' bukan bagian uraian", () => {
    expect(h.baris[0]).toMatchObject({ uraian: "transport lokal", volume: 20, satuan: "OK", harga_satuan: 50000, jumlah: 1000000 });
    expect(h.baris[1].uraian).toBe("Perjalanan dinas dalam rangka pengawasan kegiatan pencacahan lapangan Kabupaten/Kota");
    expect(h.baris[1]).toMatchObject({ akun_kode: "521211", volume: 1, satuan: "OK", harga_satuan: 500000, jumlah: 500000 });
    expect(h.baris[2]).toMatchObject({ uraian: "ATK", satuan: "PAKET", jumlah: 100000 });
  });
  it("kepala halaman dan catatan kaki diabaikan; alokasi dan total cocok", () => {
    expect(h.alokasi).toBe(1600000);
    expect(h.total).toBe(1600000);
    expect(h.tidakCocok).toEqual([]);
    expect(h.peringatan).toEqual([]);
    expect(berkasUtuh(h)).toBe(true);
  });
  it("melaporkan jumlah yang tidak cocok dengan alokasi", () => {
    const x = uraiRkks(dokumen({ alokasi: "1,700,000" }));
    expect(x.tidakCocok.some((k) => k.tingkat === "satker" && k.tertulis === 1700000 && k.dihitung === 1600000)).toBe(true);
    expect(berkasUtuh(x)).toBe(false);
  });
  it("melaporkan simpul yang jumlahnya tidak sama dengan jumlah anak", () => {
    const d = dokumen().map((i) => (i.str === "1,000,000" && i.y === 541 ? { ...i, str: "900,000" } : i));
    const x = uraiRkks(d);
    expect(x.tidakCocok.some((k) => k.tingkat === "akun" && k.kode === "524113" && k.tertulis === 1000000 && k.dihitung === 900000)).toBe(true);
  });
  it("berkas yang bukan RKKS menghasilkan peringatan, bukan galat", () => {
    const x = uraiRkks([t("Halo", 100, 500)]);
    expect(x.baris).toEqual([]);
    expect(x.peringatan[0]).toMatch(/RKKS/);
    expect(berkasUtuh(x)).toBe(false);
  });
  it("halaman berbeda tidak saling mencampur (jarak vertikal dihitung per halaman)", () => {
    // akun di dasar halaman 1, rincian di awal halaman 2
    const d: ItemPdf[] = [
      t("ALOKASI", 20, 756.6), t("142", 142, 756.6),
      t("054.01.GG", 23, 689), t("Program", 83, 689), kananJumlah("500,000", 689),
      t("2906", 25, 676), t("Kegiatan", 83, 676), kananJumlah("500,000", 676),
      t("2906.BMA", 25, 663), t("KRO", 83, 662), kananJumlah("500,000", 663),
      t("2906.BMA.005", 27, 633), t("Nama RO", 83, 633), t("1.0 dokumen", 289, 633), kananJumlah("500,000", 633),
      t("052", 27, 619), t("Komponen", 83, 619), kananJumlah("500,000", 619),
      t("A", 29, 606), t("Sub", 83, 606), kananJumlah("500,000", 606),
      t("521211", 32, 40), t("Belanja Bahan", 83, 40), kananJumlah("500,000", 40, 1, 523),
      t("-", 89.9, 600, 2), t("ATK kantor", 101, 600, 2), t("5.0 PAKET", 292, 600, 2), kananHarga("100,000", 600, 2), kananJumlah("500,000", 600, 2, 523),
    ];
    const x = uraiRkks(d);
    expect(x.baris).toHaveLength(1);
    expect(x.baris[0]).toMatchObject({ uraian: "ATK kantor", volume: 5, jumlah: 500000 });
    expect(x.tidakCocok).toEqual([]);
  });
});
