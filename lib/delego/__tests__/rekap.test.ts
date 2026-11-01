import { afterEach, describe, expect, it } from "vitest";
import { aturLibur, kapasitasPada } from "../hitung";
import { NAMA_KANTOR, rentangMinggu, rentangTanggal, susunRekap } from "../rekap";
import type { BarisLapangan, Delegasi, Ketersediaan } from "../tipe";

let seq = 0;
const dg = (o: Partial<Delegasi> = {}): Delegasi => ({
  id: ++seq, tahun: 2026, ident_id: null, ro_kode: "2906.BMA.006", judul: "Tugas", uraian: "", penerima_akun: 4, peran_penerima: "pegawai", pj_bidang: "", satuan: "poin",
  target_total: null, target_harian: "30.00", bobot: 1, hari_kerja: [1, 2, 3, 4, 5], mulai: "2026-11-09", tenggat: "2026-11-13", status: "berjalan", alasan: "", ver: 1,
  dibuat_oleh: 354, dibuat_at: "", diubah_at: "", dari_nama: "Ketua", penerima_nama: "Pegawai A", penerima_jenis: "organik", poin_total: "0", lapor_hari: 0, ...o,
});
const lap = (o: Partial<BarisLapangan>): BarisLapangan => ({ akun: 4, tanggal: "2026-11-10", kegiatan_id: 6, kegiatan: "Seruti Triwulan IV 2026", jenis: "pendataan", peran: "pml", ...o });
const cuti = (o: Partial<Ketersediaan>): Ketersediaan => ({ id: ++seq, akun: 4, jenis: "cuti", mulai: "2026-11-11", selesai: "2026-11-11", fraksi: 1, status: "disetujui", catatan: "", ...o });
const orang = [{ akun: 4, nama: "Pegawai A" }, { akun: 5, nama: "Pegawai B" }];
const dasar = { orang, delegasi: [] as Delegasi[], lapangan: [] as BarisLapangan[], ketersediaan: [] as Ketersediaan[], dari: "2026-11-09", sampai: "2026-11-15", namaKegiatan: { 6: "Seruti Triwulan IV 2026", 7: "Pelatihan Petugas Seruti" } };

afterEach(() => aturLibur([]));

describe("rentang", () => {
  it("rentangTanggal tertutup dan dibatasi", () => {
    expect(rentangTanggal("2026-11-09", "2026-11-11")).toEqual(["2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(rentangTanggal("2026-11-09", "2026-11-08")).toEqual([]);
    expect(rentangTanggal("2026-01-01", "2026-12-31", 7)).toHaveLength(7);
  });
  it("rentangMinggu Senin sampai Minggu", () => {
    expect(rentangMinggu("2026-11-11")).toEqual({ dari: "2026-11-09", sampai: "2026-11-15" });
  });
});

describe("susunRekap", () => {
  it("menjumlahkan delegasi dan hari lapangan lintas kegiatan per pegawai", () => {
    const h = susunRekap({
      ...dasar,
      delegasi: [dg({ judul: "Menyusun laporan", kegiatan_id: 6, target_harian: "20.00" }), dg({ judul: "Bukti SAKIP", kegiatan_id: null, target_harian: "10.00" })],
      lapangan: [lap({ tanggal: "2026-11-10" })],
    });
    const a = h.baris.find((b) => b.akun === 4)!;
    const selin = a.sel.find((s) => s.tanggal === "2026-11-10")!;
    expect(selin.poin).toBe(20 + 10 + kapasitasPada("2026-11-10"));
    expect(selin.rincian.map((r) => r.sumber).sort()).toEqual(["delegasi", "delegasi", "lapangan"]);
    const per = Object.fromEntries(a.perKegiatan.map((k) => [k.kegiatan, k.poin]));
    expect(per["Seruti Triwulan IV 2026"]).toBeGreaterThan(per[NAMA_KANTOR]);
    expect(h.kegiatan.map((k) => k.nama)).toContain(NAMA_KANTOR);
    expect(h.kegiatan[h.kegiatan.length - 1].id).toBeNull(); // Pekerjaan kantor terakhir
  });
  it("hari pelatihan dan pendataan pada kegiatan sama tidak dihitung ganda", () => {
    const h = susunRekap({ ...dasar, lapangan: [lap({}), lap({ peran: "ppl" })] });
    expect(h.baris.find((b) => b.akun === 4)!.sel.find((s) => s.tanggal === "2026-11-10")!.poin).toBe(kapasitasPada("2026-11-10"));
  });
  it("pelatihan memakai sumber pelatihan", () => {
    const h = susunRekap({ ...dasar, lapangan: [lap({ tanggal: "2026-11-09", kegiatan_id: 7, kegiatan: "Pelatihan Petugas Seruti", jenis: "pelatihan" })] });
    const s = h.baris.find((b) => b.akun === 4)!.sel.find((x) => x.tanggal === "2026-11-09")!;
    expect(s.rincian[0].sumber).toBe("pelatihan");
    expect(s.kategori).toBe("sasaran");
  });
  it("usulan tidak membebani tetapi tampil sebagai bayangan", () => {
    const h = susunRekap({ ...dasar, delegasi: [dg({ status: "usulan", target_harian: "20.00", kegiatan_id: 6 })] });
    const a = h.baris.find((b) => b.akun === 4)!;
    expect(a.total).toBe(0);
    expect(a.bayangan).toBe(100);
    expect(a.sel.find((s) => s.tanggal === "2026-11-10")!.bayangan).toBe(20);
  });
  it("cuti disetujui mengurangi kapasitas; cuti penuh sepanjang minggu = tidak tersedia; yang masih diajukan hanya ditandai", () => {
    const h = susunRekap({
      ...dasar,
      ketersediaan: [cuti({ mulai: "2026-11-09", selesai: "2026-11-13" }), cuti({ akun: 5, mulai: "2026-11-10", selesai: "2026-11-10", status: "diajukan" }), cuti({ akun: 5, mulai: "2026-11-12", selesai: "2026-11-12", fraksi: 0.5 })],
    });
    const a = h.baris.find((b) => b.akun === 4)!;
    expect(a.kategori).toBe("tidak_tersedia");
    expect(a.sel[0].kapasitas).toBe(0);
    const b = h.baris.find((x) => x.akun === 5)!;
    expect(b.sel[1].kapasitas).toBe(kapasitasPada("2026-11-10")); // diajukan: tidak mengurangi
    expect(b.sel[1].ketersediaan?.status).toBe("diajukan");
    expect(b.sel[3].kapasitas).toBe(Math.round(kapasitasPada("2026-11-12") * 0.5 * 100) / 100); // setengah hari
    expect(h.ringkas.tidakTersedia).toBe(1);
  });
  it("hari libur dan akhir pekan berkapasitas nol; beban di sana ditandai berlebih", () => {
    aturLibur([{ tanggal: "2026-11-11", nama: "Libur uji", aktif: true }]);
    const h = susunRekap({ ...dasar, lapangan: [lap({ tanggal: "2026-11-11" }), lap({ tanggal: "2026-11-14" })] });
    const a = h.baris.find((b) => b.akun === 4)!;
    expect(a.sel.find((s) => s.tanggal === "2026-11-11")!.kapasitas).toBe(0);
    expect(a.sel.find((s) => s.tanggal === "2026-11-11")!.libur).toBe("Libur uji");
    expect(a.sel.find((s) => s.tanggal === "2026-11-11")!.kategori).toBe("berlebih");
    expect(a.sel.find((s) => s.tanggal === "2026-11-14")!.kategori).toBe("berlebih");
    expect(h.adaAkhirPekan).toBe(true);
  });
  it("saringan kegiatan hanya menampilkan beban kegiatan itu", () => {
    const masukan = { ...dasar, delegasi: [dg({ kegiatan_id: 6, target_harian: "20.00" }), dg({ kegiatan_id: null, target_harian: "10.00" })], lapangan: [lap({})] };
    const semua = susunRekap(masukan).baris.find((b) => b.akun === 4)!;
    const seruti = susunRekap({ ...masukan, kegiatan: 6 }).baris.find((b) => b.akun === 4)!;
    const kantor = susunRekap({ ...masukan, kegiatan: "kantor" }).baris.find((b) => b.akun === 4)!;
    expect(semua.total).toBe(seruti.total + kantor.total);
    expect(kantor.total).toBe(50);
    expect(seruti.perKegiatan).toHaveLength(1);
  });
  it("beban di atas 100% dan urutan: yang paling penuh di atas", () => {
    const h = susunRekap({ ...dasar, delegasi: [dg({ penerima_akun: 5, penerima_nama: "Pegawai B", target_harian: "200.00" })], lapangan: [lap({})] });
    expect(h.baris[0].akun).toBe(5);
    expect(h.baris[0].kategori).toBe("berlebih");
    expect(h.ringkas.berlebih).toBe(1);
  });
  it("delegasi selesai, batal, dan ditunda tidak membebani", () => {
    const h = susunRekap({ ...dasar, delegasi: [dg({ status: "selesai" }), dg({ status: "batal" }), dg({ status: "ditunda" })] });
    expect(h.baris.every((b) => b.total === 0)).toBe(true);
  });
  it("nama kegiatan tak dikenal diberi nama bawaan", () => {
    const h = susunRekap({ ...dasar, namaKegiatan: {}, delegasi: [dg({ kegiatan_id: 99, target_harian: "5.00" })] });
    expect(h.kegiatan[0].nama).toBe("Kegiatan 99");
  });
});
