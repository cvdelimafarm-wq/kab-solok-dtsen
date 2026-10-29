import { describe, expect, it } from "vitest";
import {
  bacaBarisLangkah, berjenis, bolehSerahHasil, halanganSelesai, hasilDelegasi, hitungTargetJenis, jamTenggat, jenisKeForm, kemajuanLangkah, keadaanHasil, menitDariPoin,
  periksaJenis, periksaRutin, poinDariJumlah, jumlahDariPoin, rutinBerikutnya, rutinJatuhPada, satuanAngka, statusTenggatJam, tautanButir, teksDurasi, teksJadwalRutin, teksJumlah, tuntas,
  type FormJenis,
} from "../teknis";
import type { Delegasi, HasilKerja, JenisPekerjaan } from "../tipe";

const hs = (o: Partial<HasilKerja>): HasilKerja => ({ id: 1, delegasi_id: 1, nomor: 1, catatan: "", butir: ["x"], status: "diserahkan", catatan_tinjau: "", diserahkan_at: "2026-10-26T02:00:00Z", ditinjau_at: null, ditinjau_nama: null, ...o });

describe("poin dan satuan", () => {
  it("delegasi berjenis memakai poin sebagai satuan angka", () => {
    expect(berjenis({ poin_per_satuan: "9.00" })).toBe(true);
    expect(berjenis({ poin_per_satuan: null })).toBe(false);
    expect(berjenis({})).toBe(false);
    expect(satuanAngka({ poin_per_satuan: 9, satuan: "dokumen" })).toBe("poin");
    expect(satuanAngka({ poin_per_satuan: null, satuan: "ruta" })).toBe("ruta");
    expect(satuanAngka({ poin_per_satuan: null, satuan: "" })).toBe("poin");
  });
  it("konversi jumlah <-> poin", () => {
    expect(poinDariJumlah(9, 3)).toBe(27);
    expect(poinDariJumlah(14, 1.5)).toBe(21);
    expect(jumlahDariPoin(9, 27)).toBe(3);
    expect(jumlahDariPoin(0, 27)).toBe(0);
  });
  it("teks jumlah", () => {
    expect(teksJumlah({ poin_per_satuan: 9, satuan: "dokumen" }, 27)).toBe("3 dokumen (27 poin)");
    expect(teksJumlah({ poin_per_satuan: null, satuan: "ruta" }, 12)).toBe("12 ruta");
  });
  it("perkiraan durasi dari poin (kapasitas 75 poin = 7,5 jam = 1 hari kerja; 1 poin = 6 menit)", () => {
    expect(menitDariPoin(75)).toBe(450);
    expect(menitDariPoin(9)).toBe(54);
    expect(teksDurasi(5)).toBe("30 menit");
    expect(teksDurasi(30)).toBe("3 jam");
    expect(teksDurasi(75)).toBe("1 hari kerja");
  });
});

describe("target dari jumlah (cermin keu_dlg_buat)", () => {
  it("6 berkas x 5 poin selama 5 hari kerja = 6 per hari", () => {
    // 2026-10-26 Senin .. 2026-10-30 Jumat
    const t = hitungTargetJenis(5, 6, "2026-10-26", "2026-10-30", [1, 2, 3, 4, 5]);
    expect(t).toEqual({ total: 30, harian: 6, hariKerja: 5 });
  });
  it("rentang tanpa hari kerja dihitung 1 hari (tidak membagi nol)", () => {
    const t = hitungTargetJenis(5, 2, "2026-10-31", "2026-11-01", [1, 2, 3, 4, 5]); // Sabtu-Minggu
    expect(t).toEqual({ total: 10, harian: 10, hariKerja: 1 });
  });
});

describe("langkah", () => {
  it("kemajuan", () => {
    expect(kemajuanLangkah([])).toEqual({ selesai: 0, total: 0, persen: 0 });
    expect(kemajuanLangkah([{ selesai: true }, { selesai: false }, { selesai: true }])).toEqual({ selesai: 2, total: 3, persen: 67 });
  });
  it("membaca satu langkah per baris, membuang penomoran dan baris kosong", () => {
    const r = bacaBarisLangkah("1. Kumpulkan data\n\n- Analisis capaian\n* Susun rekomendasi\n  \nFinalisasi");
    expect(r.langkah).toEqual(["Kumpulkan data", "Analisis capaian", "Susun rekomendasi", "Finalisasi"]);
    expect(r.galat).toBeNull();
  });
  it("menolak langkah terlalu pendek atau terlalu banyak", () => {
    expect(bacaBarisLangkah("a").galat).toMatch(/2 sampai 150/);
    expect(bacaBarisLangkah(Array.from({ length: 13 }, (_, i) => `Langkah nomor ${i}`).join("\n"), 12).galat).toMatch(/12/);
    expect(bacaBarisLangkah("x".repeat(151)).galat).toMatch(/2 sampai 150/);
  });
});

describe("hasil kerja dan tinjau", () => {
  const perluTinjau = { perlu_hasil: true, perlu_tinjau: true };
  it("keadaan hasil", () => {
    expect(keadaanHasil({ perlu_hasil: false, perlu_tinjau: false }, [])).toBe("tidak_perlu");
    expect(keadaanHasil(perluTinjau, [])).toBe("belum");
    expect(keadaanHasil(perluTinjau, [hs({})])).toBe("menunggu_tinjau");
    expect(keadaanHasil({ perlu_hasil: true, perlu_tinjau: false }, [hs({})])).toBe("diserahkan");
    expect(keadaanHasil(perluTinjau, [hs({ status: "revisi" })])).toBe("perlu_revisi");
    expect(keadaanHasil(perluTinjau, [hs({ status: "revisi" }), hs({ id: 2, nomor: 2, status: "diterima" })])).toBe("diterima");
  });
  it("hasil per delegasi terurut menurut nomor", () => {
    const l = hasilDelegasi([hs({ id: 3, nomor: 2 }), hs({ id: 2, nomor: 1 }), hs({ id: 9, delegasi_id: 5 })], 1);
    expect(l.map((x) => x.nomor)).toEqual([1, 2]);
    expect(hasilDelegasi(undefined, 1)).toEqual([]);
  });
  it("kapan penerima boleh menyerahkan hasil", () => {
    const d = { perlu_hasil: true, status: "berjalan" as const };
    expect(bolehSerahHasil(d, [])).toBe(true);
    expect(bolehSerahHasil(d, [hs({ status: "diserahkan" })])).toBe(false); // menunggu tinjau
    expect(bolehSerahHasil(d, [hs({ status: "revisi" })])).toBe(true);
    expect(bolehSerahHasil(d, [hs({ status: "diterima" })])).toBe(false);
    expect(bolehSerahHasil({ perlu_hasil: false, status: "berjalan" }, [])).toBe(false);
    expect(bolehSerahHasil({ perlu_hasil: true, status: "selesai" }, [])).toBe(false);
  });
  it("halangan menandai selesai (cermin keu_dlg_ubah)", () => {
    expect(halanganSelesai({ perlu_hasil: false, perlu_tinjau: false }, [])).toBeNull();
    expect(halanganSelesai(perluTinjau, [hs({})])).toMatch(/belum diterima/);
    expect(halanganSelesai(perluTinjau, [hs({ status: "diterima" })])).toBeNull();
    expect(halanganSelesai({ perlu_hasil: true, perlu_tinjau: false }, [])).toMatch(/belum diserahkan/);
    expect(halanganSelesai({ perlu_hasil: true, perlu_tinjau: false }, [hs({})])).toBeNull();
  });
  it("tuntas (cermin keu_dlg_tuntas)", () => {
    const d = { id: 1, perlu_hasil: true, tenggat: "2026-10-30" };
    expect(tuntas(d, [], [])).toBe(false);
    expect(tuntas(d, [hs({ status: "revisi" })], [])).toBe(false);
    expect(tuntas(d, [hs({ status: "diserahkan" })], [])).toBe(true);
    const e = { id: 1, perlu_hasil: false, tenggat: "2026-10-30" };
    expect(tuntas(e, [], [{ delegasi_id: 1, tanggal: "2026-10-29" }])).toBe(false);
    expect(tuntas(e, [], [{ delegasi_id: 1, tanggal: "2026-10-30" }])).toBe(true);
  });
  it("tautan hanya http/https", () => {
    expect(tautanButir("https://drive.google.com/x")).toBe("https://drive.google.com/x");
    expect(tautanButir("javascript:alert(1)")).toBeNull();
    expect(tautanButir("berkas final.docx")).toBeNull();
    expect(tautanButir("http://a.b c")).toBeNull();
  });
});

describe("tenggat jam", () => {
  const tw = "2026-10-26T02:00:00+00:00"; // 09:00 WIB
  it("jam WIB dari instan", () => {
    expect(jamTenggat(tw)).toBe("09:00");
    expect(jamTenggat("2026-10-26T17:30:00Z")).toBe("00:30");
    expect(jamTenggat(null)).toBeNull();
    expect(jamTenggat("bukan tanggal")).toBeNull();
  });
  it("status menurut waktu", () => {
    expect(statusTenggatJam({ tenggat_waktu: null }, new Date()).tipe).toBe("tanpa");
    const jauh = statusTenggatJam({ tenggat_waktu: tw }, new Date("2026-10-25T23:00:00Z")); // 3 jam lagi
    expect(jauh.tipe).toBe("jauh");
    const dekat = statusTenggatJam({ tenggat_waktu: tw }, new Date("2026-10-26T01:00:00Z")); // 1 jam lagi
    expect(dekat.tipe).toBe("menjelang");
    expect(dekat.tipe === "menjelang" && dekat.teks).toBe("Tenggat pukul 09:00 WIB, sisa 1 jam");
    const lewat = statusTenggatJam({ tenggat_waktu: tw }, new Date("2026-10-26T02:20:00Z"));
    expect(lewat.tipe).toBe("lewat");
    expect(lewat.tipe === "lewat" && lewat.teks).toBe("Lewat tenggat pukul 09:00 WIB (20 menit lalu)");
    expect(statusTenggatJam({ tenggat_waktu: tw }, new Date("2026-10-26T05:00:00Z"), true).tipe).toBe("tuntas");
  });
  it("tepat saat tenggat dianggap lewat; tepat 2 jam sebelumnya menjelang", () => {
    expect(statusTenggatJam({ tenggat_waktu: tw }, new Date(tw)).tipe).toBe("lewat");
    expect(statusTenggatJam({ tenggat_waktu: tw }, new Date("2026-10-26T00:00:00Z")).tipe).toBe("menjelang");
  });
});

describe("templat berulang", () => {
  const mingguan = { frekuensi: "mingguan" as const, hari: 1, aktif: true, mulai_berlaku: "2026-10-01", berakhir: null };
  const bulanan = { frekuensi: "bulanan" as const, hari: 5, aktif: true, mulai_berlaku: "2026-10-01", berakhir: "2026-12-31" };
  it("teks jadwal", () => {
    expect(teksJadwalRutin(mingguan)).toBe("Setiap Senin");
    expect(teksJadwalRutin(bulanan)).toBe("Setiap tanggal 5");
  });
  it("jatuh pada tanggal", () => {
    expect(rutinJatuhPada(mingguan, "2026-10-26")).toBe(true); // Senin
    expect(rutinJatuhPada(mingguan, "2026-10-27")).toBe(false);
    expect(rutinJatuhPada({ ...mingguan, aktif: false }, "2026-10-26")).toBe(false);
    expect(rutinJatuhPada(mingguan, "2026-09-28")).toBe(false); // sebelum mulai berlaku
    expect(rutinJatuhPada(bulanan, "2026-11-05")).toBe(true);
    expect(rutinJatuhPada(bulanan, "2027-01-05")).toBe(false); // sesudah berakhir
  });
  it("tanggal berikutnya", () => {
    expect(rutinBerikutnya(mingguan, "2026-10-26")).toBe("2026-10-26");
    expect(rutinBerikutnya(mingguan, "2026-10-27")).toBe("2026-11-02");
    expect(rutinBerikutnya(bulanan, "2026-10-06")).toBe("2026-11-05");
    expect(rutinBerikutnya(bulanan, "2027-01-01")).toBeNull();
  });
});

describe("pemeriksaan formulir", () => {
  const f: FormJenis = { kode: "uji_x", nama: "Uji berkas", satuan: "berkas", poin: "5", uraian: "", perluHasil: true, perluTinjau: true, langkah: "Langkah satu\nLangkah dua", urut: "50" };
  it("formulir sah", () => expect(periksaJenis(f, true)).toEqual([]));
  it("kode hanya diperiksa untuk jenis baru", () => {
    expect(periksaJenis({ ...f, kode: "Ab" }, true).length).toBe(1);
    expect(periksaJenis({ ...f, kode: "Ab" }, false)).toEqual([]);
  });
  it("poin harus 0 < p <= 1000, boleh koma desimal", () => {
    expect(periksaJenis({ ...f, poin: "0" }, true).length).toBe(1);
    expect(periksaJenis({ ...f, poin: "1001" }, true).length).toBe(1);
    expect(periksaJenis({ ...f, poin: "9,5" }, true)).toEqual([]);
    expect(periksaJenis({ ...f, poin: "abc" }, true).length).toBe(1);
  });
  it("tinjau tanpa hasil ditolak", () => expect(periksaJenis({ ...f, perluHasil: false }, true)[0]).toMatch(/Tinjau hasil/));
  it("jenis -> form -> jenis kembali sama", () => {
    const j: JenisPekerjaan = { id: 1, kode: "periksa_dokumen", nama: "Memeriksa dokumen", satuan: "dokumen", poin_per_satuan: "9.00", uraian: "u", perlu_hasil: true, perlu_tinjau: false, langkah_bawaan: ["A langkah", "B langkah"], urut: 10, aktif: true };
    const fm = jenisKeForm(j);
    expect(fm.poin).toBe("9");
    expect(fm.langkah).toBe("A langkah\nB langkah");
    expect(periksaJenis(fm, false)).toEqual([]);
  });
  const r = { judul: "Rekap mingguan", kelompok: "TIM-KESRA", jenisId: "1", jumlah: "3", bobot: "1", frekuensi: "mingguan" as const, hari: "1", durasi: "5", hk: [1, 2, 3, 4, 5], mulai: "2026-10-26", berakhir: "", jumlahPenerima: 2 };
  it("templat sah dan batasnya", () => {
    expect(periksaRutin(r)).toEqual([]);
    expect(periksaRutin({ ...r, frekuensi: "bulanan", hari: "29" }).length).toBe(1);
    expect(periksaRutin({ ...r, frekuensi: "mingguan", hari: "8" }).length).toBe(1);
    expect(periksaRutin({ ...r, durasi: "61" }).length).toBe(1);
    expect(periksaRutin({ ...r, berakhir: "2026-10-01" }).length).toBe(1);
    expect(periksaRutin({ ...r, jumlahPenerima: 0 }).length).toBe(1);
    expect(periksaRutin({ ...r, hk: [] }).length).toBe(1);
  });
});

// pastikan tipe Delegasi menerima kolom baru (kompilasi)
const _d: Partial<Delegasi> = { jenis_id: 1, poin_per_satuan: "9.00", perlu_hasil: true, perlu_tinjau: false, insidental: false, tenggat_waktu: null, rutin_id: null, jenis_nama: "x", kelompok_nama: "y" };
void _d;
