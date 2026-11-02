import { describe, expect, it } from "vitest";
import { adaDiDaftar, calonMitra, calonOrganik, cariAkunUnik, namaTerpakaiPeran, saringCalon, sudahTerpakai, terpakaiLain } from "../pilihNama";

const ORG = calonOrganik([{ nama: " Riva Hestaria, A.Md. ", akun_id: 563 }, { nama: "Adrianus", akun_id: 4 }, { nama: "Adrianus", akun_id: 4 }, { nama: "" }, { nama: "M. Iqbal Hadi, SST.", akun_id: 354 }]);
const MIT = calonMitra([
  { nama: "Siti Aminah", kecamatan: "Gunung Talang", akun_id: 101 }, { nama: "siti aminah", kecamatan: "Gunung Talang", akun_id: 102 }, { nama: "Siti Aminah", kecamatan: "Lembah Gumanti", akun_id: 103 },
  { nama: "Budi", kecamatan: null, akun_id: 7 }, { nama: "Rudi Sinaga", kecamatan: "Kubung", akun_id: 8 }, { nama: "  ", kecamatan: "X" },
]);

describe("calon nama", () => {
  it("organik: dipangkas, tanpa duplikat dan nama kosong, urut abjad", () => {
    expect(ORG.map((c) => c.nama)).toEqual(["Adrianus", "M. Iqbal Hadi, SST.", "Riva Hestaria, A.Md."]);
    expect(calonOrganik(null)).toEqual([]);
    expect(ORG.map((c) => c.akun)).toEqual([4, 354, 563]);
  });
  it("mitra: nama kembar di kecamatan berbeda dipertahankan dan dibedakan keterangan; duplikat persis dibuang; kecamatan kosong boleh", () => {
    expect(MIT.map((c) => `${c.nama}|${c.ket}`)).toEqual(["Budi|", "Rudi Sinaga|Kubung", "Siti Aminah|Gunung Talang", "Siti Aminah|Lembah Gumanti"]);
    expect(MIT.map((c) => c.akun)).toEqual([7, 8, 101, 103]);
    expect(calonMitra(undefined)).toEqual([]);
  });
});

describe("saring dan cek daftar", () => {
  it("tanpa kata: daftar dibatasi; dengan kata: awalan didahulukan, lalu mengandung, juga lewat kecamatan; tanpa beda huruf besar kecil", () => {
    expect(saringCalon(MIT, "", 2)).toHaveLength(2);
    expect(saringCalon(MIT, "RUD").map((c) => c.nama)).toEqual(["Rudi Sinaga"]);
    expect(saringCalon(MIT, "ami").map((c) => c.nama)).toEqual(["Siti Aminah", "Siti Aminah"]);
    expect(saringCalon(MIT, "kubung").map((c) => c.nama)).toEqual(["Rudi Sinaga"]);
    expect(saringCalon(ORG, "iqbal").map((c) => c.nama)).toEqual(["M. Iqbal Hadi, SST."]);
    expect(saringCalon(MIT, "zzz")).toEqual([]);
    // tanda baca tidak menghalangi: gelar ditulis tanpa koma dan titik, kata terbalik, atau nama + kecamatan
    const GEL = calonOrganik([{ nama: "Riva Hestaria, A.Md.", akun_id: 563 }, { nama: "Dina Marizka, S.Tr.Stat." }]);
    expect(saringCalon(GEL, "Riva Hestaria A.Md").map((c) => c.nama)).toEqual(["Riva Hestaria, A.Md."]);
    expect(saringCalon(GEL, "riva hestaria, a.md.").map((c) => c.nama)).toEqual(["Riva Hestaria, A.Md."]);
    expect(saringCalon(GEL, "hestaria riva").map((c) => c.nama)).toEqual(["Riva Hestaria, A.Md."]);
    expect(saringCalon(GEL, "marizka s tr stat").map((c) => c.nama)).toEqual(["Dina Marizka, S.Tr.Stat."]);
    expect(saringCalon(MIT, "sinaga kubung").map((c) => c.nama)).toEqual(["Rudi Sinaga"]);
    expect(saringCalon(GEL, "...")).toHaveLength(2);
    const awal = calonOrganik([{ nama: "Ria Dina" }, { nama: "Dina Marizka, S.Tr.Stat." }, { nama: "Hardina" }]);
    expect(saringCalon(awal, "din").map((c) => c.nama)).toEqual(["Dina Marizka, S.Tr.Stat.", "Hardina", "Ria Dina"]);
  });
  it("adaDiDaftar: kecocokan nama tanpa beda huruf dan spasi ganda; kosong = tidak ada", () => {
    expect(adaDiDaftar(ORG, "  adrianus ")).toBe(true);
    expect(adaDiDaftar(ORG, "Nua")).toBe(false);
    expect(adaDiDaftar(ORG, "")).toBe(false);
  });
  it("nama terpakai hanya oleh petugas lain pada peran dan status yang sama", () => {
    const P = [
      { id: "p1", nama: "Adrianus", peran: "pml", status: "Organik" },
      { id: "p2", nama: "Riva Hestaria, A.Md.", peran: "pml", status: "Organik" },
      { id: "p3", nama: "Rudi Sinaga", peran: "ppl", status: "Mitra" },
      { id: "p4", nama: "", peran: "pml", status: "Organik" },
    ];
    const t = namaTerpakaiPeran(P, { id: "p4", peran: "pml", status: "Organik" });
    expect(sudahTerpakai(t, "adrianus")).toBe(true);
    expect(sudahTerpakai(t, "Rudi Sinaga")).toBe(false);
    expect([...namaTerpakaiPeran(P, { id: "p1", peran: "pml", status: "Organik" })]).toEqual(["riva hestaria, a.md."]);
  });
  it("nama terpakai pada baris lain dalam satu daftar (instruktur satu kelas): tanpa baris sendiri dan tanpa nama kosong, kunci tanpa beda huruf", () => {
    const t = terpakaiLain(["Adrianus", " Riva Hestaria, A.Md. ", ""], 0);
    expect([...t]).toEqual(["riva hestaria, a.md."]);
    expect(sudahTerpakai(t, "RIVA HESTARIA, A.MD.")).toBe(true);
    expect([...terpakaiLain(["Adrianus", "", "Riva"], 2)]).toEqual(["adrianus"]);
  });
  it("cariAkunUnik: id akun hanya bila tepat satu calon bernama sama; nama kembar, tidak ada, kosong, atau calon tanpa id = null", () => {
    expect(cariAkunUnik(ORG, "  adrianus ")).toBe(4);
    expect(cariAkunUnik(ORG, "Nua")).toBeNull();
    expect(cariAkunUnik(ORG, "")).toBeNull();
    expect(cariAkunUnik(MIT, "Siti Aminah")).toBeNull(); // dua orang bernama sama di kecamatan berbeda
    expect(cariAkunUnik(MIT, "Rudi Sinaga")).toBe(8);
    expect(cariAkunUnik([{ nama: "Tanpa Id", ket: "" }], "Tanpa Id")).toBeNull();
  });
});
