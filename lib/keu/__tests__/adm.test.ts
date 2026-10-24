import { describe, expect, it } from "vitest";
import {
  aksiDokTersedia, alasanSah, daftarPihak, lokasiBerkas, MAKS_BYTE_BERKAS, namaBerkasAman, periksaBerkas, susunDokumen, tipeIsi, ukuranTeks, type BarisDok,
} from "../adm";

const B = (o: Partial<BarisDok> & { dok_id: number }): BarisDok => ({
  detail_id: 1, seksi_urut: 1, seksi_judul: "Persiapan", seksi_huruf: "A", no: 1, uraian_dok: `Dok ${o.dok_id}`, pihak: ["Tim Kerja"], ket: null, gen: false,
  adm_id: null, status: null, berkas_nama: null, berkas_ukuran: null, diunggah_at: null, diverifikasi_at: null, catatan: null, ...o,
});

describe("daftarPihak", () => {
  it("menerima larik, teks larik Postgres, dan nilai kosong", () => {
    expect(daftarPihak(["PPK", " Bendahara "])).toEqual(["PPK", "Bendahara"]);
    expect(daftarPihak('{"Tim Kerja",PPK}')).toEqual(["Tim Kerja", "PPK"]);
    expect(daftarPihak(null)).toEqual([]);
    expect(daftarPihak("{}")).toEqual([]);
  });
});

describe("susunDokumen", () => {
  it("mengelompokkan per seksi, mengurutkan seksi lalu nomor, status tak dikenal menjadi belum", () => {
    const s = susunDokumen([
      B({ dok_id: 5, seksi_urut: 2, seksi_judul: "Pelaksanaan", seksi_huruf: "B", no: 1 }),
      B({ dok_id: 3, no: 2, status: "terunggah", berkas_nama: "a.pdf", berkas_ukuran: "2048", adm_id: "9" }),
      B({ dok_id: 2, no: 1, status: "aneh", gen: true }),
    ]);
    expect(s.map((x) => x.huruf)).toEqual(["A", "B"]);
    expect(s[0].dok.map((d) => d.dokId)).toEqual([2, 3]);
    expect(s[0].dok[0].status).toBe("belum");
    expect(s[0].dok[0].gen).toBe(true);
    expect(s[0].dok[1]).toMatchObject({ status: "terunggah", berkas: "a.pdf", ukuran: 2048, admId: 9 });
    expect(s[1].dok).toHaveLength(1);
  });
  it("larik kosong menghasilkan larik kosong", () => expect(susunDokumen([])).toEqual([]));
});

describe("aksiDokTersedia", () => {
  it("menurut status dan kemampuan dibuat SIGAP", () => {
    expect(aksiDokTersedia("belum", true)).toEqual(["draf", "unggah"]);
    expect(aksiDokTersedia("belum", false)).toEqual(["unggah"]);
    expect(aksiDokTersedia("draf", true)).toEqual(["unggah"]);
    expect(aksiDokTersedia("terunggah", false)).toEqual(["verifikasi", "unggah", "kembalikan"]);
    expect(aksiDokTersedia("terverifikasi", true)).toEqual(["kembalikan"]);
  });
});

describe("alasan dan berkas", () => {
  it("alasan minimal 5 huruf setelah dipangkas", () => {
    expect(alasanSah("   abc ")).toBe(false);
    expect(alasanSah("salah")).toBe(true);
  });
  it("periksaBerkas", () => {
    expect(periksaBerkas("nota.pdf", 1000)).toBeNull();
    expect(periksaBerkas("FOTO.JPG", 1000)).toBeNull();
    expect(periksaBerkas("a.exe", 1000)).toMatch(/tidak didukung/);
    expect(periksaBerkas("tanpaekstensi", 1000)).toMatch(/tidak didukung/);
    expect(periksaBerkas("a.pdf", 0)).toBe("Berkas kosong.");
    expect(periksaBerkas("a.pdf", MAKS_BYTE_BERKAS + 1)).toMatch(/terlalu besar/);
    expect(periksaBerkas("ab", 10)).toBe("Nama berkas tidak sah.");
  });
  it("namaBerkasAman membuang karakter berbahaya dan mempertahankan ekstensi", () => {
    expect(namaBerkasAman("Nota Belanja (1) é.PDF")).toBe("Nota_Belanja_1_e.pdf");
    expect(namaBerkasAman("../../etc/passwd.pdf")).toBe("etc_passwd.pdf");
    expect(namaBerkasAman(".pdf")).toBe("berkas.pdf");
    expect(namaBerkasAman("a".repeat(200) + ".pdf").length).toBeLessThanOrEqual(80);
    expect(namaBerkasAman("a".repeat(200) + ".pdf").endsWith(".pdf")).toBe(true);
  });
  it("lokasiBerkas memuat hash dan tidak memuat garis miring dari nama", () => {
    const l = lokasiBerkas(2026, "2906.BMA.005", 12, 7, "abcdef0123456789".repeat(4), "x/y z.pdf");
    expect(l).toBe("keu-adm/2026/2906.BMA.005/12/7-abcdef01-x_y_z.pdf");
  });
  it("tipeIsi dan ukuranTeks", () => {
    expect(tipeIsi("a.PDF")).toBe("application/pdf");
    expect(tipeIsi("a.zip")).toBe("application/octet-stream");
    expect(ukuranTeks(null)).toBe("");
    expect(ukuranTeks(500)).toBe("1 KB");
    expect(ukuranTeks(2048)).toBe("2 KB");
    expect(ukuranTeks(3 * 1048576)).toBe("3,0 MB");
  });
});
