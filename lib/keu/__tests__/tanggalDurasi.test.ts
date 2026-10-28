import { describe, expect, it } from "vitest";
import { gantiJumlahHari, gantiMulai, gantiSelesai, jumlahHariAntara, keteranganHari, selesaiDariJumlah } from "../tanggalDurasi";

describe("jumlahHariAntara", () => {
  it("menghitung inklusif", () => {
    expect(jumlahHariAntara("2026-11-12", "2026-11-25")).toBe(14);
    expect(jumlahHariAntara("2026-11-29", "2026-11-29")).toBe(1);
    expect(jumlahHariAntara("2026-12-30", "2027-01-02")).toBe(4);
    expect(jumlahHariAntara("2028-02-28", "2028-03-01")).toBe(3); // tahun kabisat
  });
  it("null bila kosong, tidak sah, atau selesai mendahului mulai", () => {
    expect(jumlahHariAntara("", "2026-11-25")).toBeNull();
    expect(jumlahHariAntara("2026-11-12", "")).toBeNull();
    expect(jumlahHariAntara("2026-11-12", "2026-11-11")).toBeNull();
    expect(jumlahHariAntara("2026-13-40", "2026-11-11")).toBeNull();
    expect(jumlahHariAntara(null, undefined)).toBeNull();
  });
});

describe("selesaiDariJumlah", () => {
  it("mulai + jumlah hari -> selesai", () => {
    expect(selesaiDariJumlah("2026-11-12", 14)).toBe("2026-11-25");
    expect(selesaiDariJumlah("2026-11-29", 1)).toBe("2026-11-29");
    expect(selesaiDariJumlah("2026-12-30", 4)).toBe("2027-01-02");
  });
  it("kosong bila masukan tidak sah", () => {
    expect(selesaiDariJumlah("", 3)).toBe("");
    expect(selesaiDariJumlah("2026-11-12", 0)).toBe("");
    expect(selesaiDariJumlah("2026-11-12", 367)).toBe("");
    expect(selesaiDariJumlah("2026-11-12", 2.5)).toBe("");
  });
});

describe("gantiMulai", () => {
  it("menjaga jumlah hari: rentang bergeser", () => {
    expect(gantiMulai({ mulai: "2026-11-12", selesai: "2026-11-25" }, "2026-11-05")).toEqual({ mulai: "2026-11-05", selesai: "2026-11-18" });
  });
  it("tanpa durasi sah: selesai dibiarkan", () => {
    expect(gantiMulai({ mulai: "", selesai: "2026-11-25" }, "2026-11-12")).toEqual({ mulai: "2026-11-12", selesai: "2026-11-25" });
    expect(gantiMulai({ mulai: "", selesai: "" }, "2026-11-12")).toEqual({ mulai: "2026-11-12", selesai: "" });
  });
  it("selesai yang sudah mendahului mulai baru disamakan (1 hari)", () => {
    expect(gantiMulai({ mulai: "", selesai: "2026-11-10" }, "2026-11-12")).toEqual({ mulai: "2026-11-12", selesai: "2026-11-12" });
  });
  it("mulai dikosongkan: selesai tetap", () => {
    expect(gantiMulai({ mulai: "2026-11-12", selesai: "2026-11-25" }, "")).toEqual({ mulai: "", selesai: "2026-11-25" });
  });
});

describe("gantiSelesai", () => {
  it("hanya mengganti selesai", () => {
    expect(gantiSelesai({ mulai: "2026-11-12", selesai: "2026-11-25" }, "2026-11-30")).toEqual({ mulai: "2026-11-12", selesai: "2026-11-30" });
    expect(jumlahHariAntara("2026-11-12", "2026-11-30")).toBe(19);
  });
  it("selesai mendahului mulai tidak diubah diam-diam (jumlah hari jadi kosong)", () => {
    const r = gantiSelesai({ mulai: "2026-11-12", selesai: "2026-11-25" }, "2026-11-01");
    expect(r.selesai).toBe("2026-11-01");
    expect(jumlahHariAntara(r.mulai, r.selesai)).toBeNull();
  });
});

describe("gantiJumlahHari", () => {
  it("mulai ada -> selesai dihitung", () => {
    expect(gantiJumlahHari({ mulai: "2026-11-12", selesai: "" }, 14)).toEqual({ mulai: "2026-11-12", selesai: "2026-11-25" });
    expect(gantiJumlahHari({ mulai: "2026-11-12", selesai: "2026-11-25" }, 3)).toEqual({ mulai: "2026-11-12", selesai: "2026-11-14" });
  });
  it("hanya selesai ada -> mulai dihitung mundur", () => {
    expect(gantiJumlahHari({ mulai: "", selesai: "2026-11-25" }, 14)).toEqual({ mulai: "2026-11-12", selesai: "2026-11-25" });
  });
  it("keduanya kosong atau jumlah tidak sah -> tidak berubah", () => {
    const r = { mulai: "", selesai: "" };
    expect(gantiJumlahHari(r, 5)).toBe(r);
    const s = { mulai: "2026-11-12", selesai: "2026-11-25" };
    expect(gantiJumlahHari(s, 0)).toBe(s);
    expect(gantiJumlahHari(s, Number.NaN)).toBe(s);
  });
  it("dijepit ke 366 hari", () => {
    expect(jumlahHariAntara("2026-01-01", gantiJumlahHari({ mulai: "2026-01-01", selesai: "" }, 9999).selesai)).toBe(366);
  });
});

describe("keteranganHari", () => {
  it("menempel pada teks rentang", () => {
    expect(keteranganHari("2026-11-12", "2026-11-25")).toBe(" (14 hari)");
    expect(keteranganHari("", "2026-11-25")).toBe("");
  });
});
