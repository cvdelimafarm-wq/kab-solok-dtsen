import { describe, expect, it } from "vitest";
import {
  argsUnggahBaru, argsUnggahIsi, bandingRo, calonPadan, kemiripan, kesiapanTerima, nomorRevisiBerikut, periksaAlasanTolak, periksaIsianUnggah,
  ringkasPerRo, unggahKosong, argsTandai, argsTandaiSemua, catatanBaris, cocokSaringan, hitungSaringan, perluKeputusan, selisihUsulan, teksKeputusan,
  type BarisBanding, type BarisRinci, type BerkasPdf, type KeputusanUnggah, type PokBerlaku, type RingkasUnggah,
} from "../pok";
import type { HasilUrai } from "../rkks";

const berlaku: PokBerlaku = { id: 3, tahun: 2026, nomor_revisi: 4, nomor_pok: "POK-4", tanggal_efektif: "2026-09-01" };
const utuh: HasilUrai = { baris: [{} as never], alokasi: 100, total: 100, tidakCocok: [], hargaTidakCocok: 0, peringatan: [], nHalaman: 1 };
const berkas = (h: Partial<HasilUrai> = {}, ukuran = 1000): BerkasPdf => ({ nama: "DIPA 4.pdf", ukuran, hash: "ab".repeat(32), hasil: { ...utuh, ...h } });
const isian = { nomorRevisi: "5", nomorPok: " POK-5 ", tanggal: "2026-10-12", jadwal: "" };

const bb = (o: Partial<BarisBanding>): BarisBanding => ({
  unggah_id: 1, status: "sama", baris_id: 1, detail_id: 1, ro_kode: "2904.BMA.006", komp_kode: "051", akun_kode: "521211",
  uraian_lama: "Belanja bahan", uraian_baru: "Belanja bahan", vol_lama: 1, vol_baru: 1, harga_lama: 100, harga_baru: 100, jumlah_lama: 100, jumlah_baru: 100,
  selisih: 0, di_luar_usulan: false, ...o,
});

describe("isian unggah", () => {
  it("nomor revisi bawaan = berlaku + 1", () => {
    expect(nomorRevisiBerikut(berlaku)).toBe(5);
    expect(nomorRevisiBerikut(null)).toBe(1);
    expect(unggahKosong(berlaku).nomorRevisi).toBe("5");
  });
  it("lolos bila lengkap", () => {
    expect(periksaIsianUnggah(berkas(), isian, berlaku, 2026)).toEqual([]);
  });
  it("menolak tanpa berkas, nomor lama, tanggal kosong, tahun lain, berkas tak utuh", () => {
    expect(periksaIsianUnggah(null, isian, berlaku, 2026)).toHaveLength(1);
    expect(periksaIsianUnggah(berkas(), { ...isian, nomorRevisi: "4" }, berlaku, 2026).join()).toMatch(/lebih besar/);
    expect(periksaIsianUnggah(berkas(), { ...isian, tanggal: "" }, berlaku, 2026).join()).toMatch(/Tanggal efektif/);
    expect(periksaIsianUnggah(berkas(), { ...isian, tanggal: "2025-10-12" }, berlaku, 2026).join()).toMatch(/tahun anggaran/);
    expect(periksaIsianUnggah(berkas({ alokasi: null }), isian, berlaku, 2026).join()).toMatch(/pemeriksaan/);
    expect(periksaIsianUnggah(berkas({ tidakCocok: [{ tingkat: "ro", kode: "x", nama: "x", tertulis: 1, dihitung: 2 }] }), isian, berlaku, 2026).join()).toMatch(/pemeriksaan/);
    expect(periksaIsianUnggah(berkas({}, 41 * 1024 * 1024), isian, berlaku, 2026).join()).toMatch(/40 MB/);
  });
  it("menyusun argumen tanpa p_akun", () => {
    const a = argsUnggahBaru(2026, isian, berkas());
    expect(a).toMatchObject({ p_tahun: 2026, p_nomor: 5, p_nomor_pok: "POK-5", p_tanggal: "2026-10-12", p_jadwal: null });
    expect("p_akun" in a).toBe(false);
    expect(argsUnggahBaru(2026, { ...isian, nomorPok: "", jadwal: "7" }, berkas())).toMatchObject({ p_nomor_pok: null, p_jadwal: 7 });
    expect(argsUnggahIsi(9, [])).toEqual({ p_unggah: 9, p_baris: [] });
  });
  it("alasan tolak minimal 5 huruf", () => {
    expect(periksaAlasanTolak("  ab ")).not.toBeNull();
    expect(periksaAlasanTolak("salah berkas")).toBeNull();
  });
});

describe("banding", () => {
  const data = [
    bb({}),
    bb({ status: "berubah", baris_id: 2, selisih: 500, di_luar_usulan: true }),
    bb({ ro_kode: "2904.BMA.007", status: "baru", baris_id: 3, detail_id: null, uraian_baru: "Honor narasumber kegiatan", jumlah_baru: 900, jumlah_lama: null, selisih: 900 }),
    bb({ ro_kode: "2904.BMA.007", status: "hilang", baris_id: null, detail_id: 8, uraian_lama: "Honor narasumber", jumlah_lama: 900, jumlah_baru: null, selisih: -900 }),
    bb({ ro_kode: "2904.BMA.007", status: "hilang", baris_id: null, detail_id: 9, uraian_lama: "Sewa mobil", jumlah_lama: 300, jumlah_baru: null, selisih: -300 }),
    bb({ ro_kode: "2904.BMA.008" }),
  ];
  it("meringkas per RO dan menandai yang beda", () => {
    const r = ringkasPerRo(data);
    expect(r.map((x) => x.ro)).toEqual(["2904.BMA.006", "2904.BMA.007", "2904.BMA.008"]);
    const a = r.find((x) => x.ro === "2904.BMA.006")!;
    expect(a).toMatchObject({ sama: 1, berubah: 1, selisih: 500, diLuarUsulan: 1, beda: true });
    expect(r.find((x) => x.ro === "2904.BMA.008")!.beda).toBe(false);
  });
  it("daftar RO menyembunyikan baris sama kecuali diminta", () => {
    expect(bandingRo(data, "2904.BMA.006")).toHaveLength(1);
    expect(bandingRo(data, "2904.BMA.006", true)).toHaveLength(2);
  });
  it("calon padanan: hanya 'hilang' RO sama, terbaik dulu", () => {
    const baru = data[2];
    const c = calonPadan(baru, data);
    expect(c.map((x) => x.baris.detail_id)).toEqual([8, 9]);
    expect(c[0].skor).toBeGreaterThan(c[1].skor);
    expect(calonPadan(data[1], data)).toEqual([]);
  });
  it("kemiripan", () => {
    expect(kemiripan("Honor narasumber", "Honor narasumber")).toBe(1);
    expect(kemiripan("abc def", "xyz")).toBe(0);
    expect(kemiripan(null, "a b")).toBe(0);
  });
});

describe("kesiapan terima", () => {
  const r: RingkasUnggah = {
    unggah_id: 1, tahun: 2026, nomor_revisi: 5, status: "diunggah", n_baris: 100, total_unggah: 1000, total_berlaku: 1000, n_sama: 90, n_berubah: 10, n_dipadankan: 0,
    n_baru: 0, n_hilang: 0, n_di_luar_usulan: 0, n_ro_tak_terdaftar: 0,
  };
  it("siap tanpa peringatan", () => {
    expect(kesiapanTerima(r, 100)).toEqual({ blok: null, peringatan: [] });
  });
  it("memblokir", () => {
    expect(kesiapanTerima(null, 1).blok).not.toBeNull();
    expect(kesiapanTerima({ ...r, status: "diterima" }, 100).blok).toMatch(/diputuskan/);
    expect(kesiapanTerima(r, 0).blok).toMatch(/belum berisi/);
    expect(kesiapanTerima({ ...r, n_ro_tak_terdaftar: 2 }, 100).blok).toMatch(/2 RO/);
  });
  it("memperingatkan total berbeda, di luar usulan, baru/hilang", () => {
    const k = kesiapanTerima({ ...r, total_unggah: 1100, n_di_luar_usulan: 3, n_baru: 2, n_hilang: 1 }, 100);
    expect(k.blok).toBeNull();
    expect(k.peringatan).toHaveLength(3);
  });
  it("revisi POK/administrasi memblokir total berbeda; jenis DIPA hanya memperingatkan", () => {
    const beda = { ...r, total_unggah: 900 };
    expect(kesiapanTerima(beda, 100, "pok").blok).toMatch(/mempertahankan pagu/);
    expect(kesiapanTerima(beda, 100, "administrasi").blok).toMatch(/administrasi/);
    expect(kesiapanTerima(beda, 100, "dipa_dja").blok).toBeNull();
    expect(kesiapanTerima(r, 100, "pok").blok).toBeNull();
  });
});


describe("papan 6: usulan dan keputusan operator", () => {
  const r = (o: Partial<BarisRinci>): BarisRinci => ({
    ...bb({}), jadwal_id: 7, kunci: "2904.BMA.006/051/521211/belanja bahan#1", kunci_padan: null, jumlah_usulan: null, sesuai_usulan: null,
    tanda: "belum", tanda_catatan: "", otomatis: false, ...o,
  });
  const sama = r({ status: "sama", otomatis: true });
  const berubahSesuai = r({ status: "berubah", jumlah_baru: 1500, jumlah_usulan: 1500, sesuai_usulan: true, otomatis: true });
  const berubahBeda = r({ status: "berubah", jumlah_lama: 11660000, jumlah_baru: 11659000, jumlah_usulan: 11660000, sesuai_usulan: false });
  const berubahTanpaUsulan = r({ status: "berubah", jumlah_usulan: null, sesuai_usulan: false });
  const baruSesuai = r({ status: "baru", sesuai_usulan: true, otomatis: true, jumlah_usulan: 100 });
  const baruLuar = r({ status: "baru", sesuai_usulan: false });
  const hilangSesuai = r({ status: "hilang", sesuai_usulan: true, otomatis: true, jumlah_usulan: 0 });
  const hilangLuar = r({ status: "hilang", sesuai_usulan: false });
  const padan = r({ status: "dipadankan", otomatis: true, kunci_padan: "lama#1" });
  const semua = [sama, berubahSesuai, berubahBeda, berubahTanpaUsulan, baruSesuai, baruLuar, hilangSesuai, hilangLuar, padan];

  it("perlu keputusan = bukan sama, tidak otomatis, belum 'pakai'", () => {
    expect(semua.filter(perluKeputusan)).toEqual([berubahBeda, berubahTanpaUsulan, baruLuar, hilangLuar]);
    expect(perluKeputusan({ ...berubahBeda, tanda: "pakai" })).toBe(false);
    expect(perluKeputusan({ ...berubahBeda, tanda: "ditanyakan" })).toBe(true);
  });
  it("saringan dan hitungan konsisten", () => {
    const h = hitungSaringan(semua);
    expect(h).toEqual({ perlu: 4, semua: 9, sama: 1, berubah: 3, baru: 2, hilang: 2, dipadankan: 1, luar: 4 });
    for (const s of ["perlu", "semua", "sama", "berubah", "baru", "hilang", "dipadankan", "luar"] as const) {
      expect(semua.filter((b) => cocokSaringan(b, s))).toHaveLength(h[s]);
    }
  });
  it("selisih terhadap usulan hanya bila ada pembanding dan bukan baris hilang", () => {
    expect(selisihUsulan(berubahBeda)).toBe(-1000);
    expect(selisihUsulan(berubahTanpaUsulan)).toBeNull();
    expect(selisihUsulan(hilangSesuai)).toBeNull();
  });
  it("catatan menjelaskan alasan status", () => {
    expect(catatanBaris(sama)).toBe("");
    expect(catatanBaris(berubahSesuai)).toMatch(/sama dengan usulan/);
    expect(catatanBaris(berubahBeda)).toMatch(/beda Rp 1\.000 dari usulan/);
    expect(catatanBaris(berubahTanpaUsulan)).toMatch(/tidak ada baris usulan/);
    expect(catatanBaris(baruSesuai)).toMatch(/kunci baris baru diberikan/);
    expect(catatanBaris(baruLuar)).toMatch(/tidak ada dalam usulan/);
    expect(catatanBaris(hilangSesuai)).toMatch(/sesuai usulan/);
    expect(catatanBaris(hilangLuar)).toMatch(/tidak dikosongkan/);
    expect(catatanBaris(padan)).toMatch(/lama#1/);
    expect(catatanBaris(r({ status: "berubah", jadwal_id: null }))).toMatch(/POK sistem/);
    expect(catatanBaris(r({ status: "hilang", jadwal_id: null }))).toBe("tidak ada pada berkas");
  });
  it("teks keputusan", () => {
    expect(teksKeputusan(sama)).toBe("Tidak perlu");
    expect(teksKeputusan(baruSesuai)).toBe("Kunci baris baru diberikan");
    expect(teksKeputusan(hilangSesuai)).toBe("Diterima otomatis");
    expect(teksKeputusan(padan)).toBe("Dipadankan PPK");
    expect(teksKeputusan(berubahBeda)).toBe("Menunggu keputusan operator");
    expect(teksKeputusan({ ...berubahBeda, tanda: "pakai" })).toBe("Pakai angka berkas");
    expect(teksKeputusan({ ...berubahBeda, tanda: "ditanyakan" })).toBe("Ditanyakan");
  });
  it("argumen tanpa p_akun", () => {
    expect(argsTandai(3, "k#1", "ditanyakan", "tanya")).toEqual({ p_unggah: 3, p_kunci: "k#1", p_tanda: "ditanyakan", p_catatan: "tanya" });
    expect(argsTandaiSemua(3)).toEqual({ p_unggah: 3 });
  });
  it("kesiapan terima memperhitungkan keputusan operator", () => {
    const ring: RingkasUnggah = { unggah_id: 1, tahun: 2026, nomor_revisi: 5, status: "diunggah", n_baris: 10, total_unggah: 100, total_berlaku: 100, n_sama: 10, n_berubah: 0, n_dipadankan: 0, n_baru: 0, n_hilang: 0, n_di_luar_usulan: 0, n_ro_tak_terdaftar: 0 };
    const k = (o: Partial<KeputusanUnggah>): KeputusanUnggah => ({ unggah_id: 1, n_otomatis: 0, n_menunggu: 0, n_pakai: 0, n_ditanyakan: 0, n_di_luar_usulan: 0, ...o });
    expect(kesiapanTerima(ring, 10, null, k({}))).toEqual({ blok: null, peringatan: [] });
    expect(kesiapanTerima(ring, 10, null, k({ n_ditanyakan: 2 })).blok).toMatch(/2 baris masih ditandai ditanyakan/);
    expect(kesiapanTerima(ring, 10, null, k({ n_menunggu: 3 })).peringatan.join()).toMatch(/3 baris selisih belum diputuskan/);
    expect(kesiapanTerima(ring, 10, null, null)).toEqual({ blok: null, peringatan: [] });
  });
});
