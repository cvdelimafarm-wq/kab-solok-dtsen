import { describe, expect, it } from "vitest";
import {
  MAKS_BYTE_DOKUMEN,
  adalahPdf,
  cocokCari,
  jalurDokumen,
  kelompokkanPerPml,
  labelUkuran,
  labelWilayah,
  namaUnduhan,
  tabelDokumenKegiatan,
  KEGIATAN_DOKUMEN_SPDT,
  periksaIsianDokumen,
  periksaUkuranDokumen,
  type DokumenPeriksaAdmin,
} from "@/lib/dokumenPeriksa";

const enc = (s: string) => new TextEncoder().encode(s);

const dok = (id: number, pml_id: number, pml_nama: string, at: string, judul = `Dok ${id}`): DokumenPeriksaAdmin => ({
  id, kegiatan_id: 2, pml_id, pml_nama, judul, keterangan: null, wilayah: null, tanggal_periksa: null, nama_asli: null, ukuran_byte: 1000, diunggah_at: at, diunggah_oleh: pml_nama,
});

describe("adalahPdf", () => {
  it("menerima PDF", () => expect(adalahPdf(enc("%PDF-1.7\n..."))).toBe(true));
  it("menerima PDF dengan sedikit byte di depan", () => expect(adalahPdf(enc("\n\n  %PDF-1.4"))).toBe(true));
  it("menolak gambar dan teks biasa", () => {
    expect(adalahPdf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe(false);
    expect(adalahPdf(enc("ini bukan pdf"))).toBe(false);
    expect(adalahPdf(new Uint8Array())).toBe(false);
  });
  it("tidak tertipu oleh nama: hanya isi yang dinilai", () => expect(adalahPdf(enc("MZ\u0090 file.pdf"))).toBe(false));
});

describe("periksaUkuranDokumen", () => {
  it("kosong ditolak", () => expect(periksaUkuranDokumen(0)).toMatch(/kosong/i));
  it("terlalu besar ditolak dengan pesan ukuran", () => expect(periksaUkuranDokumen(MAKS_BYTE_DOKUMEN + 1)).toMatch(/terlalu besar/));
  it("batas tepat diterima", () => expect(periksaUkuranDokumen(MAKS_BYTE_DOKUMEN)).toBeNull());
  it("label ukuran", () => {
    expect(labelUkuran(500)).toBe("500 B");
    expect(labelUkuran(2048)).toBe("2 KB");
    expect(labelUkuran(3 * 1024 * 1024 + 512 * 1024)).toBe("3,5 MB");
  });
});

describe("periksaIsianDokumen", () => {
  const sub = ["BUKIK SILEH|JORONG A", "BUKIK SILEH|JORONG B"];
  it("judul kosong memakai nama berkas tanpa .pdf", () => {
    const r = periksaIsianDokumen({}, sub, "Hasil_Periksa_SLS_01.pdf");
    expect(r.ok && r.isi.judul).toBe("Hasil Periksa SLS 01");
  });
  it("judul kosong tanpa nama berkas ditolak", () => expect(periksaIsianDokumen({ judul: "  " }, sub, null).ok).toBe(false));
  it("merapikan spasi dan karakter kontrol, memotong panjang", () => {
    const r = periksaIsianDokumen({ judul: "  Hasil \n\t periksa  " + "x".repeat(300), keterangan: "  catatan  " }, sub, null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.isi.judul.startsWith("Hasil periksa x")).toBe(true);
      expect(r.isi.judul.length).toBe(120);
      expect(r.isi.keterangan).toBe("catatan");
    }
  });
  it("Jorong harus dari KK milik PML", () => {
    expect(periksaIsianDokumen({ judul: "a", wilayah: "LAIN|JORONG Z" }, sub, null)).toEqual({ ok: false, pesan: "Jorong yang dipilih bukan wilayah tugas Anda." });
    const r = periksaIsianDokumen({ judul: "a", wilayah: "BUKIK SILEH|JORONG B" }, sub, null);
    expect(r.ok && r.isi.wilayah).toBe("BUKIK SILEH|JORONG B");
  });
  it("tanggal harus sah", () => {
    expect(periksaIsianDokumen({ judul: "a", tanggal_periksa: "2026-02-30" }, sub, null).ok).toBe(false);
    expect(periksaIsianDokumen({ judul: "a", tanggal_periksa: "29/10/2026" }, sub, null).ok).toBe(false);
    const r = periksaIsianDokumen({ judul: "a", tanggal_periksa: "2026-10-29" }, sub, null);
    expect(r.ok && r.isi.tanggal_periksa).toBe("2026-10-29");
  });
  it("kolom opsional kosong menjadi null", () => {
    const r = periksaIsianDokumen({ judul: "a", keterangan: "", wilayah: "", tanggal_periksa: "" }, sub, null);
    expect(r.ok && r.isi).toEqual({ judul: "a", keterangan: null, wilayah: null, tanggal_periksa: null });
  });
});

describe("labelWilayah", () => {
  it("memberi judul huruf: jorong dulu, lalu nagari", () => expect(labelWilayah("BUKIK SILEH|KAYU ARO")).toBe("Kayu Aro · Bukik Sileh"));
  it("kosong atau bentuk tak dikenal tidak error", () => {
    expect(labelWilayah(null)).toBe("");
    expect(labelWilayah("tanpa-pemisah")).toBe("tanpa-pemisah");
  });
});

describe("jalur dan nama unduhan", () => {
  it("jalur memakai 24 hex pertama", () => expect(jalurDokumen(2, 96, "a".repeat(64))).toBe(`pemeriksaan/2/96/${"a".repeat(24)}.pdf`));
  it("nama unduhan aman dan tanpa karakter terlarang", () => {
    expect(namaUnduhan("Mega S.", 'Hasil: SLS 01/02 "final"')).toBe("Mega S. - Hasil SLS 01 02 final.pdf");
    expect(namaUnduhan("", "")).toBe("dokumen pemeriksaan.pdf");
  });
});

describe("kelompokkanPerPml dan cocokCari", () => {
  const daftar = [
    dok(1, 10, "Mega", "2026-10-28T03:00:00Z"),
    dok(2, 20, "Widya", "2026-10-29T03:00:00Z"),
    dok(3, 10, "Mega", "2026-10-29T05:00:00Z"),
  ];
  it("PML dengan unggahan terbaru di atas, dokumen terbaru di atas", () => {
    const k = kelompokkanPerPml(daftar);
    expect(k.map((x) => x.pml_nama)).toEqual(["Mega", "Widya"]);
    expect(k[0].dokumen.map((x) => x.id)).toEqual([3, 1]);
  });
  it("pencarian tidak membedakan huruf besar dan mencari di nama PML", () => {
    expect(cocokCari(daftar[0], "MEGA")).toBe(true);
    expect(cocokCari(daftar[0], "widya")).toBe(false);
    expect(cocokCari(daftar[0], "")).toBe(true);
  });
  it("pencarian juga mencari di jorong dan nagari", () => {
    const d = { ...daftar[0], wilayah: "BUKIK SILEH|KAYU ARO" };
    expect(cocokCari(d, "kayu aro")).toBe(true);
    expect(cocokCari(d, "bukik")).toBe(true);
    expect(cocokCari(d, "tidak ada")).toBe(false);
  });
});

describe("tabelDokumenKegiatan (kartu dokumen di tab QC)", () => {
  it("SPDT NTP punya tabel dokumen; kegiatan lain belum (kartu tersembunyi)", () => {
    expect(tabelDokumenKegiatan(KEGIATAN_DOKUMEN_SPDT)).toBe("sigap_spdt_dokumen");
    for (const k of [1, 3, 4, 99]) expect(tabelDokumenKegiatan(k)).toBeNull();
  });
});
