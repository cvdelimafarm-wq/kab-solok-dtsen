import { describe, it, expect } from "vitest";
import { alamatSupervisi, kelompokDariAlamat, tabDariAlamat } from "@/lib/sigapKorwilTab";
import { alamatLembarPendataan, saringDariAlamat } from "@/lib/sigapPendataanSaring";
import { dariAman } from "@/lib/sigapNavigasi";

describe("?kelompok= Supervisi", () => {
  it("hanya bilangan bulat positif", () => {
    expect(kelompokDariAlamat("2")).toBe(2);
    expect(kelompokDariAlamat("12")).toBe(12);
    for (const x of [null, undefined, "", "0", "-1", "1.5", "abc", "1e3", "99999", " 2"]) expect(kelompokDariAlamat(x as string | null)).toBeNull();
  });
  it("alamatSupervisi membawa tab, kelompok, dan dari; tab-nya sah dan induk dikenali", () => {
    const a = alamatSupervisi(2, "/sigap/kegiatan/pascabencana/pendataan");
    const q = new URL(a, "https://x.test").searchParams;
    expect(tabDariAlamat(q.get("tab"))).toBe("lapangan");
    expect(kelompokDariAlamat(q.get("kelompok"))).toBe(2);
    expect(dariAman(q.get("dari"))).toBe("/sigap/kegiatan/pascabencana/pendataan");
    expect(alamatSupervisi(3)).toBe("/sigap/korwil?tab=lapangan&kelompok=3");
  });
});

describe("?saring= Lembar Pendataan", () => {
  it("hanya saringan yang dikenal", () => {
    expect(saringDariAlamat("belum")).toBe("belum");
    expect(saringDariAlamat("terdampak")).toBe("terdampak");
    for (const x of [null, undefined, "", "semua", "Belum", "x"]) expect(saringDariAlamat(x as string | null)).toBeNull();
  });
  it("masih ada KK tanpa hasil -> Sub SLS prioritas + Belum; semua selesai -> lembar biasa", () => {
    const dari = "/sigap/kegiatan/pascabencana/pendataan";
    const a = alamatLembarPendataan({ total: 40, didata: 12 }, dari);
    const q = new URL(a, "https://x.test").searchParams;
    expect(q.get("utama")).toBe("1");
    expect(saringDariAlamat(q.get("saring"))).toBe("belum");
    expect(dariAman(q.get("dari"))).toBe("/sigap/kegiatan/pascabencana/pendataan");
    expect(alamatLembarPendataan({ total: 40, didata: 0 }, dari)).toContain("saring=belum");
    expect(alamatLembarPendataan({ total: 40, didata: 40 }, dari)).toBe(`/sigap/pendataan?dari=${encodeURIComponent(dari)}`);
  });
});
