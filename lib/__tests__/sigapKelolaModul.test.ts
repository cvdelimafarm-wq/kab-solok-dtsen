// (10 Okt 2026) Uji daftar kegiatan per induk (halaman awal modul pengelolaan)
import { expect, test } from "vitest";
import { kelompokkanPerInduk, statusKegiatan, MODUL_KELOLA } from "../sigapKelolaModul";

test("kegiatan dikelompokkan per induk, sisanya ke 'lainnya'", () => {
  const g = kelompokkanPerInduk([{ id: 1 }, { id: 2 }, { id: 3 }], [{ kode: "a", nama: "A", kegiatan_ids: [1, 3] }], "Lain");
  expect(g.map((x) => [x.induk_nama, x.isi.map((y) => y.id)])).toEqual([["A", [1, 3]], ["Lain", [2]]]);
});

test("status menurut tanggal WIB", () => {
  expect(statusKegiatan({ aktif: true, tanggal_mulai: "2026-10-12", tanggal_selesai: null }, "2026-10-10")).toBe("akan_datang");
  expect(statusKegiatan({ aktif: true, tanggal_mulai: "2026-10-08", tanggal_selesai: "2026-10-08" }, "2026-10-10")).toBe("selesai");
  expect(statusKegiatan({ aktif: false, tanggal_mulai: null, tanggal_selesai: null }, "2026-10-10")).toBe("nonaktif");
});

test("modul pelatihan hanya kegiatan berjenis pelatihan", () => {
  expect(MODUL_KELOLA.pelatihan.cocok({ id: 1, kode: "x", nama: "", jenis: "pendataan", aktif: true })).toBe(false);
  expect(MODUL_KELOLA.translok.cocok({ id: 1, kode: "x", nama: "", jenis: "pendataan", aktif: true })).toBe(true);
});
