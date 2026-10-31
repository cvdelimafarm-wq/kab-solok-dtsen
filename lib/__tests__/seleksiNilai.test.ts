import { describe, expect, it } from "vitest";
import type { WilayahSeleksi } from "../seleksiSyarat";
import { grupPeserta, kuotaGrup, levelEfektif, nilaiJarak, nilaiRekamJejak, periksaJadwalTes, periksaVariabel, pesanPengumuman, putusanKonfirmasi, skorAkhir, statusTesSeleksi, susunPeringkat, VARIABEL_BAWAAN } from "../seleksiNilai";

const w = (o: Partial<WilayahSeleksi>): WilayahSeleksi => ({ kode: "k", nama: "W1", kecamatan: "KUBUNG", nagari: "SELAYO", lat: null, lng: null, jumlah_sampel: 10, kebutuhan_ppl: 2, kebutuhan_pml: 1, ...o });

describe("periksaVariabel", () => {
  it("menerima bawaan dan variabel kustom", () => {
    const r = periksaVariabel([...VARIABEL_BAWAAN, { nama: "Wawancara PJ", sumber: "manual", bobot: 10 }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nilai.map((v) => v.kode)).toEqual(["tes", "rekam_jejak", "jarak", "wawancara_pj"]);
  });
  it("menolak: kosong, bobot salah, sumber otomatis ganda, sumber asing", () => {
    expect(periksaVariabel([]).ok).toBe(false);
    expect(periksaVariabel([{ nama: "A", sumber: "manual", bobot: 0 }]).ok).toBe(false);
    expect(periksaVariabel([{ nama: "A", sumber: "tes", bobot: 5 }, { nama: "B", sumber: "tes", bobot: 5 }]).ok).toBe(false);
    expect(periksaVariabel([{ nama: "A", sumber: "xx", bobot: 5 }]).ok).toBe(false);
    expect(periksaVariabel("bukan").ok).toBe(false);
  });
  it("dua variabel manual bernama sama tetap berkode unik", () => {
    const r = periksaVariabel([{ nama: "Uji", sumber: "manual", bobot: 5 }, { nama: "Uji", sumber: "manual", bobot: 5 }]);
    expect(r.ok && new Set(r.nilai.map((v) => v.kode)).size).toBe(2);
  });
});

describe("nilai otomatis", () => {
  it("rekam jejak 1-5 -> 0-100", () => {
    expect(nilaiRekamJejak(5)).toBe(100);
    expect(nilaiRekamJejak(4)).toBe(80);
    expect(nilaiRekamJejak(null)).toBeNull();
    expect(nilaiRekamJejak(0)).toBeNull();
    expect(nilaiRekamJejak(6)).toBeNull();
  });
  it("jarak makin dekat makin tinggi", () => {
    expect(nilaiJarak(0, 10)).toBe(100);
    expect(nilaiJarak(2.5, 10)).toBe(75);
    expect(nilaiJarak(15, 10)).toBe(0);
    expect(nilaiJarak(null, 10)).toBeNull();
    expect(nilaiJarak(3, 0)).toBeNull();
  });
});

describe("skorAkhir", () => {
  const v = [{ id: 1, bobot: 40 }, { id: 2, bobot: 40 }, { id: 3, bobot: 20 }];
  it("rata-rata berbobot", () => {
    expect(skorAkhir(v, new Map([[1, 80], [2, 100], [3, 50]])).skor).toBe(82);
  });
  it("nilai kosong dihitung 0 dan dicatat", () => {
    const r = skorAkhir(v, new Map([[1, 100], [2, null]]));
    expect(r.skor).toBe(40);
    expect(r.kosong).toEqual([2, 3]);
  });
  it("tanpa variabel -> 0", () => expect(skorAkhir([], new Map()).skor).toBe(0));
});

describe("grup dan kuota", () => {
  const wil = [w({ nama: "A", kecamatan: "KUBUNG", nagari: "SELAYO", kebutuhan_ppl: 2, kebutuhan_pml: 1 }), w({ nama: "B", kecamatan: "KUBUNG", nagari: "KOTO BARU", kebutuhan_ppl: 1, kebutuhan_pml: 0 }), w({ nama: "C", kecamatan: "GUNUNG TALANG", nagari: "BATANG BARUS", kebutuhan_ppl: 3, kebutuhan_pml: 1 })];
  it("domisili di wilayah bersampel -> grup domisili", () => {
    expect(grupPeserta("kecamatan", { kecamatan: "Kubung", nagari: null }, wil, null)).toBe("KUBUNG");
  });
  it("domisili tanpa sampel -> wilayah terdekat; tanpa keduanya -> domisili; kosong -> tanpa wilayah", () => {
    expect(grupPeserta("kecamatan", { kecamatan: "X Koto", nagari: null }, wil, "C")).toBe("GUNUNG TALANG");
    expect(grupPeserta("kecamatan", { kecamatan: "X Koto", nagari: null }, wil, null)).toBe("X KOTO");
    expect(grupPeserta("nagari", { kecamatan: null, nagari: null }, wil, null)).toBe("TANPA WILAYAH");
    expect(grupPeserta("kabupaten", { kecamatan: "X", nagari: "Y" }, wil, null)).toBe("KABUPATEN");
  });
  it("kuota dijumlah per grup; kabupaten pakai sisa", () => {
    expect(kuotaGrup("kecamatan", wil, { ppl: 9, pml: 9 }, "KUBUNG", "ppl")).toBe(3);
    expect(kuotaGrup("nagari", wil, { ppl: 9, pml: 9 }, "KOTO BARU", "pml")).toBe(0);
    expect(kuotaGrup("kabupaten", wil, { ppl: 6, pml: 2 }, "KABUPATEN", "pml")).toBe(2);
  });
  it("level efektif turun ke kabupaten bila kebutuhan wilayah kosong", () => {
    expect(levelEfektif("kecamatan", [w({ kebutuhan_ppl: 0, kebutuhan_pml: 0 })]).level).toBe("kabupaten");
    expect(levelEfektif("kecamatan", wil).level).toBe("kecamatan");
  });
});

describe("susunPeringkat", () => {
  const p = (akun_id: number, nama: string, skor: number, grup = "KUBUNG", peran: "ppl" | "pml" = "ppl", kosong = 0) => ({ akun_id, nama, peran, grup, skor, kosong });
  it("lulus sesuai kuota, lalu cadangan, lalu tidak; per kelompok dan peran", () => {
    const hasil = susunPeringkat([p(1, "A", 90), p(2, "B", 80), p(3, "C", 70), p(4, "D", 60), p(5, "E", 50), p(6, "F", 40), p(7, "G", 99, "KUBUNG", "pml"), p(8, "H", 10, "GT")], (g, r) => (g === "KUBUNG" && r === "ppl" ? 2 : g === "KUBUNG" ? 1 : 0));
    const per = (id: number) => hasil.find((h) => h.akun_id === id)!;
    expect([per(1).hasil, per(2).hasil, per(3).hasil, per(5).hasil, per(6).hasil]).toEqual(["lulus", "lulus", "cadangan", "cadangan", "tidak"]);
    expect(per(1).peringkat).toBe(1);
    expect(per(7).hasil).toBe("lulus"); // PML bersaing terpisah
    expect(per(8).hasil).toBe("cadangan"); // kuota 0 -> langsung cadangan
  });
  it("seri: nilai kosong lebih sedikit menang, lalu nama", () => {
    const hasil = susunPeringkat([p(1, "Budi", 80, "K", "ppl", 1), p(2, "Ani", 80, "K", "ppl", 0), p(3, "Cici", 80, "K", "ppl", 0)], () => 1);
    expect(hasil.map((h) => h.akun_id)).toEqual([2, 3, 1]);
  });
});

describe("tes seleksi", () => {
  const dasar = { aktif: true, jumlahSoal: 5, buka: "2026-11-02T01:00:00Z", tutup: "2026-11-02T05:00:00Z", sesi: null };
  it("status menurut jendela", () => {
    expect(statusTesSeleksi({ ...dasar, nowMs: Date.parse("2026-11-02T00:00:00Z") })).toBe("belum_buka");
    expect(statusTesSeleksi({ ...dasar, nowMs: Date.parse("2026-11-02T02:00:00Z") })).toBe("buka");
    expect(statusTesSeleksi({ ...dasar, nowMs: Date.parse("2026-11-02T06:00:00Z") })).toBe("terlewat");
    expect(statusTesSeleksi({ ...dasar, aktif: false, nowMs: 0 })).toBe("tidak_ada");
    expect(statusTesSeleksi({ ...dasar, jumlahSoal: 0, nowMs: 0 })).toBe("tidak_ada");
  });
  it("sesi: mengerjakan lalu selesai", () => {
    const sesi = { batas_at: "2026-11-02T02:30:00Z", selesai_at: null };
    expect(statusTesSeleksi({ ...dasar, sesi, nowMs: Date.parse("2026-11-02T02:10:00Z") })).toBe("mengerjakan");
    expect(statusTesSeleksi({ ...dasar, sesi, nowMs: Date.parse("2026-11-02T02:31:00Z") })).toBe("selesai");
    expect(statusTesSeleksi({ ...dasar, sesi: { ...sesi, selesai_at: "x" }, nowMs: 0 })).toBe("selesai");
  });
  it("periksaJadwalTes", () => {
    expect(periksaJadwalTes("2026-11-02T01:00:00Z", "2026-11-02T05:00:00Z", 30).ok).toBe(true);
    expect(periksaJadwalTes("2026-11-02T05:00:00Z", "2026-11-02T01:00:00Z", 30).ok).toBe(false);
    expect(periksaJadwalTes("2026-11-02T01:00:00Z", "2026-11-02T05:00:00Z", 0).ok).toBe(false);
    expect(periksaJadwalTes(null, "x", 30).ok).toBe(false);
  });
});

describe("pengumuman", () => {
  it("konfirmasi hanya untuk lulus, setelah diumumkan, sebelum batas", () => {
    const b = { hasil: "lulus", diumumkan: true, batas: "2026-11-05T00:00:00Z", nowMs: Date.parse("2026-11-04T00:00:00Z") };
    expect(putusanKonfirmasi(b).boleh).toBe(true);
    expect(putusanKonfirmasi({ ...b, diumumkan: false }).boleh).toBe(false);
    expect(putusanKonfirmasi({ ...b, hasil: "cadangan" }).boleh).toBe(false);
    expect(putusanKonfirmasi({ ...b, nowMs: Date.parse("2026-11-06T00:00:00Z") }).boleh).toBe(false);
    expect(putusanKonfirmasi({ ...b, batas: null, nowMs: Date.parse("2027-01-01T00:00:00Z") }).boleh).toBe(true);
  });
  it("pesan per hasil memuat tautan seleksi", () => {
    const o = { namaSeleksi: "Seleksi PPL", namaKegiatan: "Sakernas", seleksiId: 7, infoPelatihan: "Pelatihan 10 Nov di kantor.", batasKonfirmasi: "5 Nov 2026 17.00 WIB" };
    expect(pesanPengumuman({ ...o, hasil: "lulus" }).isi).toContain("Pelatihan 10 Nov");
    expect(pesanPengumuman({ ...o, hasil: "lulus" }).url).toBe("/sigap/seleksi/7");
    expect(pesanPengumuman({ ...o, hasil: "cadangan" }).judul).toContain("cadangan");
    expect(pesanPengumuman({ ...o, hasil: "tidak" }).isi).not.toContain("Pelatihan 10 Nov");
  });
});
