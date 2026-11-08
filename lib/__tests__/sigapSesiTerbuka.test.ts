// lib/__tests__/sigapSesiTerbuka.test.ts
// (9 Nov 2026) Uji aturan murni modal pemblokir sesi dibuka (pretest, posttest, roleplay, kuis).
import { describe, expect, it } from "vitest";
import { alamatTes, jalurBebasBlokir, kuisPerluModal, namaSesi, pesanSesiDibuka, roleplayPerluModal, sedangDiHalamanSesi, teksModal, tesPerluModal, urutkanSesi, type SesiTerbuka } from "../sigapSesiTerbuka";
import { MAKS_ISI_PUSH, MAKS_JUDUL_PUSH } from "../sigapPushUtil";

const SEKARANG = new Date("2026-11-09T01:10:00Z");
const BATAS_DEPAN = "2026-11-09T01:25:00Z";
const BATAS_LALU = "2026-11-09T01:00:00Z";

describe("tesPerluModal", () => {
  const dasar = { agenda: { status: "berjalan" as const }, tesAktif: true, terkunci: false, sesi: null, sekarang: SEKARANG };
  it("agenda berjalan dan belum mulai = mulai", () => {
    expect(tesPerluModal(dasar)).toBe("mulai");
  });
  it("tanpa agenda (berjadwal biasa) tidak memblokir", () => {
    expect(tesPerluModal({ ...dasar, agenda: null })).toBeNull();
  });
  it("menunggu atau selesai dan belum mulai = tidak", () => {
    expect(tesPerluModal({ ...dasar, agenda: { status: "menunggu" } })).toBeNull();
    expect(tesPerluModal({ ...dasar, agenda: { status: "selesai" } })).toBeNull();
  });
  it("sudah mulai dan waktu masih ada = lanjut, juga setelah jendela ditutup", () => {
    expect(tesPerluModal({ ...dasar, sesi: { selesai_at: null, batas_at: BATAS_DEPAN } })).toBe("lanjut");
    expect(tesPerluModal({ ...dasar, agenda: { status: "selesai" }, sesi: { selesai_at: null, batas_at: BATAS_DEPAN } })).toBe("lanjut");
  });
  it("sudah kirim atau waktu habis = tidak", () => {
    expect(tesPerluModal({ ...dasar, sesi: { selesai_at: "2026-11-09T01:09:00Z", batas_at: BATAS_DEPAN } })).toBeNull();
    expect(tesPerluModal({ ...dasar, sesi: { selesai_at: null, batas_at: BATAS_LALU } })).toBeNull();
  });
  it("toleransi detik memperpanjang status lanjut sedikit", () => {
    expect(tesPerluModal({ ...dasar, sesi: { selesai_at: null, batas_at: "2026-11-09T01:09:50Z" }, toleransiDetik: 30 })).toBe("lanjut");
    expect(tesPerluModal({ ...dasar, sesi: { selesai_at: null, batas_at: "2026-11-09T01:09:50Z" }, toleransiDetik: 5 })).toBeNull();
  });
  it("tes tidak aktif atau terkunci tahapan tidak memblokir (peserta tidak boleh terjebak)", () => {
    expect(tesPerluModal({ ...dasar, tesAktif: false })).toBeNull();
    expect(tesPerluModal({ ...dasar, terkunci: true })).toBeNull();
  });
});

describe("roleplay dan kuis", () => {
  it("roleplay: berjalan dan belum mengisi", () => {
    expect(roleplayPerluModal({ status: "berjalan", sudahIsi: false })).toBe(true);
    expect(roleplayPerluModal({ status: "berjalan", sudahIsi: true })).toBe(false);
    expect(roleplayPerluModal({ status: "selesai", sudahIsi: false })).toBe(false);
    expect(roleplayPerluModal({ status: null, sudahIsi: false })).toBe(false);
  });
  it("kuis: lobi dan belum bergabung; sudah mulai hanya bila gabung terlambat diizinkan", () => {
    expect(kuisPerluModal({ status: "lobi", gabungTerlambat: false, sudahGabung: false })).toBe(true);
    expect(kuisPerluModal({ status: "soal", gabungTerlambat: false, sudahGabung: false })).toBe(false);
    expect(kuisPerluModal({ status: "soal", gabungTerlambat: true, sudahGabung: false })).toBe(true);
    expect(kuisPerluModal({ status: "lobi", gabungTerlambat: true, sudahGabung: true })).toBe(false);
    expect(kuisPerluModal({ status: "selesai", gabungTerlambat: true, sudahGabung: false })).toBe(false);
    expect(kuisPerluModal({ status: null, gabungTerlambat: true, sudahGabung: false })).toBe(false);
  });
});

describe("teks", () => {
  it("modal tes: mulai vs lanjut", () => {
    expect(teksModal({ jenis: "pretest", judul: "Pretest", lanjut: false }).tombol).toBe("Kerjakan Pretest sekarang");
    expect(teksModal({ jenis: "posttest", judul: "Posttest", lanjut: true }).tombol).toBe("Lanjutkan Posttest");
    expect(teksModal({ jenis: "pretest", judul: "Pretest", lanjut: false }).isi).toContain("jangan membuka halaman lain");
  });
  it("modal roleplay dan kuis", () => {
    expect(teksModal({ jenis: "roleplay", judul: "Roleplay Vanguard", lanjut: false }).judul).toBe("Roleplay Vanguard dimulai");
    expect(teksModal({ jenis: "kuis", judul: "Kuis Adu Sigap", lanjut: false }).tombol).toBe("Bergabung ke kuis");
  });
  it("namaSesi", () => {
    expect(namaSesi("pretest")).toBe("Pretest");
    expect(namaSesi("kuis")).toBe("Kuis Adu Sigap");
    expect(namaSesi("kuis", " Kuis Akhir ")).toBe("Kuis Akhir");
  });
  it("pesan push muat dalam batas panjang", () => {
    for (const j of ["pretest", "posttest", "roleplay", "kuis"] as const) {
      const p = pesanSesiDibuka(j, "x");
      expect(p.judul.length).toBeLessThanOrEqual(MAKS_JUDUL_PUSH);
      expect(p.isi.length).toBeLessThanOrEqual(MAKS_ISI_PUSH);
    }
    expect(pesanSesiDibuka("pretest").judul).toBe("Pretest dimulai");
  });
});

describe("klien", () => {
  const s = (jenis: SesiTerbuka["jenis"], url: string, kunci: string): SesiTerbuka => ({ kunci, jenis, judul: jenis, lanjut: false, url });
  it("urutan: pretest, posttest, roleplay, kuis", () => {
    const u = urutkanSesi([s("kuis", "/k", "k1"), s("roleplay", "/r", "r1"), s("posttest", alamatTes("posttest"), "t2"), s("pretest", alamatTes("pretest"), "t1")]);
    expect(u.map((x) => x.jenis)).toEqual(["pretest", "posttest", "roleplay", "kuis"]);
  });
  it("sedangDiHalamanSesi mengabaikan query dan garis miring akhir", () => {
    const d = [s("pretest", alamatTes("pretest"), "a"), s("roleplay", "/sigap/vanguard/roleplay?k=7", "b")];
    expect(sedangDiHalamanSesi("/sigap/pelatihan/tes/pretest", d)).toBe(true);
    expect(sedangDiHalamanSesi("/sigap/pelatihan/tes/pretest/", d)).toBe(true);
    expect(sedangDiHalamanSesi("/sigap/vanguard/roleplay", d)).toBe(true);
    expect(sedangDiHalamanSesi("/sigap/pelatihan/hari-ini", d)).toBe(false);
    expect(sedangDiHalamanSesi("/sigap/pelatihan/tes/posttest", d)).toBe(false);
  });
  it("jalur pengelola tidak pernah diblokir", () => {
    expect(jalurBebasBlokir("/sigap/kelola/pelatihan")).toBe(true);
    expect(jalurBebasBlokir("/sigap/pelatihan/kelola")).toBe(true);
    expect(jalurBebasBlokir("/sigap/admin/akun")).toBe(true);
    expect(jalurBebasBlokir("/sigap/pelatihan/hari-ini")).toBe(false);
  });
});
