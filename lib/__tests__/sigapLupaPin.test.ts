import { describe, expect, it } from "vitest";
import { MIN_COCOK_RESET, nilaiKolomLupa, nipValid, normNip, pesanDataKurang, putusanLupa, type Masukan, type Pembanding } from "../sigapLupaPin";

const NIK = "1303010101010001";
const EMAIL = "riva@contoh.id";
const TGL = "1999-05-17";
const NIP = "340123456";

const masukan = (o: Partial<Masukan> = {}): Masukan => ({ nik: NIK, email: EMAIL, tgl: TGL, nip: "", ...o });
const bank = (o: Partial<Pembanding> = {}): Pembanding => ({ nik: [NIK], email: [EMAIL], tgl: [TGL], nip: [], ...o });

describe("normNip / nipValid", () => {
  it("hanya menyisakan digit dan memeriksa panjang 9-18", () => {
    expect(normNip(" 340 123-456 ")).toBe("340123456");
    expect(normNip(null)).toBe("");
    expect(nipValid("340123456")).toBe(true);
    expect(nipValid("199905172023011001")).toBe(true);
    expect(nipValid("12345678")).toBe(false);
    expect(nipValid("1234567890123456789")).toBe(false);
    expect(nipValid("")).toBe(false);
  });
});

describe("nilaiKolomLupa", () => {
  it("nama tidak dikenal -> nama salah, sisanya belum dicek", () => {
    expect(nilaiKolomLupa(masukan(), null)).toEqual({ nama: "salah", nik: "belum_dicek", email: "belum_dicek", tanggal_lahir: "belum_dicek" });
  });
  it("kolom nip hanya muncul bila NIP diisi", () => {
    expect(nilaiKolomLupa(masukan(), bank())).not.toHaveProperty("nip");
    expect(nilaiKolomLupa(masukan({ nip: NIP }), bank({ nip: [NIP] })).nip).toBe("benar");
    expect(nilaiKolomLupa(masukan({ nip: NIP }), null).nip).toBe("belum_dicek");
  });
  it("benar / salah / belum_ada per kolom", () => {
    const k = nilaiKolomLupa(masukan({ email: "lain@x.id" }), bank({ tgl: [] }));
    expect(k).toEqual({ nama: "benar", nik: "benar", email: "salah", tanggal_lahir: "belum_ada" });
  });
  it("NIP yang diisi tapi tidak tercatat di sistem = belum_ada, bukan salah", () => {
    expect(nilaiKolomLupa(masukan({ nip: NIP }), bank({ nip: [] })).nip).toBe("belum_ada");
    expect(nilaiKolomLupa(masukan({ nip: "999999999" }), bank({ nip: [NIP] })).nip).toBe("salah");
  });
});

describe("putusanLupa", () => {
  it("lolos bila minimal 2 data pribadi benar dan tak ada yang salah", () => {
    expect(putusanLupa(nilaiKolomLupa(masukan(), bank()))).toEqual({ putusan: "lolos", cocok: 3 });
    expect(putusanLupa(nilaiKolomLupa(masukan(), bank({ email: [], tgl: [] })))).toEqual({ putusan: "kurang", cocok: 1 });
    expect(putusanLupa(nilaiKolomLupa(masukan(), bank({ tgl: [] })))).toEqual({ putusan: "lolos", cocok: 2 });
  });
  it("kasus Riva: hampir tak ada data pembanding -> 'kurang' (tidak dihitung gagal), bukan 'salah'", () => {
    const k = nilaiKolomLupa(masukan(), bank({ nik: [], email: [], tgl: [] }));
    expect(putusanLupa(k)).toEqual({ putusan: "kurang", cocok: 0 });
  });
  it("NIP menutup kekurangan: 1 data biasa + NIP benar = lolos", () => {
    const k = nilaiKolomLupa(masukan({ nip: NIP }), bank({ email: [], tgl: [], nip: [NIP] }));
    expect(putusanLupa(k)).toEqual({ putusan: "lolos", cocok: 2 });
  });
  it("satu saja data yang salah -> 'salah' walau data lain cocok semua", () => {
    const k = nilaiKolomLupa(masukan({ tgl: "2000-01-01" }), bank());
    expect(putusanLupa(k)).toEqual({ putusan: "salah", cocok: 2 });
  });
  it("NIP salah -> 'salah'", () => {
    const k = nilaiKolomLupa(masukan({ nip: "999999999" }), bank({ nip: [NIP] }));
    expect(putusanLupa(k).putusan).toBe("salah");
  });
  it("nama tidak dikenal -> 'salah'", () => {
    expect(putusanLupa(nilaiKolomLupa(masukan(), null)).putusan).toBe("salah");
  });
  it("ambang minimal tetap 2", () => {
    expect(MIN_COCOK_RESET).toBe(2);
  });
});

describe("pesanDataKurang", () => {
  it("menyebut jumlah cocok, tidak dihitung kesalahan, dan menyarankan NIP bila belum diisi", () => {
    const k = nilaiKolomLupa(masukan(), bank({ email: [], tgl: [] }));
    const p = pesanDataKurang(k, 1);
    expect(p).toContain("1 dari 2");
    expect(p).toContain("tidak dihitung sebagai kesalahan");
    expect(p).toContain("kolom NIP");
  });
  it("tidak menyarankan NIP bila sudah diisi", () => {
    const k = nilaiKolomLupa(masukan({ nip: NIP }), bank({ email: [], tgl: [], nip: [] }));
    expect(pesanDataKurang(k, 1)).not.toContain("kolom NIP");
  });
});
