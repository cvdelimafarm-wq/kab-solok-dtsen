import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { OPSI_AWAL, htmlLaporan, kelompokkanElemen, type OpsiLaporan } from "../laporanSementara";
import { adalahLaporanUmum, bacaDataLaporanUmum, bangunBagianUmum, susunLaporanUmum, tabelCapaianPetugas, temuanUmum } from "../laporanUmum";
import { bangunBerkasDocx, buatDocx } from "../laporanDocx";

/** Bentuk keluaran sigap_laporan_umum(2) pada 30 Okt 2026 (diringkas). */
const mentah = {
  dibuat_at: "2026-10-30T12:29:09.113448+00:00",
  kegiatan: { id: 2, nama: "SPDT NTP 2026", jenis: "pendataan", tanggal_mulai: "2026-10-12", tanggal_selesai: "2026-11-12", satuan_realisasi: "ruta" },
  petugas: { pml: 15, ppl: 44 },
  surat_tugas: { n: 59, penugasan_ber_st: 59 },
  sasaran: {
    kk: 811, kecamatan: 14, nagari: 71, jorong: 316, dibuka: 412, pembuka: 48, ppl: 40, pml: 15,
    per_kecamatan: [
      { kk: 158, pml: 3, ppl: 7, dibuka: 63, nagari: 4, kecamatan: "LEMBAH GUMANTI" },
      { kk: 85, pml: 2, ppl: 5, dibuka: 36, nagari: 8, kecamatan: "X KOTO SINGKARAK" },
      { kk: 20, pml: 1, ppl: 1, dibuka: 0, nagari: 7, kecamatan: "IX KOTO SUNGAI LASI" },
      { kk: 10, pml: 1, ppl: 1, dibuka: 0, nagari: 2, kecamatan: "PAYUNG SEKAKI" },
    ],
    harian: [{ tgl: "2026-10-16", n: 107 }, { tgl: "2026-10-17", n: 85 }, { tgl: "2026-10-18", n: 74 }],
  },
  realisasi: {
    satuan: "ruta", total: 315, baris: 115, hari: 15, petugas: 49,
    harian: [{ tgl: "2026-10-16", n: 10, petugas: 6 }, { tgl: "2026-10-17", n: 42, petugas: 16 }, { tgl: "2026-10-18", n: 30, petugas: 8 }],
  },
  dokumentasi: { foto: 602, petugas: 48, per_slot: [{ slot: 1, n: 122 }, { slot: 2, n: 121 }, { slot: 3, n: 120 }, { slot: 4, n: 120 }, { slot: 5, n: 119 }], per_peran: [{ peran: "pml", n: 105 }, { peran: "ppl", n: 497 }] },
  qc: { percobaan: 142, petugas: 55, rata_pertama: 75.5, harian: [{ tgl: "2026-10-29", rata: 74.5, peserta: 55, percobaan: 139 }, { tgl: "2026-10-30", rata: 93.3, peserta: 3, percobaan: 3 }] },
  dokumen_pml: { n: 3, pml: 2, per_pml: [{ n: 2, nama: "RAHIYATUL ULFA" }, { n: 1, nama: "Ayu Sepriani" }] },
  petugas_nilai: [
    { akun_id: 64, nama: "APRILA INSAN SUCI", peran: "pml", hari_kerja: 2, realisasi: 5, foto: 10, dibuka: 0, qc_rata: 93.0, qc_percobaan: 2 },
    { akun_id: 70, nama: "Budi", peran: "ppl", hari_kerja: 3, realisasi: 12, foto: 15, dibuka: 20, qc_rata: 80.5, qc_percobaan: 3 },
    { akun_id: 71, nama: "Ardial", peran: "ppl", hari_kerja: 0, realisasi: 0, foto: 0, dibuka: 0, qc_rata: null, qc_percobaan: 0 },
    { akun_id: 72, nama: "Citra", peran: "ppl", hari_kerja: 2, realisasi: 7, foto: 0, dibuka: 5, qc_rata: 70, qc_percobaan: 1 },
  ],
};
const d = bacaDataLaporanUmum(mentah);
const opsi = (o: Partial<OpsiLaporan> = {}): OpsiLaporan => ({ ...OPSI_AWAL, ...o });

describe("bacaDataLaporanUmum", () => {
  it("membaca bentuk keluaran SQL", () => {
    expect(d.kegiatan).toMatchObject({ id: 2, nama: "SPDT NTP 2026", satuan: "ruta" });
    expect(d.sasaran).toMatchObject({ kk: 811, dibuka: 412 });
    expect(d.realisasi.total).toBe(315);
    expect(d.petugas_nilai[3].qc_rata).toBe(70);
    expect(d.petugas_nilai[2].qc_rata).toBeNull();
  });
  it("data kosong / rusak tidak melempar galat", () => {
    for (const x of [null, undefined, "x", 5, [], {}, { sasaran: "ya", realisasi: [1], petugas_nilai: "x", qc: { harian: [{ tgl: "bukan" }] } }]) {
      const k = bacaDataLaporanUmum(x);
      expect(k.sasaran.kk).toBe(0);
      expect(k.petugas_nilai).toEqual([]);
      expect(k.kegiatan).toBeNull();
    }
    expect(bacaDataLaporanUmum({ qc: { harian: [{ tgl: "bukan", percobaan: 1 }] } }).qc.harian).toEqual([]);
  });
  it("penanda ragam", () => {
    expect(adalahLaporanUmum({ ragam: "umum" })).toBe(true);
    expect(adalahLaporanUmum({ ragam: "psp" })).toBe(false);
    expect(adalahLaporanUmum(null)).toBe(false);
  });
});

describe("temuanUmum", () => {
  it("menghitung PPL tanpa realisasi, KK belum dibuka, kecamatan kosong, QC dan foto", () => {
    const t = temuanUmum(d).join("\n");
    expect(t).toContain("1 dari 3 PPL belum mencatat realisasi");
    expect(t).toContain("399 dari 811 keluarga sasaran (49,2 persen) belum dibuka");
    expect(t).toContain("Belum ada keluarga yang dibuka di IX Koto Sungai Lasi, Payung Sekaki");
    expect(t).toContain("1 dari 4 petugas lapangan belum pernah mengerjakan QC");
    expect(t).toContain("1 petugas sudah memilih hari kerja tetapi belum mengunggah foto");
  });
  it("tanpa data: tidak ada temuan", () => {
    expect(temuanUmum(bacaDataLaporanUmum({}))).toEqual([]);
  });
  it("periode lewat dicatat", () => {
    const x = bacaDataLaporanUmum({ ...mentah, dibuat_at: "2026-11-20T03:00:00+00:00" });
    expect(temuanUmum(x).join(" ")).toContain("Periode kegiatan (sampai 12 November 2026) sudah lewat");
  });
});

describe("susunan laporan umum", () => {
  const l = susunLaporanUmum(d, opsi());
  it("bab bawaan, bernomor, lampiran berhuruf, Lampiran B mati", () => {
    expect(l.bagian.map((b) => b.judulTampil)).toEqual([
      "Ringkasan eksekutif", "1. Penugasan petugas", "2. Wilayah dan sasaran", "3. Pelaksanaan di lapangan", "4. Dokumentasi dan QC Pemahaman",
      "5. Dokumen pemeriksaan PML", "6. Hal yang perlu perhatian", "Lampiran A. Capaian per petugas",
    ]);
    expect(l.semua.map((b) => b.kode)).toContain("lampiranFoto");
    expect(l.judul).toBe("Laporan Sementara Pelaksanaan SPDT NTP 2026");
  });
  it("kalimat ringkasan memuat angka dan rujukan bab terselesaikan", () => {
    const rg = l.bagian[0];
    const teks = kelompokkanElemen(rg.elemen).flatMap((b) => (b.jenis === "butir" ? b.butir : b.elemen.jenis === "paragraf" ? [b.elemen.teks] : []));
    const semua = teks.join("\n");
    expect(semua).toContain("15 PML dan 44 PPL bertugas; 59 surat tugas diterbitkan.");
    expect(semua).toContain("811 keluarga di 14 kecamatan dan 71 nagari; 412 keluarga (50,8 persen)");
    expect(semua).toContain("315 ruta terealisasi dalam 15 hari kerja oleh 49 petugas.");
    expect(semua).toContain("602 foto dokumentasi dari 48 petugas.");
    expect(semua).toContain("142 percobaan oleh 55 petugas; rata-rata nilai percobaan pertama 75,5");
    expect(semua).toContain("3 dokumen pemeriksaan diunggah oleh 2 PML.");
    expect(semua).toContain("Temuan lain ada pada bagian 6.");
    expect(semua).not.toContain("{{ref");
  });
  it("tanpa sasaran / dokumen PML: bab terkait tidak ada dan kolom KK dibuka hilang", () => {
    const k = bacaDataLaporanUmum({ ...mentah, sasaran: {}, dokumen_pml: {} });
    const x = susunLaporanUmum(k, opsi());
    expect(x.bagian.map((b) => b.kode)).toEqual(["ringkasan", "penugasan", "pelaksanaan", "dokumentasi", "perhatian", "lampiranPetugas"]);
    const tabel = tabelCapaianPetugas(k)!;
    expect(tabel.kepala).not.toContain("KK dibuka");
    expect(tabel.kepala.length).toBe(tabel.rata.length);
    expect(tabel.baris.every((b) => b.length === tabel.kepala.length)).toBe(true);
  });
  it("centang bab/elemen dan catatan penyusun bekerja seperti laporan PSP", () => {
    const x = susunLaporanUmum(d, opsi({ bab: { sasaran: false, lampiranFoto: true }, elemen: { "pelaksanaan.grafik": false }, catatan: { pelaksanaan: "Catatan A\n\nCatatan B" }, judul: "Judul Saya", penyusun: "Tim" }));
    expect(x.bagian.some((b) => b.kode === "sasaran")).toBe(false);
    expect(x.bagian.find((b) => b.kode === "lampiranFoto")!.judulTampil).toBe("Lampiran B. Dokumentasi foto");
    expect(x.bagian.find((b) => b.kode === "pelaksanaan")!.elemen.some((e) => e.jenis === "batang")).toBe(false);
    expect(x.bagian.find((b) => b.kode === "pelaksanaan")!.elemen.at(-1)).toMatchObject({ jenis: "catatan" });
    expect(x.judul).toBe("Judul Saya");
    expect(x.subjudul).toContain("Disusun oleh Tim");
  });
  it("tabel: jumlah baris konsisten dengan kepala, angka cocok data", () => {
    for (const b of l.bagian) for (const e of b.elemen) if (e.jenis === "tabel") {
      const t = e.tabel;
      expect(t.baris.every((r) => r.length === t.kepala.length)).toBe(true);
      expect(t.rata.length).toBe(t.kepala.length);
      if (t.jumlah) expect(t.jumlah.length).toBe(t.kepala.length);
    }
    const sas = l.bagian.find((b) => b.kode === "sasaran")!.elemen.find((e) => e.jenis === "tabel");
    expect(sas && sas.jenis === "tabel" && sas.tabel.jumlah).toEqual(["Jumlah", "71", "811", "412", "50,8", "40", "15"]);
    expect(sas && sas.jenis === "tabel" && sas.tabel.baris[0]).toEqual(["Lembah Gumanti", "4", "158", "63", "39,9", "7", "3"]);
  });
  it("capaian per petugas: urut PML dulu lalu abjad, saringan peran", () => {
    const t = tabelCapaianPetugas(d)!;
    expect(t.baris.map((b) => b[1])).toEqual(["APRILA INSAN SUCI", "Ardial", "Budi", "Citra"]);
    expect(t.jumlah![4]).toBe("24");
    expect(tabelCapaianPetugas(d, "pml")!.baris.length).toBe(1);
    expect(tabelCapaianPetugas(bacaDataLaporanUmum({}))).toBeNull();
  });
  it("foto Lampiran B: ada foto -> elemen foto; kegiatan umum memakai pengantar yang sama", () => {
    const x = susunLaporanUmum(d, opsi({ bab: { lampiranFoto: true } }), { daftar: [{ id: 5, ket: "Foto 1" }], perBaris: 3 });
    expect(x.bagian.find((b) => b.kode === "lampiranFoto")!.elemen.some((e) => e.jenis === "foto")).toBe(true);
  });
  it("bangunBagianUmum memuat seluruh bab (untuk daftar centang) walau bab dimatikan", () => {
    expect(bangunBagianUmum(d).map((b) => b.kode)).toEqual(["ringkasan", "penugasan", "sasaran", "pelaksanaan", "dokumentasi", "dokumenPml", "perhatian", "lampiranPetugas", "lampiranFoto"]);
  });
});

describe("cetak dan Word memakai mesin yang sama", () => {
  const o = opsi({ bab: { lampiranFoto: true } });
  const l = susunLaporanUmum(d, o, { daftar: [{ id: 7, ket: "Foto 1 · Budi" }], perBaris: 2 });
  it("HTML cetak memuat judul dan tabel", () => {
    const h = htmlLaporan(l, o, { 7: "data:image/jpeg;base64,AAAA" });
    expect(h).toContain("SPDT NTP 2026");
    expect(h).toContain("Capaian per petugas");
    expect(h).toContain('src="data:image/jpeg;base64,AAAA"');
  });
  it("Word: daftar isi, tabel, dan zip sah", async () => {
    const b = bangunBerkasDocx(l, o);
    expect(b["word/document.xml"]).toContain("Wilayah dan sasaran");
    expect(b["word/document.xml"]).toContain("Lembah Gumanti");
    const zip = await JSZip.loadAsync((await buatDocx(l, o, "uint8array")) as Uint8Array);
    expect(Object.keys(zip.files)).toContain("word/document.xml");
  });
});

describe("jumlah KK dibuka pada capaian per petugas", () => {
  it("memakai keluarga unik (sasaran.dibuka), bukan jumlah kolom; per peran memakai tanda minus", () => {
    const semua = tabelCapaianPetugas(d)!;
    const idx = semua.kepala.indexOf("KK dibuka");
    expect(semua.jumlah![idx]).toBe("412");
    const ppl = tabelCapaianPetugas(d, "ppl")!;
    expect(ppl.jumlah![ppl.kepala.indexOf("KK dibuka")]).toBe("-");
  });
});
