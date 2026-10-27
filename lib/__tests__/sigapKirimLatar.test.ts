import { describe, expect, it } from "vitest";
import {
  MAKS_SELESAI_TAMPIL, hapusEntri, jumlahAktif, judulEntri, nomorDipesanLatar, perluDilepasSaatTutup, rapikanEntri, tambahEntri, teksStatusEntri, ubahEntri, type EntriLatar,
} from "../sigapKirimLatar";

const e = (kid: number, status: EntriLatar["status"], nomor: number | null = null, patch: Partial<EntriLatar> = {}): EntriLatar => ({
  kid, nomor, status, progres: null, hasil: null, galat: null, dibuatMs: kid, ...patch,
});

describe("daftar kartu kirim latar", () => {
  it("tambah tidak menggandakan kid yang sama", () => {
    const d = tambahEntri([e(1, "antri")], e(1, "antri"));
    expect(d).toHaveLength(1);
  });
  it("ubah hanya kartu yang dituju; kid tak dikenal -> daftar sama", () => {
    const d = [e(1, "antri", 1), e(2, "antri", 2)];
    const baru = ubahEntri(d, 2, { status: "mengirim", progres: 0.4 });
    expect(baru[0]).toBe(d[0]);
    expect(baru[1].status).toBe("mengirim");
    expect(baru[1].progres).toBe(0.4);
    expect(ubahEntri(d, 99, { status: "galat" })).toBe(d);
  });
  it("hapus", () => {
    const d = [e(1, "selesai"), e(2, "galat")];
    expect(hapusEntri(d, 1).map((x) => x.kid)).toEqual([2]);
    expect(hapusEntri(d, 5)).toBe(d);
  });
  it("kartu selesai dibatasi; yang tertua dilepas, yang belum selesai tidak pernah dibuang", () => {
    let d: EntriLatar[] = [e(1, "mengirim", 1)];
    for (let i = 2; i <= MAKS_SELESAI_TAMPIL + 3; i++) d = tambahEntri(d, e(i, "selesai", i));
    const selesai = d.filter((x) => x.status === "selesai");
    expect(selesai).toHaveLength(MAKS_SELESAI_TAMPIL);
    expect(d.some((x) => x.kid === 1)).toBe(true); // yang masih berjalan tetap ada
    expect(selesai[0].kid).toBe(MAKS_SELESAI_TAMPIL + 3 - MAKS_SELESAI_TAMPIL + 1); // tertua yang tersisa
  });
  it("rapikan tidak mengubah daftar yang sudah pendek", () => {
    const d = [e(1, "selesai"), e(2, "selesai")];
    expect(rapikanEntri(d)).toBe(d);
  });
});

describe("hitungan dan nomor", () => {
  const d = [e(1, "antri", 1), e(2, "mengirim", 2), e(3, "selesai", 3), e(4, "tunda", 4), e(5, "galat", 5), e(6, "mengirim", null), e(7, "antri", 2)];
  it("jumlah aktif = antri + mengirim", () => {
    expect(jumlahAktif(d)).toBe(4);
  });
  it("nomor dipesan hanya dari yang masih berjalan, tanpa ganda dan tanpa cadangan", () => {
    expect(nomorDipesanLatar(d).sort()).toEqual([1, 2]);
  });
  it("yang perlu dilepas saat aplikasi ditutup", () => {
    expect(perluDilepasSaatTutup(d)).toEqual([1, 2, 6, 7]);
  });
});

describe("teks", () => {
  it("judul", () => {
    expect(judulEntri(3)).toBe("Foto 3");
    expect(judulEntri(null)).toBe("Foto cadangan");
  });
  it("status", () => {
    expect(teksStatusEntri(e(1, "antri"))).toBe("Menunggu giliran kirim");
    expect(teksStatusEntri(e(1, "mengirim", 1, { progres: 0.5 }))).toBe("Mengunggah 50%…");
    expect(teksStatusEntri(e(1, "mengirim", 1, { progres: 1 }))).toBe("Memproses di server…");
    expect(teksStatusEntri(e(1, "tunda"))).toContain("terkirim otomatis");
    expect(teksStatusEntri(e(1, "galat", 1, { galat: "Token potret sudah dipakai." }))).toBe("Token potret sudah dipakai.");
    expect(teksStatusEntri(e(1, "galat"))).toBe("Gagal dikirim");
  });
});
