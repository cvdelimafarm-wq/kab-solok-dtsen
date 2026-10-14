// lib/__tests__/sigapTujuan.test.ts
// (14 Okt 2026) Uji tujuan ?lanjut= yang aman (lib/sigapTujuan.ts).
import { describe, expect, it } from "vitest";
import { alamatMasukDengan, bersihkanTujuan } from "@/lib/sigapTujuan";

describe("bersihkanTujuan", () => {
  it("menerima alamat internal biasa", () => {
    expect(bersihkanTujuan("/")).toBe("/");
    expect(bersihkanTujuan("/sigap/kelola")).toBe("/sigap/kelola");
    expect(bersihkanTujuan("/sigap/kegiatan/translok-46?dari=%2Fsigap%2Fkegiatan%2Fpascabencana%2Fpendataan")).toBe("/sigap/kegiatan/translok-46?dari=%2Fsigap%2Fkegiatan%2Fpascabencana%2Fpendataan");
    expect(bersihkanTujuan("/dashboard")).toBe("/dashboard");
  });
  it("menolak pengalihan ke luar: //host, /\\host, skema, kosong, terlalu panjang", () => {
    expect(bersihkanTujuan("//evil.com")).toBeNull();
    expect(bersihkanTujuan("/\\evil.com")).toBeNull();
    expect(bersihkanTujuan("/\\/evil.com")).toBeNull();
    expect(bersihkanTujuan("https://evil.com")).toBeNull();
    expect(bersihkanTujuan("javascript:alert(1)")).toBeNull();
    expect(bersihkanTujuan("evil.com")).toBeNull();
    expect(bersihkanTujuan("")).toBeNull();
    expect(bersihkanTujuan(null)).toBeNull();
    expect(bersihkanTujuan(`/${"a".repeat(400)}`)).toBeNull();
  });
  it("menolak .., karakter kontrol, dan spasi", () => {
    expect(bersihkanTujuan("/sigap/../admin")).toBeNull();
    expect(bersihkanTujuan("/sigap/\tx")).toBeNull();
    expect(bersihkanTujuan("/sigap/\nx")).toBeNull();
    expect(bersihkanTujuan("/sigap/a b")).toBeNull();
  });
});

describe("alamatMasukDengan", () => {
  it("membawa halaman sekarang sebagai ?lanjut=", () => {
    expect(alamatMasukDengan("/sigap/kegiatan/translok-46", "?dari=%2Fsigap%2Fx")).toBe(`/?lanjut=${encodeURIComponent("/sigap/kegiatan/translok-46?dari=%2Fsigap%2Fx")}`);
  });
  it("Beranda atau alamat tidak aman = tanpa ?lanjut=", () => {
    expect(alamatMasukDengan("/", "")).toBe("/");
    expect(alamatMasukDengan("//evil", "")).toBe("/");
  });
});
