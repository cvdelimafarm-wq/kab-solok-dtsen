import { describe, expect, it } from "vitest";
import { kodeDariIdSoal, nilaiJawaban, pengacak, pilihSoalKuisPra, rapatKode, statusKuisPra, validasiPengaturanKuisPra, type PengaturanKuisPra } from "@/lib/sigapKuisPra";

const bank = ["KT-KP01-1", "KT-KP02-1", "KT-KP02-2", "KT-M01-1", "KT-M02-1", "KT-M03-1", "LAT-11", "K2-P01-01"].map((id) => ({ id }));

describe("kode", () => {
  it("rapatKode dan kodeDariIdSoal", () => {
    expect(rapatKode("KP-02")).toBe("KP02");
    expect(rapatKode(" m 01 ")).toBe("M01");
    expect(kodeDariIdSoal("KT-KP02-1")).toBe("KP02");
    expect(kodeDariIdSoal("kt-m01-12")).toBe("M01");
    expect(kodeDariIdSoal("LAT-11")).toBeNull();
    expect(kodeDariIdSoal("K2-P01-01")).toBeNull();
  });
});

describe("pengacak", () => {
  it("deterministik per benih dan dalam [0,1)", () => {
    const a = pengacak("x");
    const b = pengacak("x");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    const c = pengacak("y");
    expect(c()).not.toBe(pengacak("x")());
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("pilihSoalKuisPra", () => {
  it("soal sesuai riwayat dulu (kode terbanyak), tanpa ganda, hanya soal bank KT-", () => {
    const h = pilihSoalKuisPra(bank, [{ kode: "KP-02", jumlah: 5 }, { kode: "M-01", jumlah: 2 }], 2, "akun1:1");
    expect(h.soalIds.length).toBe(2);
    expect(h.dariRiwayat).toBe(2);
    expect(h.soalIds.some((id) => id.startsWith("KT-KP02-"))).toBe(true);
    expect(h.soalIds).toContain("KT-M01-1");
    expect(new Set(h.soalIds).size).toBe(h.soalIds.length);
  });
  it("kekurangan diisi soal bank lain; kode tanpa soal dicatat", () => {
    const h = pilihSoalKuisPra(bank, [{ kode: "KP-99", jumlah: 9 }, { kode: "KP-01", jumlah: 1 }], 4, "b");
    expect(h.kodeTanpaSoal).toEqual(["KP99"]);
    expect(h.soalIds.length).toBe(4);
    expect(h.dariRiwayat).toBe(1);
    expect(h.soalIds).toContain("KT-KP01-1");
    expect(h.soalIds.every((id) => id.startsWith("KT-"))).toBe(true);
  });
  it("tanpa riwayat: acak dari seluruh bank KT-; jumlah dibatasi isi bank", () => {
    const h = pilihSoalKuisPra(bank, [], 3, "c");
    expect(h.soalIds.length).toBe(3);
    expect(h.dariRiwayat).toBe(0);
    expect(pilihSoalKuisPra(bank, [], 50, "c").soalIds.length).toBe(6);
  });
  it("stabil untuk benih sama, berbeda untuk benih lain (pada bank cukup besar)", () => {
    const besar = Array.from({ length: 30 }, (_, i) => ({ id: `KT-X${i}-1` }));
    const a = pilihSoalKuisPra(besar, [], 10, "u1:1").soalIds;
    expect(pilihSoalKuisPra(besar, [], 10, "u1:1").soalIds).toEqual(a);
    expect(pilihSoalKuisPra(besar, [], 10, "u2:1").soalIds).not.toEqual(a);
  });
  it("kode riwayat ganda (penulisan beda) dihitung sekali; jumlahSoal 1 memilih kode terbanyak", () => {
    const h = pilihSoalKuisPra(bank, [{ kode: "M-01", jumlah: 1 }, { kode: "m01", jumlah: 1 }, { kode: "KP-01", jumlah: 3 }], 1, "d");
    expect(h.soalIds).toEqual(["KT-KP01-1"]);
  });
});

describe("nilaiJawaban", () => {
  it("menghitung benar, tak dijawab = salah, abaikan huruf kecil", () => {
    expect(nilaiJawaban({ a: "A", b: "B", c: "C" }, { a: "a", b: "D" })).toEqual({ benar: 1, jumlah: 3, skor: 33.33 });
    expect(nilaiJawaban({ a: "A" }, { a: "A" })).toEqual({ benar: 1, jumlah: 1, skor: 100 });
    expect(nilaiJawaban({}, {})).toEqual({ benar: 0, jumlah: 0, skor: 0 });
  });
});

describe("statusKuisPra", () => {
  const p: PengaturanKuisPra = { aktif: true, jumlah_soal: 10, maks_percobaan: 2, nilai_lulus: 70, wajib_lulus: false, buka_at: "2026-11-01T00:00:00Z", tutup_at: "2026-11-10T00:00:00Z" };
  const t = (iso: string) => Date.parse(iso);
  it("nonaktif, belum buka, bisa mulai, ditutup", () => {
    expect(statusKuisPra({ ...p, aktif: false }, [], t("2026-11-02T00:00:00Z")).status).toBe("nonaktif");
    expect(statusKuisPra(p, [], t("2026-10-31T00:00:00Z")).status).toBe("belum_buka");
    expect(statusKuisPra(p, [], t("2026-11-02T00:00:00Z"))).toMatchObject({ status: "bisa_mulai", sisa: 2, keBerikut: 1 });
    expect(statusKuisPra(p, [], t("2026-11-11T00:00:00Z")).status).toBe("ditutup");
  });
  it("lanjut bila ada percobaan berjalan (meski sudah lewat tutup tidak mengunci sesi berjalan)", () => {
    expect(statusKuisPra(p, [{ ke: 1, skor: null, selesai: false }], t("2026-11-02T00:00:00Z"))).toMatchObject({ status: "lanjut", keBerikut: 2 });
  });
  it("lulus mengunci pengulangan; belum lulus masih ada sisa; habis", () => {
    expect(statusKuisPra(p, [{ ke: 1, skor: 80, selesai: true }], t("2026-11-02T00:00:00Z"))).toMatchObject({ status: "lulus", lulus: true, terbaik: 80 });
    expect(statusKuisPra(p, [{ ke: 1, skor: 50, selesai: true }], t("2026-11-02T00:00:00Z"))).toMatchObject({ status: "bisa_mulai", sisa: 1, keBerikut: 2, lulus: false });
    expect(statusKuisPra(p, [{ ke: 1, skor: 50, selesai: true }, { ke: 2, skor: 60, selesai: true }], t("2026-11-02T00:00:00Z"))).toMatchObject({ status: "habis", sisa: 0, terbaik: 60 });
  });
  it("tanpa batas waktu selalu terbuka", () => {
    expect(statusKuisPra({ ...p, buka_at: null, tutup_at: null }, [], t("2030-01-01T00:00:00Z")).status).toBe("bisa_mulai");
  });
});

describe("validasiPengaturanKuisPra", () => {
  const sah = { aktif: true, jumlah_soal: 10, maks_percobaan: 3, nilai_lulus: 70, wajib_lulus: true, buka_at: "2026-11-01T07:00:00+07:00", tutup_at: "2026-11-05T22:00:00+07:00", kegiatan_anomali_id: 2, kegiatan_bank_id: 4 };
  it("menerima isian sah", () => {
    const v = validasiPengaturanKuisPra(sah);
    expect(v.ok && v.data).toMatchObject({ aktif: true, jumlah_soal: 10, maks_percobaan: 3, nilai_lulus: 70, wajib_lulus: true, kegiatan_anomali_id: 2, kegiatan_bank_id: 4 });
    expect(v.ok && v.data.buka_at).toBe("2026-11-01T00:00:00.000Z");
  });
  it("menolak di luar rentang dan waktu terbalik/tidak sah; id kosong jadi null", () => {
    expect(validasiPengaturanKuisPra({ ...sah, jumlah_soal: 0 }).ok).toBe(false);
    expect(validasiPengaturanKuisPra({ ...sah, jumlah_soal: 31 }).ok).toBe(false);
    expect(validasiPengaturanKuisPra({ ...sah, maks_percobaan: 11 }).ok).toBe(false);
    expect(validasiPengaturanKuisPra({ ...sah, nilai_lulus: 101 }).ok).toBe(false);
    expect(validasiPengaturanKuisPra({ ...sah, buka_at: "x" }).ok).toBe(false);
    expect(validasiPengaturanKuisPra({ ...sah, tutup_at: "2026-10-01T00:00:00Z" }).ok).toBe(false);
    const k = validasiPengaturanKuisPra({ ...sah, buka_at: "", tutup_at: null, kegiatan_anomali_id: "", kegiatan_bank_id: 0 });
    expect(k.ok && [k.data.buka_at, k.data.tutup_at, k.data.kegiatan_anomali_id, k.data.kegiatan_bank_id]).toEqual([null, null, null, null]);
  });
});
