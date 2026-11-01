import { describe, expect, it } from "vitest";
import { angkaCapaian, galatJawaban, galatKeputusan, galatPutusan, keteranganCapaian, lewatBatasTinjau, poinEfektif, rasioSanggahDitolak, ringkasMonitor, sisaHariJawab, statusButir } from "../tinjau";
import type { CapaianPegawai, Monitor, StatusTinjau } from "../tipe";

const cap = (o: Partial<CapaianPegawai> = {}): CapaianPegawai => ({ akun: 1, nama: "A", mandiri: "100.00", terverifikasi: "90.00", disanggah: "0", belum: "10.00", tidak_diakui: "0", dikoreksi: "0", n_laporan: 5, ...o });
const lp = (delegasi_id: number, tanggal: string, tinjau_status: StatusTinjau) => ({ delegasi_id, tanggal, tinjau_status });

describe("aturan isian", () => {
  it("tolak minimal 5 huruf dan sanggah minimal 20 huruf", () => {
    expect(galatKeputusan("setuju", "")).toBeNull();
    expect(galatKeputusan("tolak", "x")).toContain("5");
    expect(galatKeputusan("tolak", "kurang bukti")).toBeNull();
    expect(galatKeputusan("sanggah", "terlalu pendek")).toContain("20");
    expect(galatKeputusan("sanggah", "Dokumen belum diterima PML pada tanggal laporan")).toBeNull();
  });
  it("jawaban minimal 10 huruf", () => {
    expect(galatJawaban("pendek")).toContain("10");
    expect(galatJawaban("Sudah saya serahkan Senin")).toBeNull();
  });
  it("putusan sebagian wajib menyebut poin yang diakui di bawah poin laporan", () => {
    const c = "Dua dokumen terbukti diterima";
    expect(galatPutusan("benar", 16, "", c)).toBeNull();
    expect(galatPutusan("salah", 16, "", "singkat")).toContain("10");
    expect(galatPutusan("sebagian", 16, "", c)).toContain("0 sampai kurang dari 16");
    expect(galatPutusan("sebagian", 16, "16", c)).not.toBeNull();
    expect(galatPutusan("sebagian", 16, "-1", c)).not.toBeNull();
    expect(galatPutusan("sebagian", 16, "abc", c)).not.toBeNull();
    expect(galatPutusan("sebagian", 16, "8,5", c)).toBeNull();
    expect(galatPutusan("sebagian", 16, "0", c)).toBeNull();
  });
});

describe("poinEfektif", () => {
  it("disetujui memakai poin diakui, tidak diakui nol, lainnya apa adanya", () => {
    expect(poinEfektif({ poin: "16", tinjau_status: "disetujui", poin_diakui: "8" })).toBe(8);
    expect(poinEfektif({ poin: "16", tinjau_status: "disetujui", poin_diakui: null })).toBe(16);
    expect(poinEfektif({ poin: "16", tinjau_status: "tidak_diakui", poin_diakui: "0" })).toBe(0);
    expect(poinEfektif({ poin: 16, tinjau_status: "menunggu" })).toBe(16);
  });
});

describe("statusButir", () => {
  const d = (status: "usulan" | "baru" | "berjalan" | "selesai" | "batal" | "ditunda", terhalang: string | null = null) => ({ id: 1, status, terhalang_oleh: terhalang });
  it("usulan, selesai, batal, ditunda mengalahkan segalanya", () => {
    expect(statusButir(d("usulan"), [lp(1, "2026-11-02", "disanggah")])).toBe("usulan");
    expect(statusButir(d("selesai"), [lp(1, "2026-11-02", "disanggah")])).toBe("selesai");
    expect(statusButir(d("batal"), [])).toBe("batal");
    expect(statusButir(d("ditunda"), [])).toBe("ditunda");
  });
  it("urutan: disanggah, perlu revisi, menunggu tinjau, terhalang, dasar", () => {
    expect(statusButir(d("berjalan", "PBJ"), [lp(1, "2026-11-02", "disanggah"), lp(1, "2026-11-03", "ditolak")])).toBe("disanggah");
    expect(statusButir(d("berjalan", "PBJ"), [lp(1, "2026-11-03", "ditolak")])).toBe("perlu_revisi");
    expect(statusButir(d("berjalan", "PBJ"), [lp(1, "2026-11-02", "disetujui"), lp(1, "2026-11-03", "menunggu")])).toBe("menunggu_tinjau");
    expect(statusButir(d("berjalan", "PBJ"), [lp(1, "2026-11-02", "menunggu"), lp(1, "2026-11-03", "disetujui")])).toBe("terhalang");
    expect(statusButir(d("berjalan"), [lp(1, "2026-11-03", "disetujui")])).toBe("berjalan");
    expect(statusButir(d("baru"), [])).toBe("baru");
  });
  it("laporan delegasi lain diabaikan", () => {
    expect(statusButir(d("berjalan"), [lp(2, "2026-11-03", "disanggah")])).toBe("berjalan");
  });
});

describe("batas waktu", () => {
  it("lewat 3 hari kerja", () => {
    expect(lewatBatasTinjau(3)).toBe(false);
    expect(lewatBatasTinjau(4)).toBe(true);
  });
  it("sisa hari jawab", () => {
    expect(sisaHariJawab("2026-11-06", "2026-11-04")).toBe(2);
    expect(sisaHariJawab("2026-11-06", "2026-11-09")).toBe(-3);
  });
});

describe("monitoring", () => {
  it("tiga angka dan selisihnya", () => {
    const a = angkaCapaian(cap());
    expect(a.mandiri).toBe(100);
    expect(a.terverifikasi).toBe(90);
    expect(a.selisih).toBe(10);
  });
  it("keterangan terpenting per pegawai", () => {
    expect(keteranganCapaian(angkaCapaian(cap({ belum: "0", terverifikasi: "100" })))).toBe("sesuai");
    expect(keteranganCapaian(angkaCapaian(cap()))).toBe("menunggu_tinjau");
    expect(keteranganCapaian(angkaCapaian(cap({ dikoreksi: "5" })))).toBe("dikoreksi");
    expect(keteranganCapaian(angkaCapaian(cap({ tidak_diakui: "4", dikoreksi: "5" })))).toBe("tidak_diakui");
    expect(keteranganCapaian(angkaCapaian(cap({ disanggah: "16", tidak_diakui: "4" })))).toBe("disanggah");
  });
  it("ringkasan monitor", () => {
    const m: Monitor = {
      hari_ini: "2026-11-05", dari: "2026-11-01", sampai: "2026-11-05", pemutus: true, capaian: [],
      peninjau: [{ akun: 1, nama: "A", menunggu: 6, lewat3: 2, sanggah_diajukan: 2, sanggah_ditolak: 1 }, { akun: 2, nama: "B", menunggu: 3, lewat3: 2, sanggah_diajukan: 0, sanggah_ditolak: 0 }],
      terhalang: [{ oleh: "PBJ", jumlah: 2 }, { oleh: "Tim Produksi", jumlah: 3 }],
      tepat_waktu: { selesai: 8, tepat: 7 }, usulan: { menunggu: 2, lewat3: 1 },
      sanggah: [{ id: 1, status: "menunggu_putusan", penerima_akun: 1, penerima_nama: "A", judul: "J", ro_kode: "R", tanggal: "2026-11-02", poin: 16, uraian: "", alasan: "x", pengaju_nama: "K", diajukan_at: "", batas_jawab: "2026-11-06", jawaban: "y", dijawab_at: "", putusan: null, poin_diakui: null, catatan_putusan: "" },
        { id: 2, status: "diputus", penerima_akun: 1, penerima_nama: "A", judul: "J", ro_kode: "R", tanggal: "2026-10-02", poin: 16, uraian: "", alasan: "x", pengaju_nama: "K", diajukan_at: "", batas_jawab: "2026-10-06", jawaban: "y", dijawab_at: "", putusan: "benar", poin_diakui: 16, catatan_putusan: "" }],
    };
    const r = ringkasMonitor(m);
    expect(r.tepatPersen).toBe(88);
    expect(r.lewat3).toBe(4);
    expect(r.menungguTinjau).toBe(9);
    expect(r.sanggahTerbuka).toBe(1);
    expect(r.sanggahMenungguPutusan).toBe(1);
    expect(r.terhalang).toBe(5);
    expect(r.usulanMenunggu).toBe(2);
    expect(ringkasMonitor({ ...m, tepat_waktu: { selesai: 0, tepat: 0 } }).tepatPersen).toBeNull();
  });
  it("rasio sanggah ditolak", () => {
    expect(rasioSanggahDitolak(0, 0)).toBeNull();
    expect(rasioSanggahDitolak(4, 1)).toBe(25);
  });
});
