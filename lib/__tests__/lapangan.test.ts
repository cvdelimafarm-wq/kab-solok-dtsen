import { describe, expect, it } from "vitest";
import { adaAktivitas, agregatAkhir, alasanAnomali, daftarTim, geserTanggal, jumlahAgregat, jumlahBerhasil, periksaRentang, ringkas, SARINGAN_AWAL, saring, statusLapangan, statusTranslok, urutkan, type BarisLapangan } from "@/lib/lapangan";
import { ATURAN_BAWAAN } from "@/lib/sigap";

// (11 Okt 2026) Uji aturan Monitoring Lapangan: jumlah berhasil, status lapangan/translok, saringan, ringkasan.
const A = ATURAN_BAWAAN; // laporan wajib + 5 foto
const b = (o: Partial<BarisLapangan> = {}): BarisLapangan => ({
  akun_id: 1, nama: "Rina Amelia", peran: "ppl", pml_id: 10, pml_nama: "Ilham", tanggal: "2026-10-11",
  sub_idf: 0, kk_berhasil: 0, kk_tdk_ditemukan: 0, agg_sub: 0, agg_kk: 0, hari_kerja: false, ada_laporan: false, jumlah_foto: 0, ...o,
});

describe("jumlah berhasil & agregat", () => {
  it("PML memakai Sub SLS, PPL memakai KK", () => {
    expect(jumlahBerhasil(b({ peran: "pml", sub_idf: 3, kk_berhasil: 9 }))).toBe(3);
    expect(jumlahBerhasil(b({ peran: "ppl", sub_idf: 3, kk_berhasil: 9 }))).toBe(9);
    expect(jumlahAgregat(b({ peran: "pml", agg_sub: 7, agg_kk: 1 }))).toBe(7);
    expect(jumlahAgregat(b({ peran: "ppl", agg_sub: 7, agg_kk: 1 }))).toBe(1);
  });
});

describe("statusLapangan", () => {
  it("PML = identifikasi, PPL = pendataan, kosong = belum", () => {
    expect(statusLapangan(b({ kk_berhasil: 1 }))).toBe("pendataan");
    expect(statusLapangan(b({ peran: "pml", sub_idf: 2 }))).toBe("identifikasi");
    expect(statusLapangan(b())).toBe("belum");
  });
  it("'tidak ditemukan' tidak dihitung berhasil tetapi tercatat sebagai aktivitas", () => {
    const x = b({ kk_tdk_ditemukan: 2 });
    expect(statusLapangan(x)).toBe("belum");
    expect(adaAktivitas(x)).toBe(true);
  });
  it("PML yang ikut mendata KK tercatat pendataan; identifikasi didahulukan", () => {
    expect(statusLapangan(b({ peran: "pml", kk_berhasil: 5 }))).toBe("pendataan");
    expect(statusLapangan(b({ peran: "pml", kk_berhasil: 5, sub_idf: 2 }))).toBe("identifikasi");
  });
  it("PPL tidak punya identifikasi", () => {
    expect(statusLapangan(b({ sub_idf: 4 }))).toBe("belum");
  });
});

describe("statusTranslok", () => {
  it("tidak ada klaim bila tanpa hari kerja, hasil, laporan, foto", () => {
    expect(statusTranslok(b(), A)).toBe("tidak_ada");
  });
  it("lengkap bila hari kerja + hasil + laporan + foto cukup", () => {
    expect(statusTranslok(b({ hari_kerja: true, ada_laporan: true, jumlah_foto: 5, kk_berhasil: 4 }), A)).toBe("lengkap");
  });
  it("sebagian bila ada hasil tetapi dokumentasi belum memenuhi aturan", () => {
    expect(statusTranslok(b({ hari_kerja: true, ada_laporan: false, jumlah_foto: 5, kk_berhasil: 4 }), A)).toBe("sebagian");
    expect(statusTranslok(b({ hari_kerja: true, ada_laporan: true, jumlah_foto: 3, kk_berhasil: 1 }), A)).toBe("sebagian");
  });
  it("anomali: hasil atau dokumen tanpa hari kerja", () => {
    const x = b({ kk_berhasil: 4 });
    expect(statusTranslok(x, A)).toBe("anomali");
    expect(alasanAnomali(x, A)).toMatch(/hari kerja tidak dipilih/);
    expect(statusTranslok(b({ ada_laporan: true }), A)).toBe("anomali");
    expect(statusTranslok(b({ jumlah_foto: 1 }), A)).toBe("anomali");
  });
  it("anomali: hari kerja tanpa hasil lapangan", () => {
    const x = b({ hari_kerja: true, ada_laporan: true, jumlah_foto: 5 });
    expect(statusTranslok(x, A)).toBe("anomali");
    expect(alasanAnomali(x, A)).toMatch(/belum ada hasil/);
    expect(statusTranslok(b({ hari_kerja: true }), A)).toBe("anomali");
  });
  it("'tidak ditemukan' cukup sebagai aktivitas pada hari kerja", () => {
    expect(statusTranslok(b({ hari_kerja: true, kk_tdk_ditemukan: 1 }), A)).toBe("sebagian");
  });
  it("laporan tidak wajib bila aturan kegiatan tidak mewajibkan", () => {
    const rapat = { ...A, wajib_laporan: false };
    expect(statusTranslok(b({ hari_kerja: true, jumlah_foto: 5, kk_berhasil: 1 }), rapat)).toBe("lengkap");
  });
  it("alasan kosong bila bukan anomali", () => {
    expect(alasanAnomali(b(), A)).toBe("");
  });
});

describe("saring, urutkan, ringkas", () => {
  const data = [
    b({ akun_id: 1, nama: "Rina Amelia", tanggal: "2026-10-10", kk_berhasil: 5, hari_kerja: true, ada_laporan: true, jumlah_foto: 5 }),
    b({ akun_id: 1, nama: "Rina Amelia", tanggal: "2026-10-11" }),
    b({ akun_id: 2, nama: "Budi Hartono", pml_id: 11, pml_nama: "Dewi", tanggal: "2026-10-11", kk_berhasil: 2 }),
    b({ akun_id: 10, nama: "Ilham", peran: "pml", pml_id: 10, pml_nama: "Ilham", tanggal: "2026-10-11", sub_idf: 3 }),
  ];
  it("menyaring peran, tim, nama, tanggal, status", () => {
    expect(saring(data, { ...SARINGAN_AWAL, peran: "pml" }, A)).toHaveLength(1);
    expect(saring(data, { ...SARINGAN_AWAL, pml_id: 10 }, A)).toHaveLength(3);
    expect(saring(data, { ...SARINGAN_AWAL, cari: "  budi  " }, A)).toHaveLength(1);
    expect(saring(data, { ...SARINGAN_AWAL, cari: "dewi" }, A)).toHaveLength(1); // cari lewat nama PML
    expect(saring(data, { ...SARINGAN_AWAL, dari: "2026-10-11" }, A)).toHaveLength(3);
    expect(saring(data, { ...SARINGAN_AWAL, sampai: "2026-10-10" }, A)).toHaveLength(1);
    expect(saring(data, { ...SARINGAN_AWAL, lapangan: "belum" }, A)).toHaveLength(1);
    expect(saring(data, { ...SARINGAN_AWAL, lapangan: "identifikasi" }, A)).toHaveLength(1);
    expect(saring(data, { ...SARINGAN_AWAL, lapangan: "pendataan" }, A)).toHaveLength(2);
    expect(saring(data, { ...SARINGAN_AWAL, translok: "lengkap" }, A)).toHaveLength(1);
  });
  it("urut tanggal terbaru dulu, seri menurut nama", () => {
    const u = urutkan(data, "tanggal", true);
    expect(u[0].tanggal).toBe("2026-10-11");
    expect(u.slice(0, 3).map((x) => x.nama)).toEqual(["Budi Hartono", "Ilham", "Rina Amelia"]);
    expect(urutkan(data, "berhasil", true)[0].nama).toBe("Rina Amelia");
  });
  it("tidak mengubah larik asal", () => {
    const salin = data.map((x) => x.nama);
    urutkan(data, "nama", false);
    expect(data.map((x) => x.nama)).toEqual(salin);
  });
  it("ringkasan menjumlah PML dan PPL terpisah", () => {
    const r = ringkas(data, A);
    expect(r.baris).toBe(4);
    expect(r.orang).toBe(3);
    expect(r.orang_berhasil).toBe(3);
    expect(r.sub_idf).toBe(3);
    expect(r.kk_berhasil).toBe(7);
    expect(r.belum_ada_hasil).toBe(1);
    expect(r.translok.lengkap).toBe(1);
    expect(r.translok.anomali).toBe(2); // Budi & Ilham: ada hasil tanpa hari kerja
    expect(r.translok.tidak_ada).toBe(1);
  });
  it("agregat akhir memakai baris terbaru tiap orang", () => {
    const d = [
      b({ akun_id: 1, tanggal: "2026-10-10", agg_kk: 5 }),
      b({ akun_id: 1, tanggal: "2026-10-11", agg_kk: 9 }),
      b({ akun_id: 2, tanggal: "2026-10-11", agg_kk: 2 }),
      b({ akun_id: 10, peran: "pml", tanggal: "2026-10-11", agg_sub: 6, agg_kk: 99 }),
    ];
    expect(agregatAkhir(d)).toEqual({ sub: 6, kk: 11 });
  });
  it("daftar tim unik dan terurut", () => {
    expect(daftarTim(data)).toEqual([{ id: 11, nama: "Dewi" }, { id: 10, nama: "Ilham" }]);
  });
});

describe("tanggal", () => {
  it("geserTanggal melewati batas bulan", () => {
    expect(geserTanggal("2026-10-01", -1)).toBe("2026-09-30");
    expect(geserTanggal("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("periksaRentang", () => {
    expect(periksaRentang(null, null)).toEqual({ ok: true, dari: null, sampai: null });
    expect(periksaRentang("2026-10-10", "2026-10-11")).toEqual({ ok: true, dari: "2026-10-10", sampai: "2026-10-11" });
    expect(periksaRentang("10-10-2026", null).ok).toBe(false);
    expect(periksaRentang("2026-02-30", null).ok).toBe(false);
    expect(periksaRentang("2026-10-12", "2026-10-11").ok).toBe(false);
  });
});
