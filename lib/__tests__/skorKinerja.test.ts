import { describe, expect, it } from "vitest";
import { ATURAN_POIN, ATURAN_POIN_V1, ATURAN_POIN_V2, MULAI_BOBOT_AWAL, aturanUntukTanggal, formatAngka, poinJarakKm, hitungPoinHari, hitungPoinHari as hitungPoinHariAsli, hitungRealisasi, teksPersen, teksXY, type HariSkor } from "../skorKinerja";

const kk = (terdampak: number, tidak_terdampak: number, km: number, tidak_ditemukan = 0) => ({ terdampak, tidak_terdampak, tidak_ditemukan, km });
const hari = (tanggal: string, m: ReturnType<typeof kk>, lengkap = true): HariSkor => ({ tanggal, lengkap, ...m });

describe("aturan menurut tanggal (tidak berlaku mundur)", () => {
  it("sebelum 15 Okt = belum ada bobot; 15-19 Okt = 45; 20-28 Okt = 60; mulai 29 Okt = 75", () => {
    expect(MULAI_BOBOT_AWAL).toBe("2026-10-15");
    expect(aturanUntukTanggal("2026-10-14")).toBeNull();
    expect(aturanUntukTanggal("2026-10-15")).toBe(ATURAN_POIN_V1);
    expect(aturanUntukTanggal("2026-10-19")).toBe(ATURAN_POIN_V1);
    expect(aturanUntukTanggal("2026-10-20")).toBe(ATURAN_POIN_V2);
    expect(aturanUntukTanggal("2026-10-28")).toBe(ATURAN_POIN_V2);
    expect(aturanUntukTanggal("2026-10-29")).toBe(ATURAN_POIN);
    expect(aturanUntukTanggal("2026-11-01")).toBe(ATURAN_POIN);
  });

  it("angka aturan lama dan baru", () => {
    expect(ATURAN_POIN_V1.targetHarian).toBe(45);
    expect(ATURAN_POIN_V1.poinPerKm).toBe(1);
    expect(ATURAN_POIN_V2.targetHarian).toBe(60);
    expect(ATURAN_POIN.targetHarian).toBe(75);
    expect(ATURAN_POIN.poinPerKm).toBe(1); // poin jarak tidak berubah
  });
});

describe("hitungPoinHari - aturan 20-28 Okt 2026 (target 60, poin jarak tetap 1 per km)", () => {
  const hitungPoinHari = (m: ReturnType<typeof kk>) => hitungPoinHariAsli(m, ATURAN_POIN_V2);
  it("contoh: 6 terdampak, 10 tidak terdampak, 2 km = 42 poin (70%)", () => {
    const p = hitungPoinHari(kk(6, 10, 2));
    expect(p.poin_terdampak).toBe(30);
    expect(p.poin_tidak_terdampak).toBe(10);
    expect(p.poin_jarak).toBe(2);
    expect(p.total).toBe(42);
    expect(p.target).toBe(60);
    expect(p.persen).toBe(70);
    expect(p.kurang).toBe(18);
  });

  it("tepat target = 100% tanpa kekurangan", () => {
    const p = hitungPoinHari(kk(10, 5, 5));
    expect(p.total).toBe(60);
    expect(p.persen).toBe(100);
    expect(p.kurang).toBe(0);
  });

  it("di atas target tampil > 100% (hanya tampilan)", () => {
    const p = hitungPoinHari(kk(14, 12, 0));
    expect(p.total).toBe(82);
    expect(p.persen).toBe(137);
    expect(p.kurang).toBe(0);
  });

  it("poin jarak 1 per km, dibatasi 15 dan hanya bila ada KK didata", () => {
    expect(hitungPoinHari(kk(1, 0, 100)).poin_jarak).toBe(ATURAN_POIN.maksPoinJarak);
    expect(hitungPoinHari(kk(0, 0, 25)).total).toBe(0);
    expect(hitungPoinHari(kk(0, 0, 100, 1)).poin_jarak).toBe(15);
    expect(hitungPoinHari(kk(0, 0, 12, 1)).poin_jarak).toBe(12);
  });

  it("KK tidak ditemukan 0 poin (asumsi) dan masukan aneh diabaikan", () => {
    expect(hitungPoinHari(kk(0, 0, 0, 3)).total).toBe(0);
    expect(hitungPoinHari({ terdampak: -2, tidak_terdampak: Number.NaN, tidak_ditemukan: 1, km: -5 }).total).toBe(0);
  });

  it("jarak pecahan dibulatkan dua desimal", () => {
    expect(hitungPoinHari(kk(1, 0, 3.456)).poin_jarak).toBe(3.46);
  });

  it("poin KK dan jarak sama dengan aturan lama; hanya target yang berbeda", () => {
    expect(hitungPoinHari(kk(5, 3, 10)).total).toBe(hitungPoinHariAsli(kk(5, 3, 10), ATURAN_POIN_V1).total);
    expect(hitungPoinHari(kk(5, 3, 10)).target).toBe(60);
    expect(hitungPoinHariAsli(kk(5, 3, 10), ATURAN_POIN_V1).target).toBe(45);
  });
});

describe("hitungPoinHari - aturan berlaku sekarang (mulai 29 Okt 2026: target 75, poin jarak tetap 1 per km)", () => {
  it("contoh: 6 terdampak, 10 tidak terdampak, 2 km = 42 poin (56%)", () => {
    const p = hitungPoinHariAsli(kk(6, 10, 2));
    expect(p.total).toBe(42);
    expect(p.target).toBe(75);
    expect(p.persen).toBe(56);
    expect(p.kurang).toBe(33);
  });
  it("tepat target = 100% tanpa kekurangan; di atas target tampil > 100%", () => {
    const a = hitungPoinHariAsli(kk(12, 5, 10)); // 60 + 5 + 10
    expect(a.total).toBe(75);
    expect(a.persen).toBe(100);
    expect(a.kurang).toBe(0);
    expect(hitungPoinHariAsli(kk(14, 12, 0)).persen).toBe(109); // 82 poin
  });
  it("poin KK dan jarak sama dengan aturan sebelumnya; hanya target yang berbeda", () => {
    expect(hitungPoinHariAsli(kk(5, 3, 10)).total).toBe(hitungPoinHariAsli(kk(5, 3, 10), ATURAN_POIN_V2).total);
    expect(hitungPoinHariAsli(kk(5, 3, 10)).target).toBe(75);
  });
  it("jarak di atas 15 km: 15 km pertama 1 poin per km, km selebihnya 0,7 poin per km (mulai 29 Okt 2026)", () => {
    expect(ATURAN_POIN.poinPerKmLebih).toBe(0.7);
    expect(poinJarakKm(0, ATURAN_POIN)).toBe(0);
    expect(poinJarakKm(10, ATURAN_POIN)).toBe(10);
    expect(poinJarakKm(15, ATURAN_POIN)).toBe(15);
    expect(poinJarakKm(16, ATURAN_POIN)).toBe(15.7);
    expect(poinJarakKm(20, ATURAN_POIN)).toBe(18.5);
    expect(poinJarakKm(100, ATURAN_POIN)).toBe(74.5);
    expect(poinJarakKm(-3, ATURAN_POIN)).toBe(0);
    expect(poinJarakKm(Number.NaN, ATURAN_POIN)).toBe(0);
    // aturan sebelumnya tetap berhenti di 15 poin
    expect(poinJarakKm(20, ATURAN_POIN_V2)).toBe(15);
    expect(poinJarakKm(20, ATURAN_POIN_V1)).toBe(15);
  });
  it("hitungPoinHari: jarak 20 km = 18,5 poin hanya bila ada KK didata; hari 28 Okt tetap berhenti di 15", () => {
    const p = hitungPoinHariAsli(kk(2, 0, 20));
    expect(p.poin_jarak).toBe(18.5);
    expect(p.total).toBe(28.5);
    expect(hitungPoinHariAsli(kk(0, 0, 20)).poin_jarak).toBe(0);
    expect(hitungPoinHariAsli(kk(2, 0, 20), ATURAN_POIN_V2).poin_jarak).toBe(15);
    const h = hitungRealisasi([hari("2026-10-28", kk(2, 0, 20)), hari("2026-10-29", kk(2, 0, 20))]);
    expect(h.rincian[0].poin).toBe(25); // 10 + 15 (aturan 28 Okt)
    expect(h.rincian[1].poin).toBe(28.5); // 10 + 18,5 (aturan 29 Okt)
  });
  it("hitungRealisasi: 28 Okt memakai target 60, 29 Okt memakai target 75 (tidak berlaku mundur)", () => {
    const h28 = hitungRealisasi([hari("2026-10-28", kk(10, 5, 5))]); // 60 poin = 1 O-K penuh pada aturan 60
    expect(h28.rincian[0].kredit_hari).toBe(60);
    expect(h28.hutang_poin).toBe(0);
    const h29 = hitungRealisasi([hari("2026-10-29", kk(10, 5, 5))]); // 60 poin dari target 75 -> kurang 15
    expect(h29.rincian[0].kredit_hari).toBe(60);
    expect(h29.hutang_poin).toBe(15);
  });
});

describe("hitungPoinHari - aturan lama (15-19 Okt 2026: target 45, 1 poin per km) tetap sama", () => {
  it("contoh: 5 terdampak, 3 tidak terdampak, 10 km = 38 poin (84%)", () => {
    const p = hitungPoinHari(kk(5, 3, 10), ATURAN_POIN_V1);
    expect(p.poin_terdampak).toBe(25);
    expect(p.poin_tidak_terdampak).toBe(3);
    expect(p.poin_jarak).toBe(10);
    expect(p.total).toBe(38);
    expect(p.target).toBe(45);
    expect(p.persen).toBe(84);
    expect(p.kurang).toBe(7);
  });

  it("di atas target dan jarak dibatasi 15 poin", () => {
    const p = hitungPoinHari(kk(10, 2, 10), ATURAN_POIN_V1);
    expect(p.total).toBe(62);
    expect(p.persen).toBe(138);
    expect(hitungPoinHari(kk(1, 0, 100), ATURAN_POIN_V1).poin_jarak).toBe(15);
    expect(hitungPoinHari(kk(1, 0, 3.456), ATURAN_POIN_V1).poin_jarak).toBe(3.46);
  });
});

describe("hitungRealisasi - hari 15-19 Okt (aturan lama, angka tidak berubah)", () => {
  const lama = ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-13", "2026-10-14"].map((t) => hari(t, kk(0, 0, 0)));

  it("sampai 14 Okt: hari lengkap = 1 O-K penuh, berapa pun poinnya", () => {
    const r = hitungRealisasi(lama);
    expect(r.ok_lama).toBe(6);
    expect(r.ok_bobot).toBe(0);
    expect(r.ok_dibayar).toBe(6);
    expect(r.hutang_poin).toBe(0);
  });

  it("contoh: 6 hari lama + 15 Okt 38 poin = 6,84 O-K terkumpul, dibayar 6, hutang 7 poin", () => {
    const r = hitungRealisasi([...lama, hari("2026-10-15", kk(5, 3, 10))]);
    expect(r.ok_bobot).toBe(0.84);
    expect(r.ok_terkumpul).toBe(6.84);
    expect(r.ok_dibayar).toBe(6);
    expect(r.hutang_poin).toBe(7);
    expect(r.rincian[6].aturan).toBe("bobot");
    expect(r.rincian[6].poin).toBe(38);
  });

  it("hutang ditutup lebih dulu oleh poin hari berikutnya", () => {
    const r = hitungRealisasi([hari("2026-10-15", kk(5, 3, 10)), hari("2026-10-16", kk(10, 2, 10))]);
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
    const r = hitungRealisasi([hari("2026-10-15", kk(5, 3, 10)), hari("2026-10-16", kk(5, 3, 10)), hari("2026-10-17", kk(5, 3, 10))]);
    // tiap hari 38 poin: terkumpul 114/45 = 2,53 O-K, hutang 21
    expect(r.ok_bobot).toBe(2.53);
    expect(r.ok_dibayar).toBe(2);
    expect(r.hutang_poin).toBe(21);
  });

  it("hari tidak lengkap tidak dikredit dan tidak membuat hutang", () => {
    const r = hitungRealisasi([hari("2026-10-15", kk(20, 0, 0), false), hari("2026-10-16", kk(9, 0, 0))]);
    expect(r.hari_dihitung).toBe(1);
    expect(r.hutang_poin).toBe(0);
    expect(r.ok_bobot).toBe(1);
    expect(r.rincian[0].kredit_hari).toBe(0);
  });

  it("urutan masukan tidak berpengaruh (diurutkan menurut tanggal)", () => {
    const a = [hari("2026-10-16", kk(10, 2, 10)), hari("2026-10-15", kk(5, 3, 10))];
    const b = [...a].reverse();
    expect(hitungRealisasi(a)).toEqual(hitungRealisasi(b));
  });

  it("tanpa data = nol", () => {
    const r = hitungRealisasi([]);
    expect(r.ok_dibayar).toBe(0);
    expect(r.hutang_poin).toBe(0);
  });
});

describe("hitungRealisasi - hari mulai 20 Okt (aturan baru: target 60)", () => {
  it("20 Okt 42 poin = 0,7 O-K, hutang 18 poin", () => {
    const r = hitungRealisasi([hari("2026-10-20", kk(6, 10, 2))]);
    expect(r.ok_bobot).toBe(0.7);
    expect(r.ok_terkumpul).toBe(0.7);
    expect(r.ok_dibayar).toBe(0);
    expect(r.hutang_poin).toBe(18);
    expect(r.hutang_ok).toBe(0.3);
  });

  it("hutang ditutup lebih dulu oleh poin hari berikutnya", () => {
    const r = hitungRealisasi([hari("2026-10-20", kk(6, 10, 2)), hari("2026-10-21", kk(14, 12, 0))]);
    const h21 = r.rincian[1];
    expect(h21.untuk_hutang).toBe(18);
    expect(h21.kredit_hari).toBe(60);
    expect(h21.hangus).toBe(4);
    expect(r.hutang_poin).toBe(0);
    expect(r.ok_bobot).toBe(2);
    expect(r.ok_dibayar).toBe(2);
  });

  it("hutang menumpuk bila terus kurang", () => {
    const r = hitungRealisasi([hari("2026-10-20", kk(6, 10, 2)), hari("2026-10-21", kk(6, 10, 2)), hari("2026-10-22", kk(6, 10, 2))]);
    expect(r.ok_bobot).toBe(2.1);
    expect(r.ok_dibayar).toBe(2);
    expect(r.hutang_poin).toBe(54);
  });
});

describe("hitungRealisasi - pergantian aturan 19 -> 20 Okt (hari lalu tidak berubah)", () => {
  it("19 Okt tetap dinilai dengan target lama (45) walau target baku sekarang 60", () => {
    const r = hitungRealisasi([hari("2026-10-19", kk(5, 3, 10))]);
    expect(r.rincian[0].poin).toBe(38);
    expect(r.rincian[0].kredit_hari).toBe(38);
    expect(r.ok_bobot).toBe(0.84);
    expect(r.hutang_poin).toBe(7); // target lama 45; dengan target 60 hutangnya 22
  });

  it("hutang 19 Okt (7 poin lama = 0,1556 O-K) ditutup poin 20 Okt dengan target baru", () => {
    const r = hitungRealisasi([hari("2026-10-19", kk(5, 3, 10)), hari("2026-10-20", kk(14, 12, 0))]);
    const h20 = r.rincian[1];
    expect(h20.aturan).toBe("bobot");
    expect(h20.untuk_hutang).toBeCloseTo(9.33, 2); // 0,1556 O-K x 60 poin
    expect(h20.kredit_hari).toBe(60);
    expect(h20.hangus).toBeCloseTo(12.67, 2);
    expect(r.ok_bobot).toBe(2);
    expect(r.hutang_poin).toBe(0);
  });

  it("kurang pada 20 Okt menambah hutang dalam O-K di atas hutang 19 Okt", () => {
    const r = hitungRealisasi([hari("2026-10-19", kk(5, 3, 10)), hari("2026-10-20", kk(6, 10, 2))]);
    // 19 Okt: 38/45 = 0,8444 O-K; 20 Okt: 42/60 = 0,7 O-K; sisa poin 20 Okt (0,5444) untuk hari itu sendiri
    expect(r.rincian[1].hutang_sesudah_ok).toBeCloseTo(0.4556, 3);
    expect(r.ok_bobot).toBeCloseTo(1.54, 2);
    expect(r.ok_dibayar).toBe(1);
    expect(r.hutang_poin).toBeCloseTo(27.33, 2); // dalam poin menurut target hari terakhir (60)
  });

  it("hutang (O-K) = jumlah hari dihitung dikurangi O-K terkumpul, lintas pergantian aturan", () => {
    const r = hitungRealisasi([hari("2026-10-19", kk(5, 3, 10)), hari("2026-10-20", kk(6, 10, 2))]);
    expect(r.hutang_ok).toBeCloseTo(r.hari_dihitung - r.ok_bobot, 2);
  });
});

describe("format tampilan", () => {
  it("angka gaya Indonesia", () => {
    expect(formatAngka(42)).toBe("42");
    expect(formatAngka(6.84)).toBe("6,84");
    expect(teksXY(42, 60)).toBe("42 / 60");
    expect(teksXY(6.84, 7)).toBe("6,84 / 7");
    expect(teksPersen(42, 60)).toBe("70%");
    expect(teksPersen(82, 60)).toBe("137%");
    expect(teksPersen(1, 0)).toBe("0%");
  });
});
