import { describe, expect, it } from "vitest";
import { adaDiDaftar, calonMitra, calonOrganik, namaTerpakaiPeran, saringCalon, sudahTerpakai } from "../pilihNama";

const ORG = calonOrganik([" Riva Hestaria, A.Md. ", "Adrianus", "Adrianus", "", "M. Iqbal Hadi, SST."]);
const MIT = calonMitra([
  { nama: "Siti Aminah", kecamatan: "Gunung Talang" }, { nama: "siti aminah", kecamatan: "Gunung Talang" }, { nama: "Siti Aminah", kecamatan: "Lembah Gumanti" },
  { nama: "Budi", kecamatan: null }, { nama: "Rudi Sinaga", kecamatan: "Kubung" }, { nama: "  ", kecamatan: "X" },
]);

describe("calon nama", () => {
  it("organik: dipangkas, tanpa duplikat dan nama kosong, urut abjad", () => {
    expect(ORG.map((c) => c.nama)).toEqual(["Adrianus", "M. Iqbal Hadi, SST.", "Riva Hestaria, A.Md."]);
    expect(calonOrganik(null)).toEqual([]);
  });
  it("mitra: nama kembar di kecamatan berbeda dipertahankan dan dibedakan keterangan; duplikat persis dibuang; kecamatan kosong boleh", () => {
    expect(MIT.map((c) => `${c.nama}|${c.ket}`)).toEqual(["Budi|", "Rudi Sinaga|Kubung", "Siti Aminah|Gunung Talang", "Siti Aminah|Lembah Gumanti"]);
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
    const awal = calonOrganik(["Ria Dina", "Dina Marizka, S.Tr.Stat.", "Hardina"]);
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
});
