import { describe, expect, it } from "vitest";
import { pisahMeja, urutSinyal, type Sinyal } from "@/lib/delego/meja";

describe("meja kerja", () => {
  it("memisah pemberitahuan dari tindakan", () => {
    const p = pisahMeja({ hari_ini: "", total: 2, butir: [
      { kode: "dlg_revisi", modul: "Delego", judul: "", jumlah: 2, isi: "", tautan: "/", nada: "amber", urut: 10 },
      { kode: "notif", modul: "Pemberitahuan", judul: "", jumlah: 5, isi: "", tautan: "/", nada: "abu", urut: 90 },
    ] });
    expect(p.tindakan.map((b) => b.kode)).toEqual(["dlg_revisi"]);
    expect(p.kabar.map((b) => b.kode)).toEqual(["notif"]);
  });
  it("sinyal aktif dan merah lebih dulu", () => {
    const s = (kode: string, nada: Sinyal["nada"], jumlah: number): Sinyal => ({ kode, judul: kode, nada, tautan: "/", jumlah, isi: [] });
    expect(urutSinyal([s("a", "abu", 3), s("b", "merah", 0), s("c", "amber", 1), s("d", "merah", 2)]).map((x) => x.kode)).toEqual(["d", "c", "a", "b"]);
  });
});
