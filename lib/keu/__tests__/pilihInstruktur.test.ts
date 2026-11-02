import { describe, expect, it } from "vitest";
import { geserSetelahHapus, namaOrganik, namaTerpakai, nilaiPilihan, PILIHAN_LAINNYA, terapkanPilihan } from "../pilihInstruktur";
import { instrukturKosongLj, type Instruktur } from "../lanjutan";

const ORG = namaOrganik([{ nama: " Riva Hestaria, A.Md. " }, { nama: "Adrianus" }, { nama: "adrianus" }, { nama: "Adrianus" }, { nama: "" }, { nama: "M. Iqbal Hadi, SST." }]);
const y = (o: Partial<Instruktur> = {}): Instruktur => ({ ...instrukturKosongLj(), ...o });

describe("daftar pegawai organik", () => {
  it("dipangkas, tanpa duplikat persis dan tanpa nama kosong, urut abjad Indonesia; null aman", () => {
    expect(ORG).toEqual(["adrianus", "Adrianus", "M. Iqbal Hadi, SST.", "Riva Hestaria, A.Md."]);
    expect(namaOrganik(null)).toEqual([]);
    expect(namaOrganik(undefined)).toEqual([]);
  });
});

describe("nilai dropdown", () => {
  it("nama pegawai -> namanya; kosong -> kosong; nama lain -> Lainnya; memilih Lainnya dengan nama kosong -> Lainnya", () => {
    expect(nilaiPilihan("Riva Hestaria, A.Md.", ORG, false)).toBe("Riva Hestaria, A.Md.");
    expect(nilaiPilihan("  Riva   Hestaria, A.Md. ", ORG, false)).toBe("Riva Hestaria, A.Md.");
    expect(nilaiPilihan("", ORG, false)).toBe("");
    expect(nilaiPilihan("Dr. Narasumber Luar", ORG, false)).toBe(PILIHAN_LAINNYA);
    expect(nilaiPilihan("", ORG, true)).toBe(PILIHAN_LAINNYA);
  });
});

describe("menerapkan pilihan", () => {
  it("memilih pegawai: nama terisi dan asal otomatis Internal BPS; level dan jam tidak berubah", () => {
    const h = terapkanPilihan(y({ level: "Inda", jam: 6 }), "Riva Hestaria, A.Md.", ORG);
    expect(h).toEqual({ nama: "Riva Hestaria, A.Md.", level: "Inda", asal: "Internal BPS", jam: 6 });
  });
  it("pindah dari pegawai ke Lainnya: nama dikosongkan dan asal otomatis dilepas; dari instruktur luar tidak menghapus nama yang diketik", () => {
    expect(terapkanPilihan(y({ nama: "Riva Hestaria, A.Md.", asal: "Internal BPS" }), PILIHAN_LAINNYA, ORG)).toMatchObject({ nama: "", asal: "" });
    expect(terapkanPilihan(y({ nama: "Dr. Narasumber Luar", asal: "Eksternal" }), PILIHAN_LAINNYA, ORG)).toMatchObject({ nama: "Dr. Narasumber Luar", asal: "Eksternal" });
  });
  it("memilih kosong: nama dikosongkan; asal otomatis dari pegawai dilepas, asal pilihan sendiri dipertahankan", () => {
    expect(terapkanPilihan(y({ nama: "Adrianus", asal: "Internal BPS" }), "", ORG)).toMatchObject({ nama: "", asal: "" });
    expect(terapkanPilihan(y({ nama: "Dr. X", asal: "Eksternal" }), "", ORG)).toMatchObject({ nama: "", asal: "Eksternal" });
  });
});

describe("pegawai tidak terpilih dua kali dan indeks Lainnya bergeser", () => {
  it("nama terpakai oleh baris lain (bukan baris sendiri)", () => {
    const d = [y({ nama: "Adrianus" }), y({ nama: "Riva Hestaria, A.Md." }), y()];
    expect([...namaTerpakai(d, 0)]).toEqual(["Riva Hestaria, A.Md."]);
    expect([...namaTerpakai(d, 2)].sort()).toEqual(["Adrianus", "Riva Hestaria, A.Md."]);
  });
  it("menghapus baris menggeser indeks sesudahnya dan membuang indeks yang dihapus", () => {
    expect(geserSetelahHapus([0, 2, 3], 2)).toEqual([0, 2]);
    expect(geserSetelahHapus([1], 0)).toEqual([0]);
    expect(geserSetelahHapus([], 0)).toEqual([]);
  });
});
