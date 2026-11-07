// (7 Nov 2026) Menu "Arsip & penomoran" hanya tampil bagi pemegang izin arsip.kelola, di kelompok Pengelolaan.
import { describe, expect, it } from "vitest";
import { susunMenu, type IzinMenuSidebar } from "../sigapMenuV2";

const DASAR: IzinMenuSidebar = {
  tokenPetugas: null, adaSubAdmin: false, perencanaan: false, pelatihanKelola: false, kontrak: false, pediaKelola: false,
  lapangan: false, pendataanKelola: false, akses: false, aplikasi: false, delego: false, usulan: false,
};
const item = (i: IzinMenuSidebar) => susunMenu(i).find((k) => k.kode === "pengelolaan")!.item.find((x) => x.id === "arsip");

describe("menu Arsip", () => {
  it("tidak tampil tanpa izin, dan pemanggil lama tanpa field arsip tetap sah", () => {
    expect(item(DASAR)).toBeUndefined();
    expect(item({ ...DASAR, arsip: false })).toBeUndefined();
  });
  it("tampil dengan izin, menuju halaman kelola/arsip dan menyala lewat kode menu arsip", () => {
    const it = item({ ...DASAR, arsip: true });
    expect(it).toMatchObject({ label: "Arsip & penomoran", href: "/sigap/kelola/arsip", aktifKode: "arsip" });
    expect(it?.status).toBeUndefined();
  });
});
