import { describe, expect, it } from "vitest";
import {
  aksiDokTersedia, aksiUntukHak, alasanSah, alasanTanpaAksi, bagianSaya, dapatDitandaiDraf, daftarPihak, jenisKelengkapan, kelompokKomponen, kunciPihak, labelKomponen, lokasiBerkas,
  MAKS_BYTE_BERKAS, namaBerkasAman, opsiLembar, periksaBerkas, ringkasDok, saringItem, susunDokumen, teksRingkasDok, tipeIsi, ukuranTeks, type BarisDok, type DokTampil, type HakDok, type ItemAdm,
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

// ---------------------------------------------------------------- tata letak papan 13
const I = (o: Partial<ItemAdm> & { detail_id: number }): ItemAdm => ({
  akun_kode: "521211", komponen_kode: "052", nomor_item: null, uraian: "Honor", jumlah: 1000, sumber: "skema", lembar_kode: "521211", seksi_huruf: "A", asal: "otomatis",
  n_dok: 4, n_belum: 4, n_terverifikasi: 0, status_item: "belum", ...o,
});
const D = (o: Partial<DokTampil> & { dokId: number }): DokTampil => ({ no: "1", uraian: "x", pihak: ["Tim Kerja"], ket: "", gen: false, admId: null, status: "belum", berkas: null, ukuran: null, diunggahAt: null, diverifikasiAt: null, catatan: "", ...o });

describe("daftar item", () => {
  const items = [
    I({ detail_id: 1, komponen_kode: "052", akun_kode: "521213", status_item: "lengkap", n_terverifikasi: 4, n_belum: 0 }),
    I({ detail_id: 2, komponen_kode: "051", akun_kode: "521211", status_item: "berjalan", n_terverifikasi: 1, n_belum: 2 }),
    I({ detail_id: 3, komponen_kode: "052", akun_kode: "521211", sumber: "pola", lembar_kode: "BRG", seksi_huruf: "", status_item: "belum" }),
    I({ detail_id: 4, komponen_kode: "999", akun_kode: "511111", n_dok: 0, n_belum: 0, status_item: "tanpa_dokumen", lembar_kode: null }),
  ];
  it("label komponen memakai nama lazim atau 'Komponen <kode>'", () => {
    expect(labelKomponen("051")).toBe("051 Persiapan");
    expect(labelKomponen("004")).toBe("Komponen 004");
  });
  it("filter Semua, Belum lengkap, Pola umum, dan menurut status", () => {
    expect(saringItem(items, "")).toHaveLength(4);
    expect(saringItem(items, "belum_lengkap").map((i) => i.detail_id)).toEqual([2, 3]);
    expect(saringItem(items, "pola").map((i) => i.detail_id)).toEqual([3]);
    expect(saringItem(items, "lengkap").map((i) => i.detail_id)).toEqual([1]);
    expect(saringItem(items, "tanpa_dokumen").map((i) => i.detail_id)).toEqual([4]);
  });
  it("kelompok per komponen berurutan, isi urut akun", () => {
    const g = kelompokKomponen(items);
    expect(g.map((x) => x.komponen)).toEqual(["051", "052", "999"]);
    expect(g[1].item.map((i) => i.detail_id)).toEqual([3, 1]);
    expect(g[0].label).toBe("051 Persiapan");
  });
  it("jenis kelengkapan pada kartu item", () => {
    expect(jenisKelengkapan(items[2])).toBe("Pola umum BRG · 4 dokumen");
    expect(jenisKelengkapan(items[1])).toBe("521211-A · 4 dokumen");
    expect(jenisKelengkapan(items[3])).toBe("tanpa dokumen");
  });
});

describe("hak dokumen", () => {
  const hak = new Map<string, HakDok>([
    ["Tim Kerja", { unggah: true, verif: false }], ["PPK|Tim Kerja", { unggah: true, verif: true }], ["Bendahara", { unggah: false, verif: false }],
  ]);
  it("kunci pihak tidak bergantung urutan", () => expect(kunciPihak(["Tim Kerja", "PPK"])).toBe(kunciPihak(["PPK", "Tim Kerja"])));
  it("aksi menurut hak: tanpa hak tidak ada tombol", () => {
    expect(aksiUntukHak("belum", true, undefined)).toEqual([]);
    expect(aksiUntukHak("belum", true, { unggah: true, verif: false })).toEqual(["draf", "unggah"]);
    expect(aksiUntukHak("terunggah", false, { unggah: true, verif: false })).toEqual(["unggah"]);
    expect(aksiUntukHak("terunggah", false, { unggah: false, verif: true })).toEqual(["verifikasi", "kembalikan"]);
    expect(aksiUntukHak("belum", true, { unggah: false, verif: false })).toEqual([]);
  });
  it("alasan tanpa aksi", () => {
    expect(alasanTanpaAksi("belum", undefined)).toMatch(/Memeriksa/);
    expect(alasanTanpaAksi("belum", { unggah: false, verif: false })).toBe("Bukan bagian Anda");
    expect(alasanTanpaAksi("terverifikasi", { unggah: true, verif: false })).toBe("Selesai");
    expect(alasanTanpaAksi("terunggah", { unggah: true, verif: false })).toMatch(/Menunggu verifikasi/);
  });
  it("bagian saya dan yang dapat ditandai draf", () => {
    const docs = [
      D({ dokId: 1, pihak: ["Tim Kerja"], gen: true }), D({ dokId: 2, pihak: ["Bendahara"], gen: true }),
      D({ dokId: 3, pihak: ["Tim Kerja", "PPK"], gen: true, status: "draf" }), D({ dokId: 4, pihak: ["PPK", "Tim Kerja"], gen: false }),
    ];
    expect(bagianSaya(docs, hak).map((d) => d.dokId)).toEqual([1, 3, 4]);
    expect(dapatDitandaiDraf(docs, hak).map((d) => d.dokId)).toEqual([1]);
  });
  it("ringkasan dokumen", () => {
    const r = ringkasDok([D({ dokId: 1, status: "terverifikasi" }), D({ dokId: 2, status: "terunggah" }), D({ dokId: 3, status: "draf" }), D({ dokId: 4 })]);
    expect(r).toEqual({ n: 4, terverifikasi: 1, menunggu: 2, belum: 1 });
    expect(teksRingkasDok(r)).toBe("Terverifikasi 1, menunggu verifikasi 2, belum ada 1 dari 4 dokumen.");
  });
});

describe("opsi lembar", () => {
  it("satu opsi per lembar, pola dahulu, seksi urut menurut master", () => {
    const o = opsiLembar([
      { sumber: "skema", kode: "521211", seksi_huruf: "B", seksi_judul: "Pelaksanaan", seksi_urut: 2 },
      { sumber: "skema", kode: "521211", seksi_huruf: "A", seksi_judul: "Persiapan", seksi_urut: 1 },
      { sumber: "skema", kode: "521211", seksi_huruf: "A", seksi_judul: "Persiapan", seksi_urut: 1 },
      { sumber: "pola", kode: "BRG", seksi_huruf: "", seksi_judul: "Barang", seksi_urut: 1 },
    ]);
    expect(o.map((x) => x.nama)).toEqual(["Pola umum BRG", "521211"]);
    expect(o[1].seksi.map((s) => s.huruf)).toEqual(["A", "B"]);
  });
});
