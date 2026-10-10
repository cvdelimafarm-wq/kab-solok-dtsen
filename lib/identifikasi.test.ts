import { describe, expect, it } from "vitest";
import { hpTel, hpWa, keadaanSub, kodeDesa, kodeSls, periksaIsian, peringatanIsian, ringkasIdentifikasi, type SubIdentifikasi } from "@/lib/identifikasi";

// (10 Okt 2026) Uji aturan Lembar Identifikasi SLS: total diisi sendiri (bukan jumlah kolom), jenis <= total, tidak terdampak = nol semua.
describe("periksaIsian", () => {
  it("menerima jumlah kolom yang melebihi total (satu KK bisa kena beberapa dampak)", () => {
    const r = periksaIsian({ kk_terdampak: 87, rusak_berat: 12, rusak_sedang: 25, rusak_ringan: 30, lahan_tertimbun: 40, lainnya: 5, lainnya_ket: " Jalan putus ", aset_usaha: 9, lahan_ternak: 14 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.isi.lainnya_ket).toBe("Jalan putus");
  });
  it("menolak jenis dampak yang melebihi total", () => {
    expect(periksaIsian({ kk_terdampak: 10, rusak_berat: 11 }).ok).toBe(false);
  });
  it("total 0 otomatis berarti tidak terdampak", () => {
    const r = periksaIsian({ kk_terdampak: 0 });
    expect(r.ok && r.isi.tidak_terdampak).toBe(true);
  });
  it("tidak terdampak harus nol semua", () => {
    expect(periksaIsian({ tidak_terdampak: true, kk_terdampak: 0, catatan: "aman" }).ok).toBe(true);
    expect(periksaIsian({ tidak_terdampak: true, kk_terdampak: 3 }).ok).toBe(false);
  });
  it("menolak desimal, negatif, dan bukan angka; kosong dianggap 0", () => {
    expect(periksaIsian({ kk_terdampak: 2.5 }).ok).toBe(false);
    expect(periksaIsian({ kk_terdampak: -1 }).ok).toBe(false);
    expect(periksaIsian({ kk_terdampak: "abc" }).ok).toBe(false);
    expect(periksaIsian({ kk_terdampak: "", rusak_berat: "" }).ok).toBe(true);
  });
  it("peringatan lunak hanya bila total melebihi KK tinggal dan bukan tidak terdampak", () => {
    expect(peringatanIsian({ kk_terdampak: 200, tidak_terdampak: false }, 159)).toHaveLength(1);
    expect(peringatanIsian({ kk_terdampak: 0, tidak_terdampak: true }, 159)).toHaveLength(0);
  });
});

describe("ringkasan & kode peta", () => {
  const h = (kk: number, tidak: boolean) => ({ kk_terdampak: kk, tidak_terdampak: tidak }) as SubIdentifikasi["hasil"];
  const sub = [
    { kk: 100, kk_awal: 50, hasil: h(30, false) },
    { kk: 80, kk_awal: 20, hasil: h(0, true) },
    { kk: 70, kk_awal: 9, hasil: null },
  ] as SubIdentifikasi[];
  it("menghitung progres; awal hanya dari Sub SLS yang sudah terisi", () => {
    expect(ringkasIdentifikasi(sub)).toEqual({ total: 3, terisi: 2, tidak_terdampak: 1, kk: 250, awal: 70, hasil: 30 });
    expect(sub.map(keadaanSub)).toEqual(["terdampak", "tidak_terdampak", "belum"]);
  });
  it("kode desa 10 digit dan kode SLS 14 digit", () => {
    expect(kodeDesa("1303040002000900")).toBe("1303040002");
    expect(kodeSls("1303040002000900")).toBe("13030400020009");
  });
});

describe("nomor HP rekan", () => {
  it("hpTel hanya menyisakan angka dan menolak yang tidak masuk akal", () => {
    expect(hpTel("0812-3456 7890")).toBe("081234567890");
    expect(hpTel("+62 812 3456 7890")).toBe("6281234567890");
    expect(hpTel("123")).toBeNull();
    expect(hpTel(null)).toBeNull();
    expect(hpTel("")).toBeNull();
  });
  it("hpWa memakai kode negara 62", () => {
    expect(hpWa("081234567890")).toBe("6281234567890");
    expect(hpWa("+6281234567890")).toBe("6281234567890");
    expect(hpWa("81234567890")).toBe("6281234567890");
    expect(hpWa("abc")).toBeNull();
  });
});
