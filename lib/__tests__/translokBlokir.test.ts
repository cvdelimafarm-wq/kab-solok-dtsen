import { describe, expect, it } from "vitest";
import {
  bolehAjukan, bolehMenyetujui, bolehPutuskan, cekAlasan, gabungPenyetuju, memblokir, pesanBlokir, pesanKeputusan, pesanPengajuan,
  rantaiAtasan, teksModalPetugas, turunanDari, umurTeks, urutkanBawahan, urutkanPermintaan,
} from "../translokBlokir";

describe("status", () => {
  it("hanya blokir & diajukan yang memblokir", () => {
    expect(memblokir("blokir")).toBe(true);
    expect(memblokir("diajukan")).toBe(true);
    expect(memblokir("dibuka")).toBe(false);
    expect(memblokir(null)).toBe(false);
    expect(memblokir(undefined)).toBe(false);
  });
  it("ajukan hanya dari blokir; putuskan hanya dari diajukan", () => {
    expect(bolehAjukan("blokir")).toBe(true);
    expect(bolehAjukan("diajukan")).toBe(false);
    expect(bolehAjukan("dibuka")).toBe(false);
    expect(bolehPutuskan("diajukan")).toBe(true);
    expect(bolehPutuskan("blokir")).toBe(false);
  });
});

describe("alasan", () => {
  it("menolak terlalu pendek, merapikan spasi, memotong panjang", () => {
    expect(cekAlasan("   ab ").ok).toBe(false);
    expect(cekAlasan(undefined).ok).toBe(false);
    const r = cekAlasan("  HP   saya  rusak  ");
    expect(r.ok && r.alasan).toBe("HP saya rusak");
    const p = cekAlasan("x".repeat(900));
    expect(p.ok && p.alasan.length).toBe(500);
  });
});

describe("teksModalPetugas", () => {
  const dasar = { alasan_blokir: null, keputusan_catatan: null, keputusan_oleh: null, keputusan_at: null };
  it("blokir awal boleh mengajukan", () => {
    const t = teksModalPetugas({ ...dasar, status: "blokir" });
    expect(t?.boleh_ajukan).toBe(true);
    expect(t?.nada).toBe("merah");
  });
  it("diajukan = menunggu, tidak boleh ajukan lagi", () => {
    const t = teksModalPetugas({ ...dasar, status: "diajukan" });
    expect(t?.boleh_ajukan).toBe(false);
    expect(t?.judul).toMatch(/Menunggu/);
  });
  it("dibuka = tanpa modal", () => {
    expect(teksModalPetugas({ ...dasar, status: "dibuka" })).toBeNull();
  });
  it("menyebut penolakan terakhir", () => {
    const t = teksModalPetugas({ ...dasar, status: "blokir", keputusan_at: "2026-11-03T01:00:00Z", keputusan_oleh: "Widya", keputusan_catatan: "belum lengkap" });
    expect(t?.isi).toMatch(/ditolak oleh Widya: belum lengkap/);
  });
});

describe("penyetuju", () => {
  it("pengaju tidak boleh menyetujui dirinya", () => {
    expect(bolehMenyetujui([1, 2], 2, 2)).toBe(false);
    expect(bolehMenyetujui([1, 2], 1, 2)).toBe(true);
    expect(bolehMenyetujui(new Set([1]), 5, 2)).toBe(false);
  });
  it("gabungPenyetuju: unik, tanpa pengaju & nilai tak valid, terurut", () => {
    expect(gabungPenyetuju([[3, 1, null], [1, undefined, 0, -2, 2.5, 311]], 311)).toEqual([1, 3]);
  });
});

describe("rantai", () => {
  const peta = new Map<number, number | null>([[1, 2], [2, 3], [3, null], [4, 2], [9, 8], [8, 9]]);
  it("rantaiAtasan naik ke puncak", () => {
    expect(rantaiAtasan(1, peta)).toEqual([2, 3]);
    expect(rantaiAtasan(3, peta)).toEqual([]);
    expect(rantaiAtasan(77, peta)).toEqual([]);
  });
  it("aman dari siklus", () => {
    expect(rantaiAtasan(9, peta)).toEqual([8]);
  });
  it("turunanDari mengumpulkan semua bawahan bertingkat", () => {
    expect(turunanDari(3, peta)).toEqual([1, 2, 4]);
    expect(turunanDari(2, peta)).toEqual([1, 4]);
    expect(turunanDari(1, peta)).toEqual([]);
  });
});

describe("tampilan", () => {
  it("urutkanPermintaan: terlama dulu", () => {
    const u = urutkanPermintaan([{ id: 2, diajukan_at: "2026-11-03T02:00:00Z" }, { id: 1, diajukan_at: "2026-11-03T01:00:00Z" }, { id: 3, diajukan_at: null }]);
    expect(u.map((x) => x.id)).toEqual([3, 1, 2]);
  });
  it("urutkanBawahan: diajukan, blokir, dibuka, lalu bersih", () => {
    const u = urutkanBawahan([
      { nama: "Budi", status: null }, { nama: "Citra", status: "dibuka" as const }, { nama: "Dewi", status: "blokir" as const }, { nama: "Eka", status: "diajukan" as const },
    ]);
    expect(u.map((x) => x.nama)).toEqual(["Eka", "Dewi", "Citra", "Budi"]);
  });
  it("umurTeks", () => {
    const n = Date.parse("2026-11-03T03:00:00Z");
    expect(umurTeks("2026-11-03T02:59:40Z", n)).toBe("baru saja");
    expect(umurTeks("2026-11-03T02:30:00Z", n)).toBe("30 menit lalu");
    expect(umurTeks("2026-11-03T00:00:00Z", n)).toBe("3 jam lalu");
    expect(umurTeks("2026-11-01T03:00:00Z", n)).toBe("2 hari lalu");
    expect(umurTeks(null, n)).toBe("");
    expect(umurTeks("bukan", n)).toBe("");
  });
  it("pesan push", () => {
    expect(pesanPengajuan("Jahar Nas", "Pendataan PSP").isi).toMatch(/Jahar Nas meminta translok dibuka/);
    expect(pesanKeputusan(true, "Widya").judul).toMatch(/dibuka/);
    expect(pesanKeputusan(false, "Widya").judul).toMatch(/ditolak/);
    expect(pesanBlokir("Widya").isi).toMatch(/Widya memblokir/);
  });
});
