import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  OPSI_AWAL, babTampil, bacaDataLaporan, elemenTampil, bacaOpsi, bangunBagian, esc, fmtAngka, fmtDesimal, fmtPersen, hitungProyeksi, htmlLaporan, jamWib, judulKecamatan, kecamatanTertinggal,
  kelompokkanElemen, namaBerkasLaporan, paragrafDariTeks, panjangBatang, selesaikanRujukan, susunLaporan, tabelNilaiPetugas, tambahHari, tanggalIndo, tanggalPendek, tanggalWib,
  temuanPerhatian, urutkanPetugas, type DataLaporan, type Elemen, type Laporan, type OpsiLaporan,
} from "../laporanSementara";
import { bangunBerkasDocx, buatDocx, daftarFotoDocx, dokumenXml, lebarKolom, mediaDocx, xml } from "../laporanDocx";

/** Data contoh bermodel keluaran fungsi SQL (30 Okt 2026, 16.27 WIB). */
const mentah = {
  dibuat_at: "2026-10-30T09:27:06.33699+00:00",
  kegiatan: { id: 1, nama: "Pendataan Pascabencana 2026", tanggal_mulai: "2026-10-10", tanggal_selesai: "2026-11-10" },
  identifikasi: {
    isian_jorong: 254, mitra: 55, nagari: 26, kecamatan: 9, sub_sls_diisi: 450, sub_sls_tidak_terdampak: 272, pml_pengisi: 18, kk_terdampak: 8291,
    rusak_berat: 366, rusak_sedang: 398, rusak_ringan: 2562, lahan_tertimbun: 1921, kekeringan: 1284, aset_usaha: 761, lahan_ternak: 115, korban: 17,
  },
  petugas: { pml: 18, ppl: 66, korwil: 13, supervisor: 3 },
  wilayah_kerja: { sub_sls: 235, keluarga_daftar: 106255, keluarga_tambahan: 1922 },
  pendataan: {
    sasaran: 23934, didata: 16184, terdampak: 7590, tidak_terdampak: 8509, tidak_ditemukan: 85, hari_pertama: "2026-10-11",
    harian: [
      { tgl: "2026-10-24", n: 912 }, { tgl: "2026-10-23", n: 1052 }, { tgl: "2026-10-25", n: 969 }, { tgl: "2026-10-26", n: 1040 },
      { tgl: "2026-10-27", n: 801 }, { tgl: "2026-10-28", n: 895 }, { tgl: "2026-10-29", n: 952 }, { tgl: "2026-10-30", n: 629 },
    ],
  },
  kecamatan: [
    { kecamatan: "KUBUNG", idn_sub_sls: 124, idn_terdampak: 67, idn_kk: 4275, sub_sls: 77, sasaran: 8865, didata: 6529, terdampak: 3475, tidak_terdampak: 3016, tidak_ditemukan: 38 },
    { kecamatan: "X KOTO SINGKARAK", idn_sub_sls: 73, idn_terdampak: 42, idn_kk: 1729, sub_sls: 55, sasaran: 4841, didata: 3040, terdampak: 1568, tidak_terdampak: 1461, tidak_ditemukan: 11 },
    { kecamatan: "GUNUNG TALANG", idn_sub_sls: 135, idn_terdampak: 16, idn_kk: 202, sub_sls: 32, sasaran: 3356, didata: 1811, terdampak: 514, tidak_terdampak: 1282, tidak_ditemukan: 15 },
    { kecamatan: "X KOTO DIATAS", idn_sub_sls: 16, idn_terdampak: 4, idn_kk: 22, sub_sls: 7, sasaran: 558, didata: 276, terdampak: 3, tidak_terdampak: 273, tidak_ditemukan: 0 },
    { kecamatan: "IX KOTO SUNGAI LASI", idn_sub_sls: 0, idn_terdampak: 0, idn_kk: 0, sub_sls: 1, sasaran: 55, didata: 0, terdampak: 0, tidak_terdampak: 0, tidak_ditemukan: 0 },
    { kecamatan: "TIGO LURAH", idn_sub_sls: 14, idn_terdampak: 0, idn_kk: 0, sub_sls: 0, sasaran: 0, didata: 0, terdampak: 0, tidak_terdampak: 0, tidak_ditemukan: 0 },
  ],
  pelatihan: {
    tes: [{ jenis: "posttest", peserta: 89, rata: 71.7, ge80: 31, lt60: 16 }, { jenis: "pretest", peserta: 90, rata: 74, ge80: 43, lt60: 13 }],
    kelas: [{ kelas: 2, pml: 9, ppl: 16, peserta: 25, hadir: 24 }, { kelas: 1, pml: 8, ppl: 20, peserta: 28, hadir: 28 }],
    hadir: 91,
  },
  dokumentasi: { foto: 4669, petugas: 94 },
  qc: { percobaan: 576, petugas: 84, rata_pertama: 89.3 },
  petugas_nilai: [
    { akun_id: 3, nama: "Siska Amelia", peran: "ppl", kelas: 2, hadir: true, pretest: 80, posttest: 55.6, qc_rata: 91, qc_percobaan: 9 },
    { akun_id: 1, nama: "Budi Pernandes", peran: "pml", kelas: 1, hadir: true, pretest: 70.5, posttest: 88.9, qc_rata: 95.5, qc_percobaan: 12 },
    { akun_id: 4, nama: "Ardial Jaraf", peran: "ppl", kelas: null, hadir: false, pretest: null, posttest: null, qc_rata: null, qc_percobaan: 0 },
    { akun_id: 2, nama: "Usyenti", peran: "pml", kelas: 3, hadir: true, pretest: 90, posttest: 72.2, qc_rata: 85, qc_percobaan: 6 },
  ],
};
const d: DataLaporan = bacaDataLaporan(mentah);

describe("format angka dan tanggal", () => {
  it("fmtAngka memakai titik ribuan", () => {
    expect(fmtAngka(15911)).toBe("15.911");
    expect(fmtAngka(0)).toBe("0");
    expect(fmtAngka(1234567)).toBe("1.234.567");
    expect(fmtAngka(999.6)).toBe("1.000");
  });
  it("fmtDesimal memakai koma desimal", () => {
    expect(fmtDesimal(66.62)).toBe("66,6");
    expect(fmtDesimal(71.7)).toBe("71,7");
    expect(fmtDesimal(1234.56)).toBe("1.234,6");
    expect(fmtDesimal(0)).toBe("0,0");
    expect(fmtDesimal(100, 0)).toBe("100");
  });
  it("fmtPersen: total 0 aman", () => {
    expect(fmtPersen(16184, 23934)).toBe("67,6");
    expect(fmtPersen(5, 0)).toBe("0,0");
  });
  it("tanggalIndo dan tanggalPendek", () => {
    expect(tanggalIndo("2026-10-30")).toBe("30 Oktober 2026");
    expect(tanggalIndo("2026-01-05")).toBe("5 Januari 2026");
    expect(tanggalIndo("2026-13-01")).toBe("");
    expect(tanggalIndo(null)).toBe("");
    expect(tanggalIndo("rusak")).toBe("");
    expect(tanggalPendek("2026-10-30")).toBe("30 Okt");
  });
  it("tanggal dan jam WIB dari stempel UTC", () => {
    expect(tanggalWib("2026-10-30T09:27:06Z")).toBe("2026-10-30");
    expect(tanggalWib("2026-10-30T20:00:00Z")).toBe("2026-10-31");
    expect(jamWib("2026-10-30T09:27:06Z")).toBe("16:27");
    expect(tanggalWib("bukan tanggal")).toBe("");
  });
  it("tambahHari lintas bulan", () => {
    expect(tambahHari("2026-10-30", 3)).toBe("2026-11-02");
    expect(tambahHari("rusak", 3)).toBe("");
  });
  it("judulKecamatan: huruf kapital awal, angka Romawi tetap", () => {
    expect(judulKecamatan("X KOTO SINGKARAK")).toBe("X Koto Singkarak");
    expect(judulKecamatan("IX KOTO SUNGAI LASI")).toBe("IX Koto Sungai Lasi");
    expect(judulKecamatan("kubung")).toBe("Kubung");
  });
});

describe("bacaDataLaporan", () => {
  it("memetakan angka, mengurutkan harian, tidak melempar galat pada data rusak", () => {
    expect(d.pendataan.harian[0].tgl).toBe("2026-10-23");
    expect(d.pendataan.harian[d.pendataan.harian.length - 1].tgl).toBe("2026-10-30");
    expect(d.petugas.ppl).toBe(66);
    const kosong = bacaDataLaporan(null);
    expect(kosong.kecamatan).toEqual([]);
    expect(kosong.pendataan.sasaran).toBe(0);
    expect(kosong.kegiatan).toBeNull();
    expect(kosong.qc.rata_pertama).toBeNull();
    const aneh = bacaDataLaporan({ pendataan: { sasaran: "abc", harian: [{ tgl: "x", n: 5 }, { tgl: "2026-10-01", n: "7" }] }, kecamatan: "bukan larik" });
    expect(aneh.pendataan.sasaran).toBe(0);
    expect(aneh.pendataan.harian).toEqual([{ tgl: "2026-10-01", n: 7 }]);
    expect(aneh.kecamatan).toEqual([]);
  });
});

describe("hitungProyeksi", () => {
  it("memakai maks 7 hari LENGKAP terakhir (hari berjalan dibuang)", () => {
    const p = hitungProyeksi(d);
    // 7 hari lengkap sebelum 30 Okt: 23..29 -> (1052+912+969+1040+801+895+952)/7
    expect(p.hariDipakai).toBe(7);
    expect(Math.round(p.laju)).toBe(946);
    expect(p.sisa).toBe(23934 - 16184);
    expect(p.hariLagi).toBe(Math.ceil(7750 / (6621 / 7)));
    expect(p.tanggal).toBe(tambahHari("2026-10-30", p.hariLagi as number));
    expect((p.tanggalCepat as string) < (p.tanggal as string)).toBe(true);
    expect((p.tanggalLambat as string) > (p.tanggal as string)).toBe(true);
  });
  it("tanpa laju atau tanpa sisa: tanggal null", () => {
    const tanpaHarian = { ...d, pendataan: { ...d.pendataan, harian: [] } };
    expect(hitungProyeksi(tanpaHarian).tanggal).toBeNull();
    const selesai = { ...d, pendataan: { ...d.pendataan, didata: d.pendataan.sasaran } };
    const p = hitungProyeksi(selesai);
    expect(p.sisa).toBe(0);
    expect(p.hariLagi).toBeNull();
  });
});

describe("temuan perhatian", () => {
  it("kecamatanTertinggal: hanya sasaran >= ambang minimum dan capaian di bawah ambang persen, terendah dulu", () => {
    expect(kecamatanTertinggal(d, 55, 300).map((x) => x.nama)).toEqual(["X Koto Diatas", "Gunung Talang"]);
    expect(kecamatanTertinggal(d, 50, 300).map((x) => x.nama)).toEqual(["X Koto Diatas"]);
    expect(kecamatanTertinggal(d, 55, 600).map((x) => x.nama)).toEqual(["Gunung Talang"]);
    expect(kecamatanTertinggal(d, 10, 300)).toEqual([]);
  });
  it("memuat posttest <60, penurunan rata-rata, dan kecamatan tanpa data", () => {
    const t = temuanPerhatian(d);
    expect(t.some((x) => x.includes("16 dari 89 peserta posttest bernilai di bawah 60"))).toBe(true);
    expect(t.some((x) => x.includes("Rata-rata posttest (71,7) lebih rendah daripada pretest (74,0)"))).toBe(true);
    expect(t.some((x) => x.includes("Belum ada keluarga yang didata di IX Koto Sungai Lasi"))).toBe(true);
  });
  it("tanpa masalah: tidak ada temuan", () => {
    const bersih: DataLaporan = { ...d, pelatihan: { ...d.pelatihan, tes: [] }, kecamatan: d.kecamatan.filter((k) => k.kecamatan === "KUBUNG") };
    expect(temuanPerhatian(bersih)).toEqual([]);
  });
  it("peringatan bila perkiraan selesai melewati akhir periode", () => {
    const lambat = { ...d, kegiatan: { id: 1, nama: "x", tanggal_mulai: "2026-10-10", tanggal_selesai: "2026-10-31" }, pelatihan: { ...d.pelatihan, tes: [] }, kecamatan: [] };
    expect(temuanPerhatian(lambat).some((x) => x.includes("melewati akhir periode"))).toBe(true);
  });
});


/** Teks seluruh bab (judul + elemen) untuk pencarian sederhana. */
const teksLaporan = (l: Laporan): string => JSON.stringify(l.bagian);
const elemenId = (l: Laporan, id: string): Elemen | undefined => l.bagian.flatMap((b) => b.elemen).find((e) => e.id === id);
const babKode = (l: Laporan): string[] => l.bagian.map((b) => b.kode);
const opsi = (o: Partial<OpsiLaporan>): OpsiLaporan => ({ ...OPSI_AWAL, ...o });

describe("susunLaporan: bawaan", () => {
  const l = susunLaporan(d);
  it("urutan bab: bawaan menampilkan semua kecuali kerangka foto; penomoran angka dan huruf", () => {
    expect(babKode(l)).toEqual(["ringkasan", "perencanaan", "pelatihan", "pelaksanaan", "dokumentasi", "perhatian", "lampiranNilai"]);
    expect(l.bagian.map((b) => b.judulTampil)).toEqual([
      "Ringkasan eksekutif", "1. Perencanaan: identifikasi wilayah terdampak", "2. Pelatihan petugas", "3. Pelaksanaan pendataan", "4. Dokumentasi dan QC Pemahaman", "5. Hal yang perlu perhatian", "Lampiran A. Nilai per petugas",
    ]);
    expect(l.semua.map((b) => b.kode)).toContain("lampiranFoto");
    expect(l.judul).toBe("Laporan Sementara Pelaksanaan Pendataan Pascabencana 2026");
    expect(l.subjudul).toContain("30 Oktober 2026");
    expect(l.subjudul).toContain("16:27 WIB");
  });
  it("ringkasan memuat angka kunci berformat Indonesia dan rujukan ke bab perhatian", () => {
    const butir = l.bagian[0].elemen.filter((e) => e.jenis === "butir").flatMap((e) => (e as Extract<Elemen, { jenis: "butir" }>).butir).join("\n");
    expect(butir).toContain("16.184 dari 23.934 keluarga sasaran sudah berstatus (67,6 persen)");
    expect(butir).toContain("7.590 terdampak, 8.509 tidak terdampak, 85 tidak ditemukan");
    expect(butir).toContain("4.669 foto");
    expect(butir).toContain("rata-rata nilai percobaan pertama 89,3");
    expect(butir).toContain("53 peserta dalam 2 kelas; 52 hadir");
    expect(butir).toContain("Temuan lain ada pada bagian 5.");
    expect(butir).not.toContain("{{ref");
  });
  it("tabel capaian: hanya kecamatan bersasaran, jumlah cocok", () => {
    const t = (elemenId(l, "pelaksanaan.tabel") as Extract<Elemen, { jenis: "tabel" }>).tabel;
    expect(t.baris.map((b) => b[0])).toEqual(["Kubung", "X Koto Singkarak", "Gunung Talang", "X Koto Diatas", "IX Koto Sungai Lasi"]);
    expect(t.jumlah?.[2]).toBe(fmtAngka(8865 + 4841 + 3356 + 558 + 55));
    expect(t.jumlah?.[3]).toBe(fmtAngka(6529 + 3040 + 1811 + 276));
    expect(t.baris.every((b) => b.length === t.kepala.length)).toBe(true);
    expect(t.jumlah?.length).toBe(t.kepala.length);
    expect(t.rata.length).toBe(t.kepala.length);
  });
  it("nomor tabel dan gambar berurutan lintas bab", () => {
    const judul = l.bagian.flatMap((b) => b.elemen).flatMap((e) => (e.jenis === "tabel" ? [e.tabel.judul ?? ""] : e.jenis === "batang" ? [e.batang.judul] : []));
    expect(judul.filter((j) => j.startsWith("Tabel ")).map((j) => /^Tabel (\d+)\./.exec(j)?.[1])).toEqual(["1", "2", "3", "4", "5"]);
    expect(judul.filter((j) => j.startsWith("Gambar ")).length).toBe(1);
    expect(judul.find((j) => j.startsWith("Gambar "))).toMatch(/^Gambar 1\./);
  });
  it("tabel identifikasi diurut keluarga terdampak terbanyak; tabel kelas urut; pretest sebelum posttest", () => {
    const t = (elemenId(l, "perencanaan.tabel") as Extract<Elemen, { jenis: "tabel" }>).tabel;
    expect(t.baris[0][0]).toBe("Kubung");
    expect(t.baris.map((b) => b[0])).toContain("Tigo Lurah");
    expect(t.jumlah?.[3]).toBe(fmtAngka(4275 + 1729 + 202 + 22));
    expect((elemenId(l, "pelatihan.tabelKelas") as Extract<Elemen, { jenis: "tabel" }>).tabel.baris.map((r) => r[0])).toEqual(["1", "2"]);
    const tes = (elemenId(l, "pelatihan.tabelTes") as Extract<Elemen, { jenis: "tabel" }>).tabel;
    expect(tes.baris.map((r) => r[0])).toEqual(["Pretest", "Posttest"]);
    expect(tes.baris[0][2]).toBe("74,0");
  });
  it("grafik harian maks 14 hari", () => {
    const b = (elemenId(l, "pelaksanaan.grafik") as Extract<Elemen, { jenis: "batang" }>).batang;
    expect(b.data.length).toBeLessThanOrEqual(14);
    expect(b.data[b.data.length - 1]).toEqual({ label: "30 Okt", nilai: 629 });
  });
  it("tanpa data sama sekali tetap tersusun (tidak melempar)", () => {
    const k = susunLaporan(bacaDataLaporan({}));
    expect(k.bagian.length).toBe(7);
    expect(teksLaporan(k)).toContain("0 dari 0 keluarga sasaran");
    expect(teksLaporan(k)).toContain("belum tersedia");
    expect(teksLaporan(k)).toContain("Belum ada data petugas");
  });
});

describe("opsi: bab dan elemen dicentang", () => {
  it("bab dimatikan -> bab hilang, penomoran menyesuaikan, butir ringkasan ikut hilang", () => {
    const l = susunLaporan(d, opsi({ bab: { pelatihan: false, dokumentasi: false } }));
    expect(l.bagian.map((b) => b.judulTampil)).toEqual(["Ringkasan eksekutif", "1. Perencanaan: identifikasi wilayah terdampak", "2. Pelaksanaan pendataan", "3. Hal yang perlu perhatian", "Lampiran A. Nilai per petugas"]);
    const t = teksLaporan(l);
    expect(t).not.toContain("Pelatihan. 53 peserta");
    expect(t).not.toContain("Dokumentasi. 4.669 foto");
    expect(t).not.toContain("QC Pemahaman. 576");
    expect(t).toContain("Temuan lain ada pada bagian 3.");
  });
  it("bab perhatian dimatikan -> rujukan ke bab itu lenyap tanpa sisa tanda", () => {
    const l = susunLaporan(d, opsi({ bab: { perhatian: false } }));
    const t = teksLaporan(l);
    expect(t).not.toContain("Temuan lain");
    expect(t).not.toContain("{{ref");
    expect(t).not.toContain("Yang perlu perhatian.");
  });
  it("butir ringkasan bisa dicentang sendiri; centang eksplisit mengalahkan 'ikut bab'", () => {
    const l = susunLaporan(d, opsi({ elemen: { "ringkasan.pendataan": false, "ringkasan.pelatihan": true }, bab: { pelatihan: false } }));
    const t = teksLaporan(l);
    expect(t).not.toContain("Pendataan. 16.184");
    expect(t).toContain("Pelatihan. 53 peserta");
  });
  it("elemen tabel dan grafik bisa dimatikan; nomor tabel menyesuaikan", () => {
    const l = susunLaporan(d, opsi({ elemen: { "pelaksanaan.tabel": false, "pelaksanaan.grafik": false, "perencanaan.tabel": false } }));
    expect(elemenId(l, "pelaksanaan.tabel")).toBeUndefined();
    expect(elemenId(l, "pelaksanaan.grafik")).toBeUndefined();
    const judulTabel = l.bagian.flatMap((b) => b.elemen).flatMap((e) => (e.jenis === "tabel" ? [e.tabel.judul ?? ""] : []));
    expect(judulTabel.map((j) => /^Tabel (\d+)\./.exec(j)?.[1])).toEqual(["1", "2", "3"]);
    expect(teksLaporan(l)).not.toContain("Gambar 1");
  });
  it("semua bab dimatikan -> laporan kosong tapi tidak melempar", () => {
    const mati = Object.fromEntries(bangunBagian(d).map((b) => [b.kode, false]));
    const l = susunLaporan(d, opsi({ bab: mati }));
    expect(l.bagian).toEqual([]);
    expect(l.semua.length).toBeGreaterThan(5);
  });
  it("kerangka foto bawaan mati; bila dihidupkan menjadi Lampiran B", () => {
    expect(babTampil(OPSI_AWAL, "lampiranFoto")).toBe(false);
    const l = susunLaporan(d, opsi({ bab: { lampiranFoto: true } }));
    expect(l.bagian.map((b) => b.judulTampil).slice(-2)).toEqual(["Lampiran A. Nilai per petugas", "Lampiran B. Dokumentasi foto"]);
    const l2 = susunLaporan(d, opsi({ bab: { lampiranNilai: false, lampiranFoto: true } }));
    expect(l2.bagian[l2.bagian.length - 1].judulTampil).toBe("Lampiran A. Dokumentasi foto");
  });
  it("catatan penyusun disisipkan hanya pada bab yang tampil dan tidak kosong", () => {
    const l = susunLaporan(d, opsi({ catatan: { pelaksanaan: "Laju turun karena hujan.\n\nPerlu tambahan petugas.", pelatihan: "   ", perhatian: "x" }, bab: { perhatian: false } }));
    const e = elemenId(l, "pelaksanaan.catatan") as Extract<Elemen, { jenis: "catatan" }>;
    expect(paragrafDariTeks(e.teks)).toEqual(["Laju turun karena hujan.", "Perlu tambahan petugas."]);
    expect(elemenId(l, "pelatihan.catatan")).toBeUndefined();
    expect(elemenId(l, "perhatian.catatan")).toBeUndefined();
    expect(l.bagian.find((b) => b.kode === "pelaksanaan")!.elemen.at(-1)!.jenis).toBe("catatan");
  });
  it("judul dan penyusun diterapkan", () => {
    const l = susunLaporan(d, opsi({ judul: "Laporan Khusus Bupati", penyusun: "Tim Statistik Kesra" }));
    expect(l.judul).toBe("Laporan Khusus Bupati");
    expect(l.subjudul).toContain("Disusun oleh Tim Statistik Kesra");
    expect(susunLaporan(d, opsi({ judul: "  " })).judul).toContain("Laporan Sementara Pelaksanaan");
  });
});

describe("lampiran nilai per petugas", () => {
  it("urutan: PML dulu lalu PPL, abjad; urut nama; urut nilai tertinggi dengan kosong di bawah", () => {
    expect(urutkanPetugas(d.petugas_nilai, "peran").map((p) => p.nama)).toEqual(["Budi Pernandes", "Usyenti", "Ardial Jaraf", "Siska Amelia"]);
    expect(urutkanPetugas(d.petugas_nilai, "nama").map((p) => p.nama)).toEqual(["Ardial Jaraf", "Budi Pernandes", "Siska Amelia", "Usyenti"]);
    expect(urutkanPetugas(d.petugas_nilai, "posttest").map((p) => p.nama)).toEqual(["Budi Pernandes", "Usyenti", "Siska Amelia", "Ardial Jaraf"]);
    expect(urutkanPetugas(d.petugas_nilai, "qc").map((p) => p.nama)).toEqual(["Budi Pernandes", "Siska Amelia", "Usyenti", "Ardial Jaraf"]);
  });
  it("tabel penuh: semua kolom, nilai kosong '-', baris rata-rata", () => {
    const t = tabelNilaiPetugas(d, OPSI_AWAL)!;
    expect(t.kepala).toEqual(["No", "Nama", "Peran", "Kelas", "Hadir", "Pretest", "Posttest", "QC (percobaan pertama)", "Percobaan QC"]);
    expect(t.baris[0]).toEqual(["1", "Budi Pernandes", "PML", "1", "Ya", "70,5", "88,9", "95,5", "12"]);
    const ardial = t.baris.find((b) => b[1] === "Ardial Jaraf")!;
    expect(ardial.slice(3)).toEqual(["-", "Tidak", "-", "-", "-", "0"]);
    expect(t.jumlah![1]).toBe("Rata-rata (4 petugas)");
    expect(t.jumlah![4]).toBe("3 dari 4"); // hadir
    expect(t.jumlah![5]).toBe(fmtDesimal((70.5 + 80 + 90) / 3)); // pretest: abaikan kosong
    expect(t.jumlah![8]).toBe("27");
    expect(t.baris.every((b) => b.length === t.kepala.length) && t.jumlah!.length === t.kepala.length && t.rata.length === t.kepala.length).toBe(true);
  });
  it("kolom dimatikan hilang dari tabel (misal tanpa nilai pretest/posttest)", () => {
    const t = tabelNilaiPetugas(d, opsi({ kolomNilai: { kelas: false, hadir: false, pretest: false, posttest: false, qc: true, percobaan: false } }))!;
    expect(t.kepala).toEqual(["No", "Nama", "Peran", "QC (percobaan pertama)"]);
    expect(t.baris[0]).toEqual(["1", "Budi Pernandes", "PML", "95,5"]);
  });
  it("saring peran; peran tanpa petugas -> keterangan data kosong", () => {
    expect(tabelNilaiPetugas(d, opsi({ peranNilai: "pml" }))!.baris.length).toBe(2);
    const kosong = { ...d, petugas_nilai: [] };
    expect(tabelNilaiPetugas(kosong, OPSI_AWAL)).toBeNull();
    expect(teksLaporan(susunLaporan(kosong))).toContain("Belum ada data petugas");
  });
});

describe("bacaOpsi (penyimpanan peramban tak tepercaya)", () => {
  it("bawaan untuk masukan rusak; tidak melempar", () => {
    expect(bacaOpsi(null)).toEqual(OPSI_AWAL);
    expect(bacaOpsi("bukan objek")).toEqual(OPSI_AWAL);
    expect(bacaOpsi([1, 2])).toEqual(OPSI_AWAL);
  });
  it("menyaring tipe: hanya boolean/teks sah, urut dan peran tak dikenal -> bawaan, teks dipotong", () => {
    const o = bacaOpsi({ judul: 5, penyusun: "A".repeat(500), bab: { perencanaan: false, x: "ya" }, elemen: { "a.b": true, "c.d": 1 }, kolomNilai: { pretest: false, qc: "x" }, urutNilai: "ngawur", peranNilai: "ppl", catatan: { pelaksanaan: "isi", lain: 7 }, daftarIsi: false, nomorHalaman: "ya" });
    expect(o.judul).toBe("");
    expect(o.penyusun.length).toBe(200);
    expect(o.bab).toEqual({ perencanaan: false });
    expect(o.elemen).toEqual({ "a.b": true });
    expect(o.kolomNilai).toEqual({ kelas: true, hadir: true, pretest: false, posttest: true, qc: true, percobaan: true });
    expect(o.urutNilai).toBe("peran");
    expect(o.peranNilai).toBe("ppl");
    expect(o.catatan).toEqual({ pelaksanaan: "isi" });
    expect(o.daftarIsi).toBe(false);
    expect(o.nomorHalaman).toBe(true);
  });
  it("bolak-balik JSON mempertahankan opsi", () => {
    const o = opsi({ bab: { pelatihan: false }, catatan: { perhatian: "tes" }, urutNilai: "qc", daftarIsi: false });
    expect(bacaOpsi(JSON.parse(JSON.stringify(o)))).toEqual(o);
  });
});

describe("elemenTampil", () => {
  it("centang eksplisit menang; elemen ikut-bab mengikuti bab; lainnya tampil", () => {
    expect(elemenTampil(OPSI_AWAL, { id: "a.b" })).toBe(true);
    expect(elemenTampil(opsi({ elemen: { "a.b": false } }), { id: "a.b" })).toBe(false);
    expect(elemenTampil(opsi({ bab: { pelatihan: false } }), { id: "ringkasan.pelatihan", ikutBab: "pelatihan" })).toBe(false);
    expect(elemenTampil(opsi({ bab: { pelatihan: false }, elemen: { "ringkasan.pelatihan": true } }), { id: "ringkasan.pelatihan", ikutBab: "pelatihan" })).toBe(true);
    expect(elemenTampil(OPSI_AWAL, { id: "x", ikutBab: "lampiranFoto" })).toBe(false);
  });
});

describe("pembantu", () => {
  it("selesaikanRujukan", () => {
    expect(selesaikanRujukan("A.{{ref:x| lihat bagian #.}} B", { x: "3" })).toBe("A. lihat bagian 3. B");
    expect(selesaikanRujukan("A.{{ref:x| lihat bagian #.}} B", {})).toBe("A. B");
  });
  it("kelompokkanElemen menggabungkan butir berdampingan", () => {
    const e = (id: string, butir: string[]): Elemen => ({ id, label: id, jenis: "butir", butir });
    const p: Elemen = { id: "p", label: "p", jenis: "paragraf", teks: "t" };
    const k = kelompokkanElemen([e("a", ["1"]), e("b", ["2", "3"]), p, e("c", ["4"])]);
    expect(k.map((x) => x.jenis)).toEqual(["butir", "lain", "butir"]);
    expect(k[0].jenis === "butir" && k[0].butir).toEqual(["1", "2", "3"]);
  });
  it("paragrafDariTeks dan panjangBatang", () => {
    expect(paragrafDariTeks("a\nb\n\n\n c  \n")).toEqual(["a b", "c"]);
    expect(paragrafDariTeks("   ")).toEqual([]);
    expect(panjangBatang(50, 100, 20)).toBe(10);
    expect(panjangBatang(1, 1000, 20)).toBe(1);
    expect(panjangBatang(0, 100)).toBe(0);
    expect(panjangBatang(5, 0)).toBe(0);
  });
});

describe("htmlLaporan (cetak) dan nama berkas", () => {
  const l = susunLaporan(d);
  it("dokumen HTML dengan daftar isi bertaut; tabel dan grafik ikut", () => {
    const h = htmlLaporan(l, OPSI_AWAL);
    expect(h.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(h).toContain("Daftar isi");
    expect(h).toContain('href="#b-perencanaan"');
    expect(h).toContain("Tabel 4. Capaian pendataan per kecamatan");
    expect(h).toContain("Lampiran A. Nilai per petugas");
    expect(h).toContain("Budi Pernandes");
    expect(htmlLaporan(l, opsi({ daftarIsi: false }))).not.toContain("Daftar isi");
  });
  it("catatan penyusun tampil; teks di-escape", () => {
    const k = susunLaporan(d, opsi({ catatan: { pelaksanaan: "a <b> & c" } }));
    const h = htmlLaporan(k, OPSI_AWAL);
    expect(h).toContain("Catatan penyusun");
    expect(h).toContain("a &lt;b&gt; &amp; c");
    expect(esc('<a href="x">&</a>')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
    const jahat = { ...l, judul: "<script>alert(1)</script>", bagian: [] };
    expect(htmlLaporan(jahat, OPSI_AWAL)).not.toContain("<script>");
  });
  it("nama berkas aman", () => {
    expect(namaBerkasLaporan(l, "2026-10-30")).toBe("Laporan_Sementara_Pendataan_Pascabencana_2026_2026-10-30.docx");
    expect(namaBerkasLaporan({ ...l, nama: "///" }, "", "doc")).toBe("Laporan_Sementara_Pendataan_tanpa_tanggal.doc");
  });
});

describe("berkas Word (.docx)", () => {
  const l = susunLaporan(d, OPSI_AWAL);
  const seimbang = (s: string, tag: string) => (s.match(new RegExp(`<${tag}[ >/]`, "g")) ?? []).length - (s.match(new RegExp(`<${tag}/>`, "g")) ?? []).length === (s.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
  it("memuat daftar isi otomatis, nomor halaman otomatis, dan penanda perbarui field", () => {
    const b = bangunBerkasDocx(l, OPSI_AWAL);
    expect(b["word/document.xml"]).toContain('TOC \\o "1-2" \\h \\z \\u');
    expect(b["word/document.xml"]).toContain('w:footerReference w:type="default" r:id="rIdFooter"');
    expect(b["word/footer1.xml"]).toContain(" PAGE ");
    expect(b["word/footer1.xml"]).toContain(" NUMPAGES ");
    expect(b["word/settings.xml"]).toContain("w:updateFields");
    expect(b["[Content_Types].xml"]).toContain("/word/footer1.xml");
    expect(b["word/_rels/document.xml.rels"]).toContain('Id="rIdFooter"');
  });
  it("judul bab memakai gaya Heading1: satu per bab; daftar isi memuat semua judul", () => {
    const doc = bangunBerkasDocx(l, OPSI_AWAL)["word/document.xml"];
    expect((doc.match(/w:pStyle w:val="Heading1"/g) ?? []).length).toBe(l.bagian.length);
    for (const b of l.bagian) expect(doc).toContain(esc(b.judulTampil ?? "").replace(/&quot;/g, "&quot;"));
    expect((doc.match(/w:pStyle w:val="TOC1"/g) ?? []).length).toBe(l.bagian.length);
  });
  it("tanpa daftar isi / tanpa nomor halaman: bagian itu hilang dari berkas", () => {
    const b = bangunBerkasDocx(susunLaporan(d, opsi({ daftarIsi: false, nomorHalaman: false })), opsi({ daftarIsi: false, nomorHalaman: false }));
    expect(b["word/document.xml"]).not.toContain("TOC \\o");
    expect(b["word/document.xml"]).not.toContain("footerReference");
    expect(b["word/footer1.xml"]).toBeUndefined();
    expect(b["word/settings.xml"]).not.toContain("updateFields");
    expect(b["[Content_Types].xml"]).not.toContain("footer1");
    expect(b["word/_rels/document.xml.rels"]).not.toContain("rIdFooter");
  });
  it("tabel lengkap: jumlah tabel, baris judul berulang, lebar kolom berjumlah lebar isi", () => {
    const doc = bangunBerkasDocx(l, OPSI_AWAL)["word/document.xml"];
    const nTabel = l.bagian.reduce((s, b) => s + b.elemen.filter((e) => e.jenis === "tabel" || e.jenis === "batang").length, 0);
    expect((doc.match(/<w:tbl>/g) ?? []).length).toBe(nTabel);
    expect((doc.match(/<w:tblHeader\/>/g) ?? []).length).toBe(nTabel);
    expect(lebarKolom(["Kecamatan", "Persen"], [["X Koto Singkarak", "62,8"]]).reduce((a, b) => a + b, 0)).toBe(9638);
    const w = lebarKolom(["No", "Nama", "Terdampak"], [["1", "Budi", "3.475"]]);
    expect(w[2]).toBeGreaterThanOrEqual(w[0]);
  });
  it("XML seimbang dan teks berbahaya di-escape", () => {
    const o = opsi({ penyusun: "A & B <x>", catatan: { pelaksanaan: "5 < 6 & \u0001 \"kutip\"" } });
    const b = bangunBerkasDocx(susunLaporan(d, o), o);
    const doc = b["word/document.xml"];
    for (const tag of ["w:p", "w:tbl", "w:tr", "w:tc", "w:r", "w:tblPr", "w:tcPr", "w:body"]) expect(seimbang(doc, tag)).toBe(true);
    expect(doc).not.toContain("<x>");
    expect(doc).toContain("A &amp; B &lt;x&gt;");
    expect(doc).toContain("5 &lt; 6 &amp;");
    expect(doc).not.toContain("\u0001");
    expect(xml("a\u0000b&")).toBe("ab&amp;");
    expect(b["docProps/core.xml"]).toContain("A &amp; B &lt;x&gt;");
  });
  it("laporan kosong (semua bab dimatikan) tetap menghasilkan berkas sah", () => {
    const mati = Object.fromEntries(bangunBagian(d).map((x) => [x.kode, false]));
    const o = opsi({ bab: mati });
    const doc = bangunBerkasDocx(susunLaporan(d, o), o)["word/document.xml"];
    expect(doc).toContain("Belum ada bab yang dipilih");
    expect(seimbang(doc, "w:p")).toBe(true);
  });
  it("dikemas menjadi zip .docx: [Content_Types].xml pertama, tanpa entri folder, dapat dibuka kembali", async () => {
    const byte = (await buatDocx(l, OPSI_AWAL, "uint8array")) as Uint8Array;
    const zip = await JSZip.loadAsync(byte);
    const nama = Object.keys(zip.files);
    expect(nama[0]).toBe("[Content_Types].xml");
    expect(nama.some((n) => n.endsWith("/"))).toBe(false);
    expect(nama).toEqual(expect.arrayContaining(["word/document.xml", "word/styles.xml", "word/numbering.xml", "word/footer1.xml", "word/settings.xml", "docProps/core.xml", "_rels/.rels"]));
    expect(await zip.file("word/document.xml")!.async("string")).toContain("Laporan Sementara Pelaksanaan");
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Lampiran B dengan foto (30 Okt 2026)
// ---------------------------------------------------------------------------------------------------------------------------------
const JPEG_UJI = Uint8Array.from(Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAeACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDPooorhPqAooooAKKKKACiiigAooooAKKKKAP/2Q==", "base64"));
const fotoUji = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 100 + i, ket: `Foto ${i + 1} · Ayu & <Budi> · 21 Okt 2026` }));
const oLamp = opsi({ bab: { lampiranFoto: true } });

describe("Lampiran B dengan foto", () => {
  it("tanpa foto pilihan: kerangka tabel lama; dengan foto: elemen foto menggantikan kerangka", () => {
    const tanpa = susunLaporan(d, oLamp).bagian.find((b) => b.kode === "lampiranFoto")!;
    expect(tanpa.elemen.some((e) => e.jenis === "tabel")).toBe(true);
    expect(tanpa.elemen.some((e) => e.jenis === "foto")).toBe(false);
    const dengan = susunLaporan(d, oLamp, { daftar: fotoUji(5), perBaris: 3 }).bagian.find((b) => b.kode === "lampiranFoto")!;
    const e = dengan.elemen.find((x) => x.jenis === "foto");
    expect(e).toMatchObject({ jenis: "foto", perBaris: 3 });
    expect((e as Extract<Elemen, { jenis: "foto" }>).foto.length).toBe(5);
    expect(dengan.elemen.some((x) => x.jenis === "tabel")).toBe(false);
  });
  it("foto kosong dianggap tanpa foto; bab tetap mati bila tidak dicentang", () => {
    const l = susunLaporan(d, OPSI_AWAL, { daftar: [], perBaris: 2 });
    expect(l.bagian.some((b) => b.kode === "lampiranFoto")).toBe(false);
    expect(susunLaporan(d, OPSI_AWAL, { daftar: fotoUji(2), perBaris: 2 }).bagian.some((b) => b.kode === "lampiranFoto")).toBe(false);
  });
  it("cetak: gambar masuk sebagai data URI, keterangan di-escape, foto tanpa gambar diberi tulisan", () => {
    const l = susunLaporan(d, oLamp, { daftar: fotoUji(3), perBaris: 2 });
    const h = htmlLaporan(l, oLamp, { 100: "data:image/jpeg;base64,AAAA", 101: "data:image/jpeg;base64,BBBB" });
    expect(h).toContain('src="data:image/jpeg;base64,AAAA"');
    expect(h).toContain('src="data:image/jpeg;base64,BBBB"');
    expect((h.match(/\[Foto tidak tersedia\]/g) ?? []).length).toBe(1);
    expect(h).toContain("Ayu &amp; &lt;Budi&gt;");
    expect(h).not.toContain("<Budi>");
  });
  it("daftarFotoDocx: urutan kemunculan tanpa duplikat; mediaDocx hanya yang gambarnya ada", () => {
    const l = susunLaporan(d, oLamp, { daftar: [...fotoUji(3), { id: 100, ket: "ganda" }], perBaris: 2 });
    expect(daftarFotoDocx(l).map((f) => f.id)).toEqual([100, 101, 102]);
    const m = mediaDocx(l, { 100: { jpeg: JPEG_UJI, lebar: 40, tinggi: 30 }, 102: { jpeg: JPEG_UJI, lebar: 40, tinggi: 30 } });
    expect(m.map((x) => x.jalur)).toEqual(["word/media/foto1.jpg", "word/media/foto3.jpg"]);
  });
  it("Word: gambar tertanam (relasi, tipe isi jpg, ukuran EMU proporsional), XML seimbang, keterangan di-escape", () => {
    const l = susunLaporan(d, oLamp, { daftar: fotoUji(5), perBaris: 2 });
    const gambar = Object.fromEntries(fotoUji(5).slice(0, 4).map((f) => [f.id, { jpeg: JPEG_UJI, lebar: 4000, tinggi: 3000 }]));
    const b = bangunBerkasDocx(l, oLamp, undefined, gambar);
    const doc = b["word/document.xml"];
    expect((doc.match(/<wp:inline /g) ?? []).length).toBe(4);
    expect((doc.match(/r:embed="rIdFoto\d+"/g) ?? []).length).toBe(4);
    expect(doc).toContain("[Foto tidak tersedia]");
    expect(doc).toContain("Ayu &amp; &lt;Budi&gt;");
    expect(doc).toContain('xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"');
    expect(b["word/_rels/document.xml.rels"]).toContain('Id="rIdFoto1"');
    expect(b["word/_rels/document.xml.rels"]).toContain('Target="media/foto1.jpg"');
    expect(b["word/_rels/document.xml.rels"]).not.toContain("rIdFoto5");
    expect(b["[Content_Types].xml"]).toContain('Extension="jpg" ContentType="image/jpeg"');
    expect(b["word/styles.xml"]).toContain('w:styleId="Keterangan"');
    // 4:3 dan tidak melebihi kotak (lebar sel 9638/2 - 200 twip = 4619 twip; tinggi 8 cm)
    for (const m of doc.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/g)) {
      const cx = Number(m[1]);
      const cy = Number(m[2]);
      expect(Math.abs(cx / cy - 4 / 3)).toBeLessThan(0.01);
      expect(cx).toBeLessThanOrEqual(4619 * 635);
      expect(cy).toBeLessThanOrEqual(8 * 360000);
    }
    const seimbang = (s: string, tag: string) => (s.match(new RegExp(`<${tag}[ >/]`, "g")) ?? []).length - (s.match(new RegExp(`<${tag}/>`, "g")) ?? []).length === (s.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
    for (const tag of ["w:p", "w:tbl", "w:tr", "w:tc", "w:r", "w:drawing", "wp:inline"]) expect(seimbang(doc, tag)).toBe(true);
    const ids = Array.from(doc.matchAll(/<wp:docPr id="(\d+)"/g)).map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("Word tanpa gambar sama sekali: tidak ada tipe isi jpg dan tidak ada relasi foto", () => {
    const b = bangunBerkasDocx(susunLaporan(d, oLamp, { daftar: fotoUji(2), perBaris: 2 }), oLamp);
    expect(b["[Content_Types].xml"]).not.toContain('Extension="jpg"');
    expect(b["word/_rels/document.xml.rels"]).not.toContain("rIdFoto");
    expect((b["word/document.xml"].match(/\[Foto tidak tersedia\]/g) ?? []).length).toBe(2);
  });
  it("zip .docx memuat berkas media jpeg utuh", async () => {
    const l = susunLaporan(d, oLamp, { daftar: fotoUji(3), perBaris: 3 });
    const byte = (await buatDocx(l, oLamp, "uint8array", { 100: { jpeg: JPEG_UJI, lebar: 40, tinggi: 30 }, 101: { jpeg: JPEG_UJI, lebar: 30, tinggi: 40 } })) as Uint8Array;
    const zip = await JSZip.loadAsync(byte);
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(["word/media/foto1.jpg", "word/media/foto2.jpg"]));
    expect(Object.keys(zip.files)).not.toContain("word/media/foto3.jpg");
    const isi = await zip.file("word/media/foto1.jpg")!.async("uint8array");
    expect(Array.from(isi)).toEqual(Array.from(JPEG_UJI));
    expect(dokumenXml(l, oLamp, {})).toContain("[Foto tidak tersedia]");
  });
});
