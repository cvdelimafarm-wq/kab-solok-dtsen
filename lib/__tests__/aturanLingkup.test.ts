// lib/__tests__/aturanLingkup.test.ts
// (6 Nov 2026) Uji aturan murni paket P2 audit Kelola: reset PIN berlingkup, cegah naik hak, saring per kegiatan.
import { describe, expect, it } from "vitest";
import type { PetaIzin } from "@/lib/sigapAkses";
import { bolehKelolaKegiatan, lingkupGabungan, periksaBeriPeran, periksaLingkupPeran, periksaSasaranReset, periksaUbahIzin, saringPerKegiatan } from "@/lib/aturanLingkup";

const izin = (o: Record<string, { level: "lihat" | "kelola"; semua?: boolean; kegiatan?: number[] }>): PetaIzin =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { level: v.level, semua: v.semua ?? false, kegiatan: v.kegiatan ?? [] }]));

const petugasBiasa = { aktif: true, peranKode: [], punyaIzinKelola: false, kegiatanPenugasan: [3] };

describe("lingkupGabungan", () => {
  it("menggabungkan kegiatan dari beberapa menu pada level kelola", () => {
    const i = izin({ "akses.kelola": { level: "kelola", kegiatan: [1] }, "translok.penugasan": { level: "kelola", kegiatan: [3, 1] } });
    expect(lingkupGabungan(i, ["akses.kelola", "translok.penugasan"]).toString()).toBe("1,3");
  });
  it("satu menu berlingkup semua menjadikan semua", () => {
    const i = izin({ "akses.kelola": { level: "kelola", semua: true }, "translok.penugasan": { level: "kelola", kegiatan: [3] } });
    expect(lingkupGabungan(i, ["akses.kelola", "translok.penugasan"])).toBe("semua");
  });
  it("menu yang hanya level lihat tidak dihitung pada level kelola", () => {
    expect(lingkupGabungan(izin({ "translok.penugasan": { level: "lihat", semua: true } }), ["translok.penugasan"])).toEqual([]);
  });
  it("tanpa izin = kosong", () => {
    expect(lingkupGabungan({}, ["akses.kelola"])).toEqual([]);
  });
});

describe("periksaSasaranReset", () => {
  it("Admin Aplikasi boleh mereset siapa pun yang aktif", () => {
    expect(periksaSasaranReset({ adminAplikasi: true, lingkup: "semua" }, { ...petugasBiasa, peranKode: ["admin_anggaran"], punyaIzinKelola: true })).toBeNull();
  });
  it("akun tidak aktif ditolak 409 untuk siapa pun", () => {
    expect(periksaSasaranReset({ adminAplikasi: true, lingkup: "semua" }, { ...petugasBiasa, aktif: false })?.status).toBe(409);
  });
  it("pengelola berlingkup boleh mereset petugas yang bertugas di kegiatannya", () => {
    expect(periksaSasaranReset({ adminAplikasi: false, lingkup: [3] }, petugasBiasa)).toBeNull();
  });
  it("pengelola berlingkup DITOLAK 403 untuk akun di luar kegiatannya", () => {
    const r = periksaSasaranReset({ adminAplikasi: false, lingkup: [1] }, petugasBiasa);
    expect(r?.status).toBe(403);
  });
  it("akun tanpa penugasan sama sekali ditolak bagi pengelola berlingkup", () => {
    expect(periksaSasaranReset({ adminAplikasi: false, lingkup: [1, 3] }, { ...petugasBiasa, kegiatanPenugasan: [] })?.status).toBe(403);
  });
  it("lingkup kosong menolak semua", () => {
    expect(periksaSasaranReset({ adminAplikasi: false, lingkup: [] }, petugasBiasa)?.status).toBe(403);
  });
  it("akun berperan admin dilindungi walau di kegiatan yang sama", () => {
    expect(periksaSasaranReset({ adminAplikasi: false, lingkup: "semua" }, { ...petugasBiasa, peranKode: ["admin_aplikasi"] })?.status).toBe(403);
    expect(periksaSasaranReset({ adminAplikasi: false, lingkup: [3] }, { ...petugasBiasa, peranKode: ["admin_anggaran"] })?.status).toBe(403);
  });
  it("pemegang izin kelola (mis. pengelola PSP lain) dilindungi", () => {
    expect(periksaSasaranReset({ adminAplikasi: false, lingkup: [3] }, { ...petugasBiasa, punyaIzinKelola: true })?.status).toBe(403);
  });
  it("lingkup semua (non Admin Aplikasi) boleh mereset akun biasa tanpa penugasan", () => {
    expect(periksaSasaranReset({ adminAplikasi: false, lingkup: "semua" }, { ...petugasBiasa, kegiatanPenugasan: [] })).toBeNull();
  });
});

describe("periksaUbahIzin (cegah naik hak sendiri)", () => {
  it("menolak mengubah izin peran yang dipegang sendiri", () => {
    expect(periksaUbahIzin({ adminAplikasi: false, peranDipegang: [5, 6], peranId: 6, menu: "translok.verifikasi" })?.status).toBe(403);
  });
  it("menolak mengubah menu hak tertinggi pada peran lain bagi non Admin Aplikasi", () => {
    expect(periksaUbahIzin({ adminAplikasi: false, peranDipegang: [5], peranId: 9, menu: "portal.kelola" })?.status).toBe(403);
    expect(periksaUbahIzin({ adminAplikasi: false, peranDipegang: [5], peranId: 9, menu: "akses.kelola" })?.status).toBe(403);
  });
  it("mengizinkan menu biasa pada peran lain", () => {
    expect(periksaUbahIzin({ adminAplikasi: false, peranDipegang: [5], peranId: 9, menu: "translok.verifikasi" })).toBeNull();
  });
  it("Admin Aplikasi tidak dibatasi", () => {
    expect(periksaUbahIzin({ adminAplikasi: true, peranDipegang: [5], peranId: 5, menu: "portal.kelola" })).toBeNull();
  });
});

describe("periksaBeriPeran", () => {
  it("menolak memberi peran ke diri sendiri bagi non Admin Aplikasi", () => {
    expect(periksaBeriPeran({ adminAplikasi: false, aktorId: 7, akunId: 7, menuPeran: ["translok.penugasan"] })?.status).toBe(403);
  });
  it("menolak peran yang memuat hak tertinggi bagi non Admin Aplikasi", () => {
    expect(periksaBeriPeran({ adminAplikasi: false, aktorId: 7, akunId: 8, menuPeran: ["portal.kelola"] })?.status).toBe(403);
    expect(periksaBeriPeran({ adminAplikasi: false, aktorId: 7, akunId: 8, menuPeran: ["x", "akses.kelola"] })?.status).toBe(403);
  });
  it("mengizinkan peran biasa ke akun lain", () => {
    expect(periksaBeriPeran({ adminAplikasi: false, aktorId: 7, akunId: 8, menuPeran: ["translok.penugasan"] })).toBeNull();
  });
  it("Admin Aplikasi tidak dibatasi", () => {
    expect(periksaBeriPeran({ adminAplikasi: true, aktorId: 7, akunId: 7, menuPeran: ["portal.kelola"] })).toBeNull();
  });
});

describe("bolehKelolaKegiatan & saringPerKegiatan", () => {
  const spdt = izin({ "bencana.admin": { level: "kelola", kegiatan: [2] } });
  const psp = izin({ "bencana.admin": { level: "kelola", kegiatan: [1, 3] } });
  const semua = izin({ "bencana.admin": { level: "kelola", semua: true } });
  const lihat = izin({ "bencana.admin": { level: "lihat", kegiatan: [1] } });

  it("403 lintas kegiatan: pengelola SPDT (kegiatan 2) tidak boleh mengelola kegiatan 1", () => {
    expect(bolehKelolaKegiatan(spdt, "bencana.admin", 1)).toBe(false);
    expect(bolehKelolaKegiatan(spdt, "bencana.admin", 2)).toBe(true);
  });
  it("pengelola PSP boleh kegiatan 1 dan 3, bukan 2", () => {
    expect(bolehKelolaKegiatan(psp, "bencana.admin", 1)).toBe(true);
    expect(bolehKelolaKegiatan(psp, "bencana.admin", 3)).toBe(true);
    expect(bolehKelolaKegiatan(psp, "bencana.admin", 2)).toBe(false);
  });
  it("lingkup semua boleh apa saja; level lihat tidak boleh mengelola", () => {
    expect(bolehKelolaKegiatan(semua, "bencana.admin", 99)).toBe(true);
    expect(bolehKelolaKegiatan(lihat, "bencana.admin", 1)).toBe(false);
    expect(bolehKelolaKegiatan({}, "bencana.admin", 1)).toBe(false);
  });

  const data = { boleh: true, kegiatan: [{ id: 1, nama: "PSP" }, { id: 2, nama: "SPDT" }, { id: 3, nama: "X" }], konfig: { "1": { a: 1 }, "2": { a: 2 }, "3": { a: 3 } } };
  it("menyaring kegiatan dan konfig ke lingkup, bidang lain tetap", () => {
    const r = saringPerKegiatan(data, spdt, "bencana.admin");
    expect(r.kegiatan.map((k) => k.id)).toEqual([2]);
    expect(Object.keys(r.konfig)).toEqual(["2"]);
    expect(r.boleh).toBe(true);
  });
  it("lingkup semua mengembalikan data apa adanya", () => {
    expect(saringPerKegiatan(data, semua, "bencana.admin")).toBe(data);
  });
  it("tanpa izin menu menghasilkan kosong", () => {
    const r = saringPerKegiatan(data, {}, "bencana.admin");
    expect(r.kegiatan).toEqual([]);
    expect(r.konfig).toEqual({});
  });
});

describe("periksaLingkupPeran (PJ kegiatan tidak mengurus peran di kegiatan lain)", () => {
  const pj2 = izin({ "akses.kelola": { level: "kelola", kegiatan: [2] } });
  const semua = izin({ "akses.kelola": { level: "kelola", semua: true } });
  it("PJ kegiatan 2 boleh pada kegiatan 2, ditolak pada kegiatan 1 (pengelola PSP)", () => {
    expect(periksaLingkupPeran({ adminAplikasi: false, izin: pj2, kegiatanId: 2 })).toBeNull();
    expect(periksaLingkupPeran({ adminAplikasi: false, izin: pj2, kegiatanId: 1 })?.status).toBe(403);
  });
  it("peran tanpa kegiatan hanya oleh pengelola akses berlingkup semua", () => {
    expect(periksaLingkupPeran({ adminAplikasi: false, izin: pj2, kegiatanId: null })?.status).toBe(403);
    expect(periksaLingkupPeran({ adminAplikasi: false, izin: semua, kegiatanId: null })).toBeNull();
    expect(periksaLingkupPeran({ adminAplikasi: false, izin: semua, kegiatanId: 99 })).toBeNull();
  });
  it("tanpa izin akses.kelola atau hanya lihat ditolak; Admin Aplikasi bebas", () => {
    expect(periksaLingkupPeran({ adminAplikasi: false, izin: {}, kegiatanId: 2 })?.status).toBe(403);
    expect(periksaLingkupPeran({ adminAplikasi: false, izin: izin({ "akses.kelola": { level: "lihat", semua: true } }), kegiatanId: 2 })?.status).toBe(403);
    expect(periksaLingkupPeran({ adminAplikasi: true, izin: {}, kegiatanId: null })).toBeNull();
  });
});
