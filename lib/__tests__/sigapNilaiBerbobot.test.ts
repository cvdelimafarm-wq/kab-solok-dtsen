import { describe, expect, it } from "vitest";
import { SKEMA_BAWAAN, hitungAkhir, kanonik, periksaItemSikap, ringkasSkema, validasiSkema, type SkemaNilai } from "@/lib/sigapNilaiHitung";

const kuis = { benar: 8, total_soal: 10, poin: 4000, nilai_benar: 80, nilai_poin: 100 } as never;

describe("nilai akhir berbobot (skema klasik tetap sama)", () => {
  it("tanpa tambahan hasil identik dan tanpa kunci baru", () => {
    const h = hitungAkhir(SKEMA_BAWAAN, { pretest: 60, posttest: 80, kuis: null });
    expect(h.tambahan).toBeUndefined();
    expect(h.lulus).toBeUndefined();
    expect(h.akhir).toBe(52);
  });
  it("skema klasik tidak memuat kunci tambahan saat divalidasi", () => {
    const v = validasiSkema(SKEMA_BAWAAN);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.skema.tambahan).toBeUndefined();
      expect(v.skema.lulus_akhir).toBeUndefined();
    }
  });
});

describe("kedisiplinan & sikap", () => {
  const skema: SkemaNilai = {
    pakai: { pretest: true, posttest: true, kuis: false },
    bobot: { pretest: 20, posttest: 40, kuis: 0 },
    dasar_kuis: "benar",
    tambahan: { disiplin: { pakai: true, bobot: 20 }, sikap: { pakai: true, bobot: 20 } },
  };
  it("valid bila total 100 termasuk tambahan", () => {
    expect(validasiSkema(skema).ok).toBe(true);
  });
  it("tolak bila total tidak 100", () => {
    const s = { ...skema, tambahan: { disiplin: { pakai: true, bobot: 30 }, sikap: { pakai: true, bobot: 20 } } };
    const v = validasiSkema(s);
    expect(v.ok).toBe(false);
  });
  it("hitung berbobot", () => {
    const h = hitungAkhir(skema, { pretest: 50, posttest: 80, kuis: null, disiplin: 100, sikap: 90 });
    // 50*.2 + 80*.4 + 100*.2 + 90*.2 = 10+32+20+18 = 80
    expect(h.akhir).toBe(80);
    expect(h.lengkap).toBe(true);
    expect(h.tambahan).toEqual({ disiplin: 100, sikap: 90 });
  });
  it("sikap belum diisi dihitung 0 dan ditandai belum lengkap", () => {
    const h = hitungAkhir(skema, { pretest: 50, posttest: 80, kuis: null, disiplin: 100, sikap: null });
    expect(h.akhir).toBe(62);
    expect(h.lengkap).toBe(false);
  });
  it("hanya komponen tambahan terpilih", () => {
    const s: SkemaNilai = { pakai: { pretest: false, posttest: false, kuis: false }, bobot: { pretest: 0, posttest: 0, kuis: 0 }, dasar_kuis: "benar", tambahan: { disiplin: { pakai: true, bobot: 100 }, sikap: { pakai: false, bobot: 0 } } };
    expect(validasiSkema(s).ok).toBe(true);
    expect(hitungAkhir(s, { pretest: null, posttest: null, kuis: null, disiplin: 75 }).akhir).toBe(75);
  });
  it("semua nilai kosong -> akhir null", () => {
    expect(hitungAkhir(skema, { pretest: null, posttest: null, kuis: null, disiplin: null, sikap: null }).akhir).toBeNull();
  });
  it("bobot tambahan harus bilangan bulat 0-100", () => {
    expect(validasiSkema({ ...skema, tambahan: { disiplin: { pakai: true, bobot: 20.5 }, sikap: { pakai: true, bobot: 19.5 } } }).ok).toBe(false);
    expect(validasiSkema({ ...skema, tambahan: { disiplin: { pakai: true, bobot: -20 }, sikap: { pakai: true, bobot: 60 } } }).ok).toBe(false);
  });
});

describe("wajib lulus pada nilai akhir", () => {
  const dasar: SkemaNilai = { ...SKEMA_BAWAAN, lulus_akhir: { wajib: true, nilai: 70 } };
  it("lulus bila nilai akhir >= ambang", () => {
    const h = hitungAkhir({ ...dasar, pakai: { pretest: false, posttest: true, kuis: false }, bobot: { pretest: 0, posttest: 100, kuis: 0 } }, { pretest: null, posttest: 70, kuis: null });
    expect(h.lulus).toBe(true);
  });
  it("belum lulus bila di bawah ambang", () => {
    const h = hitungAkhir({ ...dasar, pakai: { pretest: false, posttest: true, kuis: false }, bobot: { pretest: 0, posttest: 100, kuis: 0 } }, { pretest: null, posttest: 69.99, kuis: null });
    expect(h.lulus).toBe(false);
  });
  it("ambang 100 = harus sempurna", () => {
    const s: SkemaNilai = { pakai: { pretest: false, posttest: true, kuis: false }, bobot: { pretest: 0, posttest: 100, kuis: 0 }, dasar_kuis: "benar", lulus_akhir: { wajib: true, nilai: 100 } };
    expect(hitungAkhir(s, { pretest: null, posttest: 100, kuis: null }).lulus).toBe(true);
    expect(hitungAkhir(s, { pretest: null, posttest: 99, kuis: null }).lulus).toBe(false);
  });
  it("tanpa nilai tidak ada status lulus", () => {
    expect(hitungAkhir(dasar, { pretest: null, posttest: null, kuis: null }).lulus).toBeUndefined();
  });
  it("tidak wajib -> tidak ada status", () => {
    expect(hitungAkhir(SKEMA_BAWAAN, { pretest: 10, posttest: 10, kuis: null }).lulus).toBeUndefined();
  });
  it("ambang di luar 0-100 ditolak", () => {
    expect(validasiSkema({ ...SKEMA_BAWAAN, lulus_akhir: { wajib: true, nilai: 101 } }).ok).toBe(false);
    expect(validasiSkema({ ...SKEMA_BAWAAN, lulus_akhir: { wajib: true, nilai: -1 } }).ok).toBe(false);
  });
  it("ambang tersimpan pada hasil validasi", () => {
    const v = validasiSkema({ ...SKEMA_BAWAAN, lulus_akhir: { wajib: true, nilai: 85.5 } });
    expect(v.ok && v.skema.lulus_akhir).toEqual({ wajib: true, nilai: 85.5 });
  });
});

describe("ringkasan & kanonik", () => {
  it("ringkas memuat tambahan dan ambang", () => {
    const s: SkemaNilai = { ...SKEMA_BAWAAN, pakai: { pretest: true, posttest: true, kuis: false }, bobot: { pretest: 20, posttest: 50, kuis: 0 }, tambahan: { disiplin: { pakai: true, bobot: 30 }, sikap: { pakai: false, bobot: 0 } }, lulus_akhir: { wajib: true, nilai: 75 } };
    const r = ringkasSkema(s);
    expect(r).toContain("Kedisiplinan 30%");
    expect(r).toContain("wajib lulus nilai akhir ≥ 75");
  });
  it("kanonik menyamakan skema tanpa dan dengan kunci kosong", () => {
    expect(JSON.stringify(kanonik(SKEMA_BAWAAN))).toBe(JSON.stringify(kanonik({ ...SKEMA_BAWAAN, tambahan: { disiplin: { pakai: false, bobot: 0 }, sikap: { pakai: false, bobot: 0 } }, lulus_akhir: { wajib: false, nilai: 70 } })));
  });
});

describe("periksaItemSikap", () => {
  it("terima nilai valid dan null", () => {
    const p = periksaItemSikap([{ akun_id: 3, nilai: 85 }, { akun_id: 4, nilai: null }, { akun_id: 5, nilai: "" }]);
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.item).toEqual([{ akun_id: 3, nilai: 85 }, { akun_id: 4, nilai: null }, { akun_id: 5, nilai: null }]);
  });
  it("tolak di luar rentang, pecahan, akun salah, kosong, terlalu banyak", () => {
    expect(periksaItemSikap([{ akun_id: 1, nilai: 101 }]).ok).toBe(false);
    expect(periksaItemSikap([{ akun_id: 1, nilai: -1 }]).ok).toBe(false);
    expect(periksaItemSikap([{ akun_id: 1, nilai: 80.5 }]).ok).toBe(false);
    expect(periksaItemSikap([{ akun_id: 0, nilai: 80 }]).ok).toBe(false);
    expect(periksaItemSikap([]).ok).toBe(false);
    expect(periksaItemSikap(Array.from({ length: 501 }, (_, i) => ({ akun_id: i + 1, nilai: 1 }))).ok).toBe(false);
  });
});
void kuis;
