import { describe, expect, it } from "vitest";
import {
  KATALOG, KODE_LAMPIRAN, KONFIG_LAPORAN_BAWAAN, aktivitasHari, bilangan, galatLaporan, hasilKosong, isiTemplat, lampiranUntuk, normalisasiLaporan, penandaTakDikenal,
  salinLaporanBawaan, samaDenganBawaanLaporan, susunIsiLaporan, teksAktivitas, type DataIsiHarian,
} from "../sigapLaporanIsi";
import { teksLaporan } from "../sigapLaporanPeran";
import { KONFIG_BAWAAN, salinBawaan } from "../lembarKonfig";

const hasil = (a: number, b: number, c: number) => ({ terdampak: a, tidak_terdampak: b, tidak_ditemukan: c });
const dataTim: DataIsiHarian = {
  pendataan: {
    hasil: hasil(10, 30, 5),
    alasan: [{ alasan: "Pindah", n: 2 }, { alasan: "Rumah kosong", n: 3 }],
    petugas: [{ nama: "Rina", hasil: hasil(4, 10, 1) }, { nama: "Sari", hasil: hasil(6, 20, 4) }, { nama: "Nol", hasil: hasil(0, 0, 0) }],
  },
};
const dataIdent: DataIsiHarian = { identifikasi: { subsls: 3, nilai: { kk_terdampak: 120, rusak_berat: 7, korban: 0 } } };

describe("konfig laporan", () => {
  it("bawaan sah, dan lampiran yang tidak berlaku untuk level itu mati", () => {
    expect(galatLaporan(KONFIG_LAPORAN_BAWAAN)).toEqual([]);
    expect(samaDenganBawaanLaporan(salinLaporanBawaan())).toBe(true);
    for (const p of ["ppl", "pml", "korwil"] as const)
      for (const k of KODE_LAMPIRAN) if (!KATALOG[k].peran.includes(p)) expect(KONFIG_LAPORAN_BAWAAN.peran[p].lampiran[k]).toBe(false);
    expect(lampiranUntuk("ppl")).not.toContain("identifikasi");
    expect(lampiranUntuk("pml")).toContain("identifikasi");
  });
  it("normalisasi: sampah -> bawaan; penanda asing dibuang; lampiran tak berlaku dipaksa mati", () => {
    expect(normalisasiLaporan(null)).toEqual(KONFIG_LAPORAN_BAWAAN);
    expect(normalisasiLaporan("x")).toEqual(KONFIG_LAPORAN_BAWAAN);
    const k = normalisasiLaporan({ peran: { ppl: { judul: "Laporan {namaa}", uraian: "Halo {nama}", lampiran: { identifikasi: true, jarak: true } } } });
    expect(k.peran.ppl.judul).toBe("");
    expect(k.peran.ppl.uraian).toBe("Halo {nama}");
    expect(k.peran.ppl.lampiran.identifikasi).toBe(false);
    expect(k.peran.ppl.lampiran.jarak).toBe(true);
    expect(k.peran.pml).toEqual(KONFIG_LAPORAN_BAWAAN.peran.pml);
  });
  it("normalisasi label variabel identifikasi: kosong -> bawaan, dipangkas", () => {
    const k = normalisasiLaporan({ identifikasi: [{ kolom: "korban", label: "  ", aktif: false }, { kolom: "rusak_berat", label: "Rumah RB " + "x".repeat(80), aktif: true }, { kolom: "asing", label: "Z" }] });
    expect(k.identifikasi.find((v) => v.kolom === "korban")).toMatchObject({ label: "Korban", aktif: false });
    expect(k.identifikasi.find((v) => v.kolom === "rusak_berat")!.label.length).toBe(40);
    expect(k.identifikasi.length).toBe(KONFIG_LAPORAN_BAWAAN.identifikasi.length);
  });
  it("galat ketat: penanda asing, lampiran tak berlaku, terlalu panjang, tipe salah", () => {
    const k = salinLaporanBawaan() as unknown as Record<string, any>;
    k.peran.ppl.judul = "{asing}";
    k.peran.ppl.lampiran.identifikasi = true;
    k.peran.pml.uraian = "x".repeat(701);
    k.peran.korwil.lampiran.qc = "ya";
    const g = galatLaporan(k).join(" | ");
    expect(g).toContain("penanda tak dikenal: {asing}");
    expect(g).toContain("tidak berlaku untuk PPL");
    expect(g).toContain("maksimal 700");
    expect(g).toContain("harus ya atau tidak");
    expect(galatLaporan({ identifikasi: [{ kolom: "x" }], peran: {} }).length).toBeGreaterThan(0);
    expect(galatLaporan(5)).toEqual(["Isian pengaturan tidak terbaca."]);
  });
});

describe("penanda teks", () => {
  it("isiTemplat mengganti penanda dikenal, membiarkan yang lain", () => {
    expect(isiTemplat("Pada {tanggal}, {nama} ({jumlah}) {x}", { tanggal: "Senin", nama: "Budi", jumlah: 0 })).toBe("Pada Senin, Budi (0) {x}");
    expect(penandaTakDikenal("{nama} {foo} {foo}")).toEqual(["foo"]);
  });
});

describe("susunIsiLaporan: konteks harian & centang", () => {
  const konf = salinLaporanBawaan();
  const lembar = salinBawaan();

  it("PML hari identifikasi: hanya blok identifikasi (PPL belum mendata)", () => {
    const r = susunIsiLaporan("pml", konf, lembar, dataIdent);
    expect(r.blok.map((b) => b.judul)).toEqual(["HASIL IDENTIFIKASI WILAYAH"]);
    expect(r.blok[0].baris![0]).toEqual(["Sub SLS diidentifikasi", "3"]);
    expect(r.blok[0].baris).toContainEqual(["KK terdampak", "120"]);
    expect(r.aktivitas).toEqual({ identifikasi: true, pengawasan: false, qc: false });
  });
  it("PML hari pengawasan: hasil tim, alasan, rincian per PPL (tanpa petugas nol); tanpa identifikasi", () => {
    const r = susunIsiLaporan("pml", konf, lembar, dataTim);
    expect(r.blok.map((b) => b.judul)).toEqual(["HASIL PENDATAAN TIM (PENGAWASAN PPL)", "ALASAN HASIL “TIDAK DITEMUKAN”", "RINCIAN PER PPL"]);
    expect(r.blok[0].baris![0]).toEqual(["Jumlah KK dikunjungi", "45"]);
    expect(r.blok[0].baris![1]).toEqual(["Terdampak", "10 (22,2%)"]);
    expect(r.blok[1].tabel!.baris[0][0]).toBe("Rumah kosong"); // urut terbanyak
    expect(r.blok[2].tabel!.baris.map((b) => b[0])).toEqual(["Rina", "Sari"]);
    expect(r.blok[2].tabel!.kepala).toEqual(["PPL", "Terdampak", "Tidak terdampak", "Tidak ditemukan", "JUMLAH"]);
    expect(r.aktivitas.pengawasan).toBe(true);
    expect(r.aktivitas.identifikasi).toBe(false);
  });
  it("PML dua-duanya pada hari yang sama: dua kelompok blok", () => {
    const r = susunIsiLaporan("pml", konf, lembar, { ...dataIdent, ...dataTim });
    expect(r.blok[0].judul).toBe("HASIL IDENTIFIKASI WILAYAH");
    expect(r.blok.length).toBe(4);
    expect(r.aktivitas).toMatchObject({ identifikasi: true, pengawasan: true });
  });
  it("label kategori mengikuti Pengaturan Lembar (Updating) dan hanya kategori aktif", () => {
    const l = salinBawaan();
    l.hasil.terdampak.label_pendek = "KK ada, data sesuai";
    l.hasil.tidak_terdampak.aktif = false;
    const r = susunIsiLaporan("ppl", konf, l, dataTim);
    const baris = r.blok[0].baris!.map((b) => b[0]);
    expect(baris).toContain("KK ada, data sesuai");
    expect(baris).not.toContain("Tidak terdampak");
    expect(r.blok.map((b) => b.judul)).toEqual(["HASIL PENDATAAN KK", "ALASAN HASIL “TIDAK DITEMUKAN”"]);
  });
  it("centang dimatikan -> blok hilang; lokasi/kendala mengikuti centang", () => {
    const k = salinLaporanBawaan();
    k.peran.pml.lampiran.pendataan = false;
    k.peran.pml.lampiran.pendataan_alasan = false;
    k.peran.pml.lampiran.lokasi = false;
    const r = susunIsiLaporan("pml", k, lembar, dataTim);
    expect(r.blok.map((b) => b.judul)).toEqual(["RINCIAN PER PPL"]);
    expect(r.tampilLokasi).toBe(false);
    expect(r.tampilKendala).toBe(true);
  });
  it("korwil: QC tampil, pendataan mati secara bawaan; bisa dicentang", () => {
    const data: DataIsiHarian = { ...dataTim, qc: { lembar: 3, kategori: { Cukup: 2, Baik: 1 }, sesuai: 20, perluPerbaikan: 5, tidakSesuai: 1 } };
    let r = susunIsiLaporan("korwil", konf, lembar, data);
    expect(r.blok.map((b) => b.judul)).toEqual(["HASIL QUALITY CHECK"]);
    expect(r.blok[0].baris).toEqual([["Lembar QC diperiksa", "3"], ["Kategori Cukup", "2"], ["Kategori Baik", "1"], ["Aspek sesuai", "20"], ["Aspek perlu perbaikan", "5"], ["Aspek tidak sesuai", "1"]]);
    const k = salinLaporanBawaan();
    k.peran.korwil.lampiran.pendataan = true;
    k.peran.korwil.lampiran.pendataan_petugas = true;
    r = susunIsiLaporan("korwil", k, lembar, data);
    expect(r.blok.map((b) => b.judul)).toEqual(["HASIL PENDATAAN KELOMPOK KOORDINASI", "RINCIAN PER TIM", "HASIL QUALITY CHECK"]);
    expect(r.aktivitas.qc).toBe(true);
  });
  it("jarak: mati secara bawaan; bila dicentang & ada data -> baris jarak dengan koma desimal", () => {
    const data: DataIsiHarian = { ...dataTim, jarak: { pasangan: 4, rataKm: 4.489, maksKm: 9.83, perkiraan: 1, tanpa: 2 } };
    expect(susunIsiLaporan("ppl", konf, lembar, data).blok.some((b) => b.judul.startsWith("JARAK"))).toBe(false);
    const k = salinLaporanBawaan();
    k.peran.ppl.lampiran.jarak = true;
    const b = susunIsiLaporan("ppl", k, lembar, data).blok.find((x) => x.judul.startsWith("JARAK"))!;
    expect(b.baris).toContainEqual(["Jarak rata-rata", "4,49 km"]);
    expect(b.baris).toContainEqual(["Jarak terjauh", "9,83 km"]);
    expect(b.baris).toContainEqual(["Berstatus perkiraan (nagari)", "1"]);
    expect(b.baris).toContainEqual(["Belum ada data jarak", "2"]);
    expect(b.catatan).toBeTruthy();
  });
  it("tanpa data / peran lain: tidak ada blok, tanpa galat", () => {
    expect(susunIsiLaporan("ppl", konf, lembar, {}).blok).toEqual([]);
    expect(susunIsiLaporan("pml", konf, lembar, { pendataan: { hasil: hasilKosong(), alasan: [], petugas: [] } }).blok).toEqual([]);
    const s = susunIsiLaporan("supervisor", konf, lembar, dataTim);
    expect(s.blok).toEqual([]);
    expect(s.tampilLokasi && s.tampilKendala).toBe(true);
    expect(susunIsiLaporan(undefined, konf, KONFIG_BAWAAN, {}).blok).toEqual([]);
  });
  it("bilangan: pemisah ribuan titik, desimal koma", () => {
    expect(bilangan(1234567)).toBe("1.234.567");
    expect(bilangan(4.5, 2)).toBe("4,50");
    expect(bilangan(NaN)).toBe("0");
  });
  it("aktivitasHari & teksAktivitas", () => {
    expect(aktivitasHari("ppl", dataIdent)).toEqual({ identifikasi: false, pengawasan: false, qc: false });
    expect(teksAktivitas("pml", { identifikasi: true, pengawasan: true, qc: false })).toBe("mengidentifikasi wilayah kerja (Sub SLS) yang menjadi tanggung jawab tim dan mengawasi pendataan oleh PPL di bawahnya");
    expect(teksAktivitas("korwil", { identifikasi: false, pengawasan: false, qc: false })).toBe("mengoordinasikan petugas di wilayahnya");
  });
});

describe("teksLaporan kontekstual", () => {
  const dasar = { kegiatanNama: "Pendataan Pascabencana", namaPetugas: "Budi", labelJabatan: "PML", tanggalTeks: "Senin, 12 Oktober 2026", satuan: "KK", jumlahRealisasi: 4, jumlahLokasi: 2, wilayah: "Nagari A" };
  it("PML hari identifikasi vs hari pengawasan", () => {
    const i = teksLaporan({ ...dasar, jenis: "pml", aktivitas: { identifikasi: true, pengawasan: false, qc: false } });
    expect(i.paragraf[0]).toContain("mengidentifikasi wilayah kerja");
    expect(i.paragraf[0]).not.toContain("mengawasi");
    expect(i.labelAngka).toBe("JUMLAH KK DIIDENTIFIKASI");
    const w = teksLaporan({ ...dasar, jenis: "pml", aktivitas: { identifikasi: false, pengawasan: true, qc: false } });
    expect(w.paragraf[0]).toContain("mengawasi pendataan oleh PPL");
    expect(w.paragraf[0]).not.toContain("mengidentifikasi");
    expect(w.labelAngka).toBe("JUMLAH KK DILAPORKAN");
    expect(w.seksiUraian).toBe("URAIAN PENGAWASAN PENDATAAN");
  });
  it("tanpa informasi aktivitas: teks lama tetap", () => {
    const t = teksLaporan({ ...dasar, jenis: "pml" });
    expect(t.paragraf[0]).toContain("mengawasi pendataan oleh PPL di bawahnya serta mengidentifikasi wilayah kerja");
    expect(t.labelAngka).toBe("JUMLAH KK DIIDENTIFIKASI");
  });
  it("korwil tanpa QC hari itu tidak menyebut quality check", () => {
    const t = teksLaporan({ ...dasar, jenis: "korwil", aktivitas: { identifikasi: false, pengawasan: false, qc: false } });
    expect(t.paragraf.join(" ")).not.toMatch(/quality check|diperiksa/);
    const q = teksLaporan({ ...dasar, jenis: "korwil", aktivitas: { identifikasi: false, pengawasan: false, qc: true } });
    expect(q.paragraf[0]).toContain("quality check");
  });
  it("judul & uraian pengganti dengan penanda; kosong = bawaan; catatan menyebut catatan lapangan bila ada lampiran", () => {
    const t = teksLaporan({ ...dasar, jenis: "ppl", ganti: { judul: "Laporan Harian {nama}", uraian: "Pada {tanggal} {nama} mendata {jumlah} {satuan} di {wilayah}.\n\nBaris kedua {aktivitas}." }, adaLampiran: true });
    expect(t.judul).toBe("Laporan Harian Budi");
    expect(t.paragraf).toEqual(["Pada Senin, 12 Oktober 2026 Budi mendata 4 KK di Nagari A.", "Baris kedua melaksanakan tugas."]);
    expect(t.catatan).toContain("catatan lapangan");
    const k = teksLaporan({ ...dasar, jenis: "ppl", ganti: { judul: "", uraian: "" } });
    expect(k.judul).toBe("Laporan Pendataan Lapangan");
    expect(k.catatan).not.toContain("catatan lapangan");
  });
});

describe("rincian hasil pendataan pada uraian", () => {
  const dasar = { kegiatanNama: "PSP", namaPetugas: "Andi", labelJabatan: "PPL", tanggalTeks: "Senin, 12 Oktober 2026", satuan: "KK", jumlahRealisasi: 12, jumlahLokasi: 0, wilayah: "" };
  it("PPL: kalimat jumlah memuat rincian bila ada", () => {
    const t = teksLaporan({ ...dasar, jenis: "ppl", rincianHasil: "5 KK didata terdampak, 4 KK didata tidak terdampak, dan 3 KK tidak ditemukan" });
    expect(t.paragraf[1]).toContain("sebanyak 12");
    expect(t.paragraf[1]).toContain("dengan rincian hasil pendataan: 5 KK didata terdampak, 4 KK didata tidak terdampak, dan 3 KK tidak ditemukan.");
    expect(teksLaporan({ ...dasar, jenis: "ppl" }).paragraf[1]).not.toContain("rincian");
  });
  it("PML: rincian hanya bila mengawasi; penanda {rincian} tersedia di templat", () => {
    const aw = teksLaporan({ ...dasar, jenis: "pml", aktivitas: { identifikasi: false, pengawasan: true, qc: false }, rincianHasil: "5 KK terdampak" });
    expect(aw.paragraf[1]).toContain("rincian hasil pendataan tim: 5 KK terdampak");
    const id = teksLaporan({ ...dasar, jenis: "pml", aktivitas: { identifikasi: true, pengawasan: false, qc: false }, rincianHasil: "5 KK terdampak" });
    expect(id.paragraf[1]).not.toContain("rincian");
    const g = teksLaporan({ ...dasar, jenis: "ppl", rincianHasil: "5 KK terdampak", ganti: { judul: "", uraian: "Hasil: {rincian}." } });
    expect(g.paragraf).toEqual(["Hasil: 5 KK terdampak."]);
  });
  it("susunIsiLaporan menghasilkan rincianHasil sesuai kategori aktif", () => {
    const r = susunIsiLaporan("ppl", salinLaporanBawaan(), salinBawaan(), { pendataan: { hasil: { terdampak: 5, tidak_terdampak: 4, tidak_ditemukan: 3 }, alasan: [], petugas: [] } });
    expect(r.rincianHasil).toMatch(/^5 KK .+, 4 KK .+, dan 3 KK .+$/);
    expect(susunIsiLaporan("ppl", salinLaporanBawaan(), salinBawaan(), {}).rincianHasil).toBeUndefined();
  });
});
