import { describe, expect, it } from "vitest";
import {
  KET_FOTO_AWAL, MAKS_FOTO_LAPORAN, MAKS_UKURAN_HALAMAN, STATUS_FOTO_AWAL, UKURAN_HALAMAN, bacaFilterFoto, bacaFotoItem, bacaHasilDaftarFoto, bacaStatusFoto, fotoUntukLaporan, keteranganFoto,
  kunciStatusFoto, paramFilterFoto, peranBasisData, rentangIndeks, tanggalSah, tanggalSingkat, ubahPilihan, ukuranMuat, urutkanFoto, type FotoItem,
} from "../laporanFoto";

const foto = (id: number, o: Partial<FotoItem> = {}): FotoItem => ({ id, slot: 1, peran: "ppl", nama: "Ayu", tanggal: "2026-10-21", diambil: null, lokasi: null, kamera: false, ...o });
const sp = (s: string) => new URLSearchParams(s);

describe("bacaFilterFoto (parameter alamat tak tepercaya)", () => {
  it("bawaan: semua peran, semua nomor, halaman 1", () => {
    expect(bacaFilterFoto(sp(""))).toEqual({ peran: [], slot: [], dari: "", sampai: "", cari: "", halaman: 1, ukuran: UKURAN_HALAMAN });
  });
  it("nilai asing dibuang, duplikat dibersihkan, nomor diurutkan", () => {
    const f = bacaFilterFoto(sp("peran=ppl,xx,ppl,supervisi&slot=5,2,9,0,2,a"));
    expect(f.peran).toEqual(["ppl", "supervisi"]);
    expect(f.slot).toEqual([2, 5]);
  });
  it("tanggal tidak sah diabaikan (termasuk 30 Februari)", () => {
    expect(bacaFilterFoto(sp("dari=2026-02-30&sampai=2026-10-31"))).toMatchObject({ dari: "", sampai: "2026-10-31" });
    expect(tanggalSah("2026-10-30")).toBe(true);
    expect(tanggalSah("30-10-2026")).toBe(false);
  });
  it("halaman dan ukuran dibatasi", () => {
    expect(bacaFilterFoto(sp("halaman=-4&ukuran=100000"))).toMatchObject({ halaman: 1, ukuran: MAKS_UKURAN_HALAMAN });
    expect(bacaFilterFoto(sp("halaman=abc&ukuran=abc"))).toMatchObject({ halaman: 1, ukuran: UKURAN_HALAMAN });
    expect(bacaFilterFoto(sp("halaman=999999")).halaman).toBe(10000);
  });
  it("pencarian nama: karakter khusus penyaring dibuang dan panjang dibatasi", () => {
    expect(bacaFilterFoto(sp("cari=" + encodeURIComponent("Ayu),id.eq.1,(x"))).cari).toBe("Ayuid.eq.1x");
    expect(bacaFilterFoto(sp("cari=" + "a".repeat(200))).cari.length).toBe(60);
    expect(bacaFilterFoto(sp("cari=" + encodeURIComponent("  Dra. D'Arc-Ali  "))).cari).toBe("Dra. D'Arc-Ali");
  });
  it("paramFilterFoto adalah kebalikan bacaFilterFoto", () => {
    const f = bacaFilterFoto(sp("peran=pml,ppl&slot=3&dari=2026-10-01&sampai=2026-10-30&cari=Ayu&halaman=3&ukuran=24"));
    expect(bacaFilterFoto(sp(paramFilterFoto(f)))).toEqual(f);
    expect(paramFilterFoto({})).toBe("");
  });
  it("peranBasisData: Korwil / Supervisor mencakup dua peran; kosong = semua", () => {
    expect(peranBasisData(["supervisi"])).toEqual(["korwil", "supervisor"]);
    expect(peranBasisData(["ppl", "pml"]).sort()).toEqual(["pml", "ppl"]);
    expect(peranBasisData([])).toEqual([]);
  });
});

describe("bacaFotoItem / bacaHasilDaftarFoto", () => {
  it("menolak bentuk rusak, memangkas teks panjang", () => {
    expect(bacaFotoItem(null)).toBeNull();
    expect(bacaFotoItem({ id: 0, slot: 1 })).toBeNull();
    expect(bacaFotoItem({ id: 5, slot: 0 })).toBeNull();
    expect(bacaFotoItem({ id: "7", slot: "2", nama: "x".repeat(500), kamera: "ya" })).toMatchObject({ id: 7, slot: 2, kamera: false });
    expect(bacaFotoItem({ id: 7, slot: 2, nama: "x".repeat(500) })!.nama.length).toBe(120);
  });
  it("hasil daftar: butir rusak dibuang, angka dinormalkan", () => {
    const h = bacaHasilDaftarFoto({ total: "12", halaman: 0, ukuran: -1, foto: [{ id: 1, slot: 1 }, "x", { id: 2 }] });
    expect(h).toMatchObject({ total: 12, halaman: 1, ukuran: 1 });
    expect(h.foto.map((f) => f.id)).toEqual([1]);
    expect(bacaHasilDaftarFoto(undefined)).toEqual({ total: 0, halaman: 1, ukuran: UKURAN_HALAMAN, foto: [] });
  });
});

describe("ubahPilihan dan rentangIndeks", () => {
  it("menambah tanpa ganda, mempertahankan urutan, membuang", () => {
    const a = ubahPilihan([], [foto(1), foto(2), foto(1)], true);
    expect(a.pilihan.map((f) => f.id)).toEqual([1, 2]);
    const b = ubahPilihan(a.pilihan, [foto(3), foto(2)], true);
    expect(b.pilihan.map((f) => f.id)).toEqual([1, 2, 3]);
    expect(ubahPilihan(b.pilihan, [foto(2), foto(99)], false).pilihan.map((f) => f.id)).toEqual([1, 3]);
  });
  it("dibatasi MAKS_FOTO_LAPORAN dan melaporkan yang terpotong", () => {
    const banyak = Array.from({ length: MAKS_FOTO_LAPORAN + 7 }, (_, i) => foto(i + 1));
    const h = ubahPilihan([], banyak, true);
    expect(h.pilihan.length).toBe(MAKS_FOTO_LAPORAN);
    expect(h.terpotong).toBe(7);
    expect(ubahPilihan(h.pilihan, [foto(1000)], true)).toMatchObject({ terpotong: 1 });
  });
  it("tidak mengubah daftar asal", () => {
    const asal = [foto(1)];
    ubahPilihan(asal, [foto(2)], true);
    expect(asal.length).toBe(1);
  });
  it("rentang kedua arah, di luar batas kosong", () => {
    expect(rentangIndeks(10, 2, 5)).toEqual([2, 3, 4, 5]);
    expect(rentangIndeks(10, 5, 2)).toEqual([2, 3, 4, 5]);
    expect(rentangIndeks(10, 3, 3)).toEqual([3]);
    expect(rentangIndeks(10, -1, 3)).toEqual([]);
    expect(rentangIndeks(10, 3, 10)).toEqual([]);
  });
});

describe("keterangan, urutan, ukuran", () => {
  it("keterangan lengkap dan sebagian", () => {
    const f = foto(1, { slot: 2, nama: "Ayu Sepriani", peran: "pml", tanggal: "2026-10-21", lokasi: "Jorong A" });
    expect(keteranganFoto(f, KET_FOTO_AWAL)).toBe("Foto 2 · Ayu Sepriani (PML) · 21 Okt 2026");
    expect(keteranganFoto(f, { ...KET_FOTO_AWAL, lokasi: true })).toBe("Foto 2 · Ayu Sepriani (PML) · 21 Okt 2026 · Jorong A");
    expect(keteranganFoto(f, { nomor: false, nama: false, peran: true, tanggal: false, lokasi: false })).toBe("PML");
    expect(keteranganFoto(f, { nomor: false, nama: true, peran: false, tanggal: false, lokasi: false })).toBe("Ayu Sepriani");
    expect(keteranganFoto(f, { nomor: false, nama: false, peran: false, tanggal: false, lokasi: false })).toBe("");
    expect(keteranganFoto(foto(1, { lokasi: null }), { ...KET_FOTO_AWAL, lokasi: true })).not.toContain("null");
  });
  it("peran korwil / supervisor berlabel jelas", () => {
    expect(keteranganFoto(foto(1, { peran: "korwil" }), KET_FOTO_AWAL)).toContain("(Korwil)");
    expect(keteranganFoto(foto(1, { peran: "supervisor" }), KET_FOTO_AWAL)).toContain("(Supervisor)");
  });
  it("tanggalSingkat", () => {
    expect(tanggalSingkat("2026-01-05")).toBe("5 Jan 2026");
    expect(tanggalSingkat("bukan")).toBe("bukan");
  });
  it("urutan: pilih (asal), tanggal, petugas; tidak mengubah asal", () => {
    const l = [foto(1, { nama: "Budi", tanggal: "2026-10-22", slot: 2 }), foto(2, { nama: "Ayu", tanggal: "2026-10-22", slot: 1 }), foto(3, { nama: "Budi", tanggal: "2026-10-20", slot: 3 })];
    expect(urutkanFoto(l, "pilih").map((f) => f.id)).toEqual([1, 2, 3]);
    expect(urutkanFoto(l, "tanggal").map((f) => f.id)).toEqual([3, 2, 1]);
    expect(urutkanFoto(l, "petugas").map((f) => f.id)).toEqual([2, 3, 1]);
    expect(l.map((f) => f.id)).toEqual([1, 2, 3]);
  });
  it("ukuranMuat menjaga perbandingan dan muat dalam kotak", () => {
    expect(ukuranMuat(1000, 500, 400, 400)).toEqual({ cx: 400, cy: 200 });
    expect(ukuranMuat(500, 1000, 400, 400)).toEqual({ cx: 200, cy: 400 });
    expect(ukuranMuat(0, 0, 400, 400)).toEqual({ cx: 400, cy: 300 });
  });
});

describe("status tersimpan di peramban", () => {
  it("rusak -> bawaan; kunci berbeda untuk tiap kegiatan", () => {
    expect(bacaStatusFoto(null)).toEqual(STATUS_FOTO_AWAL);
    expect(bacaStatusFoto("x")).toEqual(STATUS_FOTO_AWAL);
    expect(kunciStatusFoto(1)).not.toBe(kunciStatusFoto(2));
  });
  it("membuang foto ganda / rusak, membatasi jumlah, mempertahankan opsi sah", () => {
    const banyak = Array.from({ length: MAKS_FOTO_LAPORAN + 10 }, (_, i) => foto(i + 1));
    const st = bacaStatusFoto({ pilihan: [...banyak, foto(1), { id: -1 }], opsi: { perBaris: 3, ket: { nomor: false, lokasi: true, nama: "ya" } }, urut: "tanggal" });
    expect(st.pilihan.length).toBe(MAKS_FOTO_LAPORAN);
    expect(st.opsi.perBaris).toBe(3);
    expect(st.opsi.ket).toEqual({ ...KET_FOTO_AWAL, nomor: false, lokasi: true });
    expect(st.urut).toBe("tanggal");
    expect(bacaStatusFoto({ opsi: { perBaris: 7 }, urut: "acak" })).toMatchObject({ opsi: { perBaris: 2 }, urut: "pilih" });
  });
  it("fotoUntukLaporan: urut dan keterangan", () => {
    const st = bacaStatusFoto({ pilihan: [foto(1, { tanggal: "2026-10-22", nama: "Budi" }), foto(2, { tanggal: "2026-10-20", nama: "Ayu" })], urut: "tanggal", opsi: { perBaris: 3 } });
    const h = fotoUntukLaporan(st);
    expect(h.perBaris).toBe(3);
    expect(h.daftar.map((f) => f.id)).toEqual([2, 1]);
    expect(h.daftar[0].ket).toContain("Ayu");
  });
});
