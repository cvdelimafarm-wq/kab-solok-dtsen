import { describe, expect, it } from "vitest";
import { PILIHAN_LAINNYA, terapkanPilihan } from "../pilihInstruktur";
import { instrukturKosongLj, type Instruktur } from "../lanjutan";

const ORG = ["Adrianus", "M. Iqbal Hadi, SST.", "Riva Hestaria, A.Md."];
const y = (o: Partial<Instruktur> = {}): Instruktur => ({ ...instrukturKosongLj(), ...o });

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
  it("tertaut ke akun: memilih pegawai menyimpan id akun; pindah ke nama lain atau kosong melepasnya", () => {
    const h = terapkanPilihan(y({ level: "Inda", jam: 6 }), "Riva Hestaria, A.Md.", ORG, 563);
    expect(h).toEqual({ nama: "Riva Hestaria, A.Md.", level: "Inda", asal: "Internal BPS", jam: 6, akun: 563 });
    const lain = { ...terapkanPilihan(h, PILIHAN_LAINNYA, ORG), nama: "Dr. Narasumber Luar" };
    expect(lain.akun).toBeUndefined(); expect("akun" in lain).toBe(false); expect(lain.asal).toBe("");
    const kosong = terapkanPilihan(h, "", ORG);
    expect("akun" in kosong).toBe(false); expect(kosong).toMatchObject({ nama: "", asal: "" });
    const ganti = terapkanPilihan(h, "Adrianus", ORG, 4);
    expect(ganti).toMatchObject({ nama: "Adrianus", akun: 4, asal: "Internal BPS", level: "Inda", jam: 6 });
  });
});
