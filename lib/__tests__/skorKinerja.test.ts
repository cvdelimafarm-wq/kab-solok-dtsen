import { describe, expect, it } from "vitest";
import { ATURAN_POIN, formatAngka, hitungPoinHari, hitungRealisasi, teksPersen, teksXY, type HariSkor } from "../skorKinerja";

const kk = (terdampak: number, tidak_terdampak: number, km: number, tidak_ditemukan = 0) => ({ terdampak, tidak_terdampak, tidak_ditemukan, km });
const hari = (tanggal: string, m: ReturnType<typeof kk>, lengkap = true): HariSkor => ({ tanggal, lengkap, ...m });

describe("hitungPoinHari", () => {
  it("contoh mockup: 4 terdampak, 6 tidak terdampak, 12 km = 38 poin (84%)", () => {
    const p = hitungPoinHari(kk(4, 6, 12));
    expect(p.poin_terdampak).toBe(20);
    expect(p.poin_tidak_terdampak).toBe(6);
    expect(p.poin_jarak).toBe(12);
    expect(p.total).toBe(38);
    expect(p.target).toBe(45);
    expect(p.persen).toBe(84);
    expect(p.kurang).toBe(7);
  });

  it("tepat target = 100% tanpa kekurangan", () => {
    const p = hitungPoinHari(kk(6, 5, 10));
    expect(p.total).toBe(45);
    expect(p.persen).toBe(100);
    expect(p.kurang).toBe(0);
  });

  it("di atas target tampil > 100% (hanya tampilan)", () => {
    const p = hitungPoinHari(kk(10, 12, 0));
    expect(p.total).toBe(62);
    expect(p.persen).toBe(138);
    expect(p.kurang).toBe(0);
  });

  it("poin jarak dibatasi dan hanya bila ada KK didata", () => {
    expect(hitungPoinHari(kk(1, 0, 40)).poin_jarak).toBe(ATURAN_POIN.maksPoinJarak);
    expect(hitungPoinHari(kk(0, 0, 25)).total).toBe(0);
    expect(hitungPoinHari(kk(0, 0, 25, 1)).poin_jarak).toBe(15);
  });

  it("KK tidak ditemukan 0 poin (asumsi) dan masukan aneh diabaikan", () => {
    expect(hitungPoinHari(kk(0, 0, 0, 3)).total).toBe(0);
    expect(hitungPoinHari({ terdampak: -2, tidak_terdampak: Number.NaN, tidak_ditemukan: 1, km: -5 }).total).toBe(0);
  });

  it("jarak pecahan dibulatkan dua desimal", () => {
    expect(hitungPoinHari(kk(1, 0, 3.456)).poin_jarak).toBe(3.46);
  });
});

describe("hitungRealisasi", () => {
  const lama = ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-13", "2026-10-14"].map((t) => hari(t, kk(0, 0, 0)));

  it("sampai 14 Okt: hari lengkap = 1 O-K penuh, berapa pun poinnya", () => {
    const r = hitungRealisasi(lama);
    expect(r.ok_lama).toBe(6);
    expect(r.ok_bobot).toBe(0);
    expect(r.ok_dibayar).toBe(6);
    expect(r.hutang_poin).toBe(0);
  });

  it("contoh mockup: 6 hari lama + 15 Okt 38 poin = 6,84 O-K terkumpul, dibayar 6, hutang 7 poin", () => {
    const r = hitungRealisasi([...lama, hari("2026-10-15", kk(4, 6, 12))]);
    expect(r.ok_bobot).toBe(0.84);
    expect(r.ok_terkumpul).toBe(6.84);
    expect(r.ok_dibayar).toBe(6);
    expect(r.hutang_poin).toBe(7);
    expect(r.hutang_ok).toBe(0.16);
  });

  it("hutang ditutup lebih dulu oleh poin hari berikutnya", () => {
    const r = hitungRealisasi([hari("2026-10-15", kk(4, 6, 12)), hari("2026-10-16", kk(10, 12, 0))]);
    // 16 Okt: 62 poin -> 7 menutup hutang, 45 untuk hari itu, 10 hangus
    const h16 = r.rincian[1];
    expect(h16.untuk_hutang).toBe(7);
    expect(h16.kredit_hari).toBe(45);
    expect(h16.hangus).toBe(10);
    expect(r.hutang_poin).toBe(0);
    expect(r.ok_bobot).toBe(2);
    expect(r.ok_dibayar).toBe(2);
  });

  it("kelebihan di atas target tidak menambah pembayaran", () => {
    const r = hitungRealisasi([hari("2026-10-15", kk(20, 0, 0))]);
    expect(r.ok_bobot).toBe(1);
    expect(r.rincian[0].hangus).toBe(55);
  });

  it("hutang menumpuk bila terus kurang dan pecahan dibulatkan ke bawah", () => {
    const r = hitungRealisasi([hari("2026-10-15", kk(4, 6, 12)), hari("2026-10-16", kk(4, 6, 12)), hari("2026-10-17", kk(4, 6, 12))]);
    // tiap hari 38 poin: terkumpul 114/45 = 2,53 O-K, hutang 21
    expect(r.ok_bobot).toBe(2.53);
    expect(r.ok_dibayar).toBe(2);
    expect(r.hutang_poin).toBe(21);
  });

  it("hari tidak lengkap tidak dikredit dan tidak membuat hutang", () => {
    const r = hitungRealisasi([hari("2026-10-15", kk(20, 0, 0), false), hari("2026-10-16", kk(6, 5, 10))]);
    expect(r.hari_dihitung).toBe(1);
    expect(r.hutang_poin).toBe(0);
    expect(r.ok_bobot).toBe(1);
    expect(r.rincian[0].kredit_hari).toBe(0);
  });

  it("urutan masukan tidak berpengaruh (diurutkan menurut tanggal)", () => {
    const a = [hari("2026-10-16", kk(10, 12, 0)), hari("2026-10-15", kk(4, 6, 12))];
    const b = [...a].reverse();
    expect(hitungRealisasi(a)).toEqual(hitungRealisasi(b));
  });

  it("tanpa data = nol", () => {
    const r = hitungRealisasi([]);
    expect(r.ok_dibayar).toBe(0);
    expect(r.hutang_poin).toBe(0);
  });
});

describe("format tampilan", () => {
  it("angka gaya Indonesia", () => {
    expect(formatAngka(38)).toBe("38");
    expect(formatAngka(6.84)).toBe("6,84");
    expect(teksXY(38, 45)).toBe("38 / 45");
    expect(teksXY(6.84, 7)).toBe("6,84 / 7");
    expect(teksPersen(38, 45)).toBe("84%");
    expect(teksPersen(62, 45)).toBe("138%");
    expect(teksPersen(1, 0)).toBe("0%");
  });
});
