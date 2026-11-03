// (3 Nov 2026) "Masuk sebagai": peran yang tersedia, pilihan awal, dan tab menurut peran bagi akun berkewenangan ganda.
import { describe, expect, it } from "vitest";
import { LABEL_PERAN, adalahPeran, jenisDariPeran, kunciPeran, labelPilihan, peranPilihan, peranTersedia, perluPemilih, pilihPeran, tabUntukPeran } from "../peranMasuk";

const K = (o: Partial<Parameters<typeof peranTersedia>[0]> = {}) => ({ peserta: false, instruktur: false, lihat: false, kelola: false, ...o });

describe("peranTersedia", () => {
  it("urut dari kewenangan terbesar; izin kelola = PJ (menggantikan Panitia), izin lihat saja = Panitia", () => {
    expect(peranTersedia(K({ peserta: true, instruktur: true, lihat: true, kelola: true }))).toEqual(["pj", "instruktur", "peserta"]);
    expect(peranTersedia(K({ peserta: true, instruktur: true, lihat: true }))).toEqual(["panitia", "instruktur", "peserta"]);
    expect(peranTersedia(K({ lihat: true, instruktur: true }))).toEqual(["panitia", "instruktur"]);
  });
  it("akun biasa: satu peran atau tidak ada, dropdown tidak perlu", () => {
    expect(peranTersedia(K({ peserta: true }))).toEqual(["peserta"]);
    expect(peranTersedia(K())).toEqual([]);
    expect(perluPemilih(["peserta"])).toBe(false);
    expect(perluPemilih(["pj", "peserta"])).toBe(true);
  });
});

describe("pilihPeran", () => {
  const ada = ["panitia", "instruktur", "peserta"] as const;
  it("pilihan tersimpan dipakai bila masih tersedia; yang tak lagi tersedia diabaikan", () => {
    expect(pilihPeran(ada, "instruktur")).toBe("instruktur");
    expect(pilihPeran(["panitia", "peserta"], "instruktur")).toBe("panitia");
    expect(pilihPeran(ada, "ngawur")).toBe("panitia");
  });
  it("tanpa pilihan: kewenangan terbesar; tetapi peserta yang belum menerima undangan masuk sebagai peserta dahulu", () => {
    expect(pilihPeran(ada, null)).toBe("panitia");
    expect(pilihPeran(ada, null, true)).toBe("peserta");
    expect(pilihPeran(["panitia", "instruktur"], null, true)).toBe("panitia");
  });
  it("pilihan tersimpan menang atas aturan undangan; tanpa peran = null", () => {
    expect(pilihPeran(ada, "panitia", true)).toBe("panitia");
    expect(pilihPeran([], "peserta")).toBeNull();
  });
});

describe("peran -> jenis, tab, label", () => {
  it("PJ dianggap panitia di mata hierarki", () => {
    expect(jenisDariPeran("pj")).toBe("panitia");
    expect(jenisDariPeran("instruktur")).toBe("instruktur");
  });
  it("peserta melihat tab Pelatihan; peran lain melihat Absen peserta", () => {
    expect(tabUntukPeran("peserta")).toEqual({ pelatihan: true, absen: false });
    for (const p of ["pj", "panitia", "instruktur"] as const) expect(tabUntukPeran(p)).toEqual({ pelatihan: false, absen: true });
  });
  it("label dan kunci penyimpanan per kegiatan", () => {
    expect(LABEL_PERAN.pj).toContain("PJ");
    expect(kunciPeran(7)).toBe("sigap_pel_peran_7");
    expect(adalahPeran("pj")).toBe(true);
    expect(adalahPeran("admin")).toBe(false);
  });
});

describe("peranPilihan: pengelola bebas berganti peran", () => {
  it("izin kelola (PJ) boleh memilih semua peran; izin lihat (panitia) semua kecuali PJ", () => {
    expect(peranPilihan(K({ kelola: true, lihat: true }))).toEqual(["pj", "panitia", "instruktur", "peserta"]);
    expect(peranPilihan(K({ lihat: true }))).toEqual(["panitia", "instruktur", "peserta"]);
  });
  it("tanpa izin pengelola hanya peran yang benar-benar dimiliki", () => {
    expect(peranPilihan(K({ peserta: true, instruktur: true }))).toEqual(["instruktur", "peserta"]);
    expect(peranPilihan(K({ peserta: true }))).toEqual(["peserta"]);
    expect(perluPemilih(peranPilihan(K({ kelola: true, lihat: true })))).toBe(true);
  });
  it("peran yang belum terdaftar diberi label pratinjau; Panitia tidak dianggap pratinjau bagi PJ", () => {
    const nyata = ["pj"] as const;
    expect(labelPilihan("pj", nyata)).toBe(LABEL_PERAN.pj);
    expect(labelPilihan("panitia", nyata)).toBe(LABEL_PERAN.panitia);
    expect(labelPilihan("instruktur", nyata)).toBe("Instruktur (pratinjau)");
    expect(labelPilihan("peserta", ["pj", "peserta"])).toBe("Peserta");
  });
});
