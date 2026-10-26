import { describe, expect, it } from "vitest";
import {
  angka, awalMinggu, bebanDelegasiMinggu, bebanPerOrang, hariKe, hariKerjaAntara, hariTanpaLapor, jamWib, hariWib, ringkasHariIni, ringkasTim, saranPembinaan,
  bebanDelegasiHari, KAPASITAS_HARIAN, matriksBebanHarian, skorPenerima, statusLaporanHariIni, targetKumulatif, tglPendek, tindakanDisarankan, usulPemerataan,
} from "../hitung";
import type { Delegasi, Laporan, Penilaian } from "../tipe";

let seq = 0;
const dg = (o: Partial<Delegasi> = {}): Delegasi => ({
  id: ++seq, tahun: 2026, ident_id: 1, ro_kode: "2903.BMA.009", judul: "Tugas", uraian: "", penerima_akun: 4, peran_penerima: "pegawai", pj_bidang: "", satuan: "poin",
  target_total: null, target_harian: "60.00", bobot: 1, hari_kerja: [1, 2, 3, 4, 5], mulai: "2026-10-26", tenggat: "2026-11-13", status: "berjalan", alasan: "", ver: 1,
  dibuat_oleh: 354, dibuat_at: "", diubah_at: "", dari_nama: "Ketua", penerima_nama: "Pegawai A", penerima_jenis: "organik", poin_total: "0", lapor_hari: 0, ...o,
});
const lp = (d: Delegasi, tanggal: string, poin: number, o: Partial<Laporan> = {}): Laporan => ({
  id: ++seq, delegasi_id: d.id, tanggal, poin, uraian: "", kendala: "", bukti: [], dikirim_oleh: d.penerima_akun, mewakili: false, terlambat: false, dikirim_at: "", ...o,
});

describe("tanggal", () => {
  it("hari dalam pekan memakai Senin=1 sampai Minggu=7", () => {
    expect(hariKe("2026-10-26")).toBe(1);
    expect(hariKe("2026-11-01")).toBe(7);
    expect(awalMinggu("2026-10-29")).toBe("2026-10-26");
    expect(awalMinggu("2026-11-01")).toBe("2026-10-26");
  });
  it("menghitung hari kerja pada rentang", () => {
    expect(hariKerjaAntara("2026-10-26", "2026-11-01", [1, 2, 3, 4, 5])).toBe(5);
    expect(hariKerjaAntara("2026-10-26", "2026-11-08", [1, 2, 3, 4, 5])).toBe(10);
    expect(hariKerjaAntara("2026-10-27", "2026-10-26", [1, 2, 3, 4, 5])).toBe(0);
    expect(hariKerjaAntara("2026-10-26", "2026-11-01", [1, 2, 3, 4, 5, 6, 7])).toBe(7);
  });
  it("format dan zona WIB", () => {
    expect(tglPendek("2026-11-05")).toBe("Kam 5 Nov");
    expect(hariWib(new Date("2026-10-26T18:30:00Z"))).toBe("2026-10-27");
    expect(jamWib(new Date("2026-10-26T11:00:00Z"))).toBe(18);
    expect(angka("60.00")).toBe(60);
    expect(angka(null)).toBe(0);
  });
});

describe("target dan hutang", () => {
  it("target kumulatif dibatasi tenggat dan target total", () => {
    const d = dg();
    expect(targetKumulatif(d, "2026-10-28")).toBe(180);
    expect(targetKumulatif(d, "2026-12-31")).toBe(900);
    expect(targetKumulatif(dg({ target_total: "500" }), "2026-12-31")).toBe(500);
  });
  it("hutang kumulatif dan hutang berjalan", () => {
    const d = dg({ poin_total: "50" });
    const r = ringkasHariIni(d, [lp(d, "2026-10-27", 50)], "2026-10-27");
    expect(r.hariKerjaIni).toBe(true);
    expect(r.targetHariIni).toBe(60);
    expect(r.poinHariIni).toBe(50);
    expect(r.sisaHariIni).toBe(10);
    expect(r.hutangKemarin).toBe(60);
    expect(r.hutangBerjalan).toBe(70);
    expect(r.persenSelesai).toBe(6);
  });
  it("kelebihan dicatat bila melampaui target", () => {
    const d = dg({ poin_total: "200" });
    const r = ringkasHariIni(d, [], "2026-10-27");
    expect(r.hutangKemarin).toBe(0);
    expect(r.kelebihan).toBe(140);
  });
});

describe("status laporan harian", () => {
  const d = dg();
  it("belum, perlu pengingat, libur, sudah, tidak berlaku", () => {
    expect(statusLaporanHariIni(d, [], "2026-10-27", 17)).toBe("belum");
    expect(statusLaporanHariIni(d, [], "2026-10-27", 19)).toBe("perlu_pengingat");
    expect(statusLaporanHariIni(d, [], "2026-10-31", 19)).toBe("libur");
    expect(statusLaporanHariIni(d, [lp(d, "2026-10-27", 10)], "2026-10-27", 19)).toBe("sudah");
    expect(statusLaporanHariIni(dg({ status: "batal" }), [], "2026-10-27", 12)).toBe("tidak_berlaku");
    expect(statusLaporanHariIni(d, [], "2026-10-20", 12)).toBe("tidak_berlaku");
  });
  it("hari kerja berturut-turut tanpa laporan melewati akhir pekan", () => {
    const x = dg();
    expect(hariTanpaLapor(x, [lp(x, "2026-10-26", 60)], "2026-10-29")).toBe(2);
    expect(hariTanpaLapor(x, [], "2026-11-02")).toBe(5);
  });
  it("saran tindakan: pengingat dan catatan lisan", () => {
    const x = dg();
    const t = tindakanDisarankan(x, [], "2026-10-29", 19).map((a) => a.jenis);
    expect(t).toContain("pengingat");
    expect(t).toContain("catatan_lisan");
    expect(tindakanDisarankan(dg({ status: "selesai" }), [], "2026-10-29", 19)).toEqual([]);
  });
});

describe("beban dan pemerataan", () => {
  it("beban mingguan menghitung hanya hari kerja dalam masa delegasi", () => {
    expect(bebanDelegasiMinggu(dg(), "2026-10-28")).toBe(300);
    expect(bebanDelegasiMinggu(dg({ mulai: "2026-10-28" }), "2026-10-28")).toBe(180);
    expect(bebanDelegasiMinggu(dg({ status: "selesai" }), "2026-10-28")).toBe(0);
  });
  it("kategori beban per orang", () => {
    const a = dg({ penerima_akun: 4 });
    const b = dg({ penerima_akun: 4 });
    const c = dg({ penerima_akun: 6, penerima_nama: "Pegawai B", target_harian: "56" });
    const o = bebanPerOrang([a, b, c], "2026-10-28");
    expect(o[0].akun).toBe(4);
    expect(o[0].persen).toBe(171); // 600 poin / (70 x 5 = 350)
    expect(o[0].kategori).toBe("berlebih");
    expect(o.find((x) => x.akun === 6)?.persen).toBe(80);
    expect(o.find((x) => x.akun === 6)?.kategori).toBe("sasaran");
  });
  it("usulan pemerataan memindahkan ke yang longgar, mitra hanya untuk PML/PPL", () => {
    const a = dg({ penerima_akun: 4, status: "baru" });
    const b = dg({ penerima_akun: 4 });
    const orang = bebanPerOrang([a, b], "2026-10-28", [{ id: 9, nama: "Pegawai C", jenis: "organik" }, { id: 77, nama: "Mitra X", jenis: "mitra" }]);
    const u = usulPemerataan(orang, [a, b], "2026-10-28");
    expect(u).toHaveLength(1);
    expect(u[0].delegasiId).toBe(a.id);
    expect(u[0].keAkun).toBe(9);
    expect(u[0].sesudahDari).toBe(86); // 300 / 350
    expect(u[0].ver).toBe(a.ver);
    expect(u[0].roKode).toBe("2903.BMA.009");
    expect(u[0].peran).toBe("pegawai");
    const hanyaMitra = bebanPerOrang([a, b], "2026-10-28", [{ id: 77, nama: "Mitra X", jenis: "mitra" }]);
    expect(usulPemerataan(hanyaMitra, [a, b], "2026-10-28")).toEqual([]);
    const p = dg({ penerima_akun: 4, peran_penerima: "ppl" });
    const orang2 = bebanPerOrang([p, b], "2026-10-28", [{ id: 77, nama: "Mitra X", jenis: "mitra" }]);
    expect(usulPemerataan(orang2, [p, b], "2026-10-28")[0].keAkun).toBe(77);
  });
  it("kapasitas harian 70 poin (berlaku 26 Okt 2026)", () => {
    expect(KAPASITAS_HARIAN).toBe(70);
    expect(bebanPerOrang([dg({ target_harian: "70" })], "2026-10-28")[0].persen).toBe(100);
  });
  it("beban harian per delegasi: hanya hari kerja dalam masa delegasi yang berstatus berjalan/baru", () => {
    const d = dg({ mulai: "2026-10-28", hari_kerja: [1, 2, 3, 4, 5] });
    expect(bebanDelegasiHari(d, "2026-10-27")).toBe(0); // sebelum mulai
    expect(bebanDelegasiHari(d, "2026-10-28")).toBe(60);
    expect(bebanDelegasiHari(d, "2026-10-31")).toBe(0); // Sabtu
    expect(bebanDelegasiHari(dg({ status: "selesai" }), "2026-10-28")).toBe(0);
    expect(bebanDelegasiHari(dg({ tenggat: "2026-10-28" }), "2026-10-29")).toBe(0); // lewat tenggat
  });
  it("tabel mingguan: 7 hari Senin-Minggu, jumlah per orang sama dengan beban mingguan, persen terhadap 70", () => {
    const a = dg({ penerima_akun: 4, target_harian: "70" });
    const b = dg({ penerima_akun: 4, target_harian: "35", mulai: "2026-10-28" });
    const orang = bebanPerOrang([a, b], "2026-10-29", [{ id: 9, nama: "Pegawai C", jenis: "organik" }]);
    const m = matriksBebanHarian(orang, [a, b], "2026-10-29");
    expect(m.tanggal).toHaveLength(7);
    expect(m.tanggal[0]).toBe("2026-10-26");
    expect(m.tanggal[6]).toBe("2026-11-01");
    expect(m.adaAkhirPekan).toBe(false);
    const baris4 = m.baris.find((x) => x.akun === 4)!;
    expect(baris4.sel.map((x) => x.poin)).toEqual([70, 70, 105, 105, 105, 0, 0]);
    expect(baris4.sel.map((x) => x.persen)).toEqual([100, 100, 150, 150, 150, 0, 0]);
    expect(baris4.sel[0].kategori).toBe("sasaran");
    expect(baris4.sel[2].kategori).toBe("berlebih");
    expect(baris4.sel[5].kategori).toBe("kosong");
    expect(baris4.sel.reduce((s, x) => s + x.poin, 0)).toBe(orang.find((x) => x.akun === 4)!.beban);
    expect(m.baris.find((x) => x.akun === 9)!.sel.every((x) => x.kategori === "kosong")).toBe(true);
  });
  it("tabel mingguan menandai akhir pekan bila ada beban Sabtu/Minggu", () => {
    const a = dg({ hari_kerja: [1, 2, 3, 4, 5, 6] });
    const m = matriksBebanHarian(bebanPerOrang([a], "2026-10-28"), [a], "2026-10-28");
    expect(m.adaAkhirPekan).toBe(true);
  });
  it("ringkasan tim", () => {
    const a = dg({ poin_total: "60" });
    const b = dg({ penerima_akun: 6 });
    const r = ringkasTim([a, b], [lp(a, "2026-10-27", 60)], "2026-10-27", 19);
    expect(r.aktif).toBe(2);
    expect(r.sudahLapor).toBe(1);
    expect(r.belumLapor).toBe(1);
    expect(r.perluPengingat).toBe(1);
  });
});

describe("pembinaan", () => {
  it("menyarankan langkah bertahap, langkah 5 tidak pernah otomatis", () => {
    expect(saranPembinaan({ hutang: 0, hariTanpaLapor: 0, belumLaporLewatPengingat: true, langkahTerakhir: null })?.langkah).toBe(1);
    expect(saranPembinaan({ hutang: 20, hariTanpaLapor: 0, belumLaporLewatPengingat: false, langkahTerakhir: null })?.langkah).toBe(2);
    expect(saranPembinaan({ hutang: 30, hariTanpaLapor: 0, belumLaporLewatPengingat: false, langkahTerakhir: 2 })?.langkah).toBe(3);
    expect(saranPembinaan({ hutang: 30, hariTanpaLapor: 3, belumLaporLewatPengingat: false, langkahTerakhir: 4 })?.langkah).toBe(4);
    expect(saranPembinaan({ hutang: 5, hariTanpaLapor: 1, belumLaporLewatPengingat: false, langkahTerakhir: null })).toBeNull();
  });
});

describe("skor kinerja", () => {
  const d = dg({ poin_total: "180" });
  const laporan = [lp(d, "2026-10-26", 60), lp(d, "2026-10-27", 60), lp(d, "2026-10-28", 60), lp(d, "2026-10-29", 0, { terlambat: true })];
  it("tanpa penilaian: dua komponen, bobot dinormalkan", () => {
    const s = skorPenerima([d], laporan, [], "2026-10-30");
    expect(s.komponen.find((k) => k.kode === "ketepatan")?.nilai).toBe(75);
    expect(s.komponen.find((k) => k.kode === "capaian")?.nilai).toBe(75);
    expect(s.komponen.find((k) => k.kode === "kualitas")?.nilai).toBeNull();
    expect(s.total).toBe(75);
  });
  it("dengan penilaian bulan terbaru", () => {
    const n: Penilaian[] = [{ ro_kode: "2903.BMA.009", periode: "2026-10-01", kualitas: 80, kepatuhan: 60, catatan: "" }];
    expect(skorPenerima([d], laporan, n, "2026-10-30").total).toBe(73);
  });
  it("tanpa data sama sekali: null", () => {
    expect(skorPenerima([], [], [], "2026-10-30").total).toBeNull();
  });
});
