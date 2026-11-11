import { describe, expect, it } from "vitest";
import { susunMenu, type IzinMenuSidebar } from "../sigapMenuV2";

const dasar: IzinMenuSidebar = {
  tokenPetugas: null, adaSubAdmin: false, perencanaan: false, pelatihanKelola: false, kontrak: false, pediaKelola: false, lapangan: false, pendataanKelola: false,
  akses: false, aplikasi: false, delego: true, usulan: false,
};
const ids = (i: IzinMenuSidebar) => susunMenu(i).flatMap((k) => k.item.map((x) => x.id));

describe("menu Master wilayah", () => {
  it("tidak tampil tanpa izin (pemanggil lama tanpa bidang masterWilayah tetap sah)", () => {
    expect(ids(dasar)).not.toContain("master-wilayah");
    expect(ids({ ...dasar, masterWilayah: false })).not.toContain("master-wilayah");
  });
  it("tampil di Pengelolaan dengan alamat dan penanda aktif bagi pemegang izin", () => {
    const pengelolaan = susunMenu({ ...dasar, masterWilayah: true }).find((k) => k.kode === "pengelolaan");
    const item = pengelolaan?.item.find((x) => x.id === "master-wilayah");
    expect(item).toMatchObject({ href: "/sigap/kelola/master", aktifKode: "master_wilayah", label: "Master" });
  });
});
