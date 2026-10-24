import { describe, expect, it } from "vitest";
import { argsCatat, argsTarik, argsUbah, bacaRupiah, periksaKekurangan, type IsianKekurangan } from "../kekurangan";

const sah: IsianKekurangan = { akun_kode: "521211", uraian: "Konsumsi rapat", jumlah: "1.500.000", prioritas: "inti", alasan: "Rapat tidak tercakup RAB" };

describe("bacaRupiah", () => {
  it("menerima titik pemisah, spasi, dan awalan Rp", () => {
    expect(bacaRupiah("1.500.000")).toBe(1500000);
    expect(bacaRupiah(" Rp 2.000 ")).toBe(2000);
    expect(bacaRupiah("rp. 750000")).toBe(750000);
    expect(bacaRupiah("5")).toBe(5);
  });
  it("menolak nol, negatif, desimal, huruf, kosong, dan terlalu besar", () => {
    for (const t of ["0", "-5", "1,5", "12a", "", "   ", "1234567890123456", "1e3"]) expect(bacaRupiah(t)).toBeNull();
  });
});

describe("periksaKekurangan", () => {
  it("isian sah tidak menghasilkan pesan", () => expect(periksaKekurangan(sah)).toEqual([]));
  it("mengumpulkan semua pesan", () => {
    const g = periksaKekurangan({ akun_kode: "12", uraian: "ab", jumlah: "0", prioritas: "x", alasan: "ya" });
    expect(g).toHaveLength(5);
  });
  it("akun tidak diperiksa saat mengubah", () => {
    expect(periksaKekurangan({ ...sah, akun_kode: "" }, { baru: false })).toEqual([]);
    expect(periksaKekurangan({ ...sah, akun_kode: "" })).toHaveLength(1);
  });
  it("batas panjang", () => {
    expect(periksaKekurangan({ ...sah, uraian: "x".repeat(201) })).toHaveLength(1);
    expect(periksaKekurangan({ ...sah, alasan: "x".repeat(501) })).toHaveLength(1);
  });
});

describe("argumen gerbang", () => {
  it("argsCatat tidak memuat p_akun dan merapikan isian", () => {
    const a = argsCatat("2906.BMA.005", { ...sah, uraian: "  Konsumsi rapat ", komponen: " " });
    expect(a).toEqual({ p_ro: "2906.BMA.005", p_akun_kode: "521211", p_uraian: "Konsumsi rapat", p_jumlah: 1500000, p_prioritas: "inti", p_alasan: "Rapat tidak tercakup RAB", p_komponen: null });
    expect("p_akun" in a).toBe(false);
  });
  it("argsUbah hanya memuat yang berubah; tanpa perubahan -> null", () => {
    const lama = { uraian: "Konsumsi rapat", jumlah: "1500000", prioritas_kode: "inti", alasan: "Rapat tidak tercakup RAB" };
    expect(argsUbah(7, lama, sah)).toBeNull();
    expect(argsUbah(7, lama, { ...sah, jumlah: "2.000.000", prioritas: "tunda" })).toEqual({ p_id: 7, p_jumlah: 2000000, p_prioritas: "tunda" });
    expect(argsUbah(7, lama, { ...sah, uraian: "Konsumsi lain" })).toEqual({ p_id: 7, p_uraian: "Konsumsi lain" });
  });
  it("argsTarik menolak alasan pendek", () => {
    expect(argsTarik(3, "ya")).toEqual({ galat: "Alasan penarikan minimal 5 huruf." });
    expect(argsTarik(3, " tidak jadi diajukan ")).toEqual({ args: { p_id: 3, p_alasan: "tidak jadi diajukan" } });
  });
});

import { argsTerapkan, peristiwaKekurangan, pilihanDariSaran, ringkasPutus } from "../kekurangan";

describe("keputusan atas tambahan pagu", () => {
  const terbuka = [
    { id: 1, uraian: "Konsumsi", jumlah: 1_000_000 },
    { id: 2, uraian: "Perjalanan", jumlah: "2000000" },
    { id: 3, uraian: "ATK", jumlah: 500_000 },
  ];
  it("pilihan awal dari saran; tanpa saran ditunda", () => {
    expect(pilihanDariSaran([1, 2, 3], [{ kekurangan_id: 1, saran: "penuhi" }, { kekurangan_id: "2", saran: "tolak" }])).toEqual({ 1: "penuhi", 2: "tolak", 3: "tunda" });
  });
  it("belum diputuskan -> tidak siap", () => {
    const r = ringkasPutus(terbuka, { 1: "penuhi" }, {}, 5_000_000);
    expect(r).toMatchObject({ dipenuhi: 1_000_000, sisa: 4_000_000, belum: 2, siap: false });
  });
  it("tolak tanpa alasan -> galat; dengan alasan -> siap", () => {
    const p = { 1: "penuhi", 2: "tolak", 3: "tunda" } as const;
    expect(ringkasPutus(terbuka, p, { 2: "ya" }, 5_000_000)).toMatchObject({ siap: false, galat: [expect.stringContaining("Perjalanan")] });
    const ok = ringkasPutus(terbuka, p, { 2: "Tidak mendesak, bisa dibiayai tahun depan" }, 5_000_000);
    expect(ok.siap).toBe(true);
    expect(ok.daftar).toEqual([
      { id: 1, keputusan: "penuhi", alasan: "" }, { id: 2, keputusan: "tolak", alasan: "Tidak mendesak, bisa dibiayai tahun depan" }, { id: 3, keputusan: "tunda", alasan: "" },
    ]);
  });
  it("alasan hanya dikirim untuk tolak", () => {
    const r = ringkasPutus(terbuka, { 1: "penuhi", 2: "tunda", 3: "tunda" }, { 1: "catatan nyasar", 2: "x" }, 5_000_000);
    expect(r.daftar.every((d) => d.alasan === "")).toBe(true);
  });
  it("memenuhi lebih dari tambahan -> galat dan sisa minus", () => {
    const r = ringkasPutus(terbuka, { 1: "penuhi", 2: "penuhi", 3: "penuhi" }, {}, 3_000_000);
    expect(r.sisa).toBe(-500_000);
    expect(r.siap).toBe(false);
    expect(r.galat[0]).toContain("melebihi");
  });
  it("tidak ada catatan terbuka -> tidak siap", () => expect(ringkasPutus([], {}, {}, 1000).siap).toBe(false));
  it("argumen penerapan", () => {
    expect(argsTerapkan(1000, [{ id: 1, keputusan: "tolak", alasan: " tidak perlu " }])).toEqual({ p_tambahan: 1000, p_keputusan: [{ id: 1, keputusan: "tolak", alasan: "tidak perlu" }] });
  });
});

describe("riwayat kekurangan", () => {
  it("terbaru di atas; pencatatan dan keputusan menjadi peristiwa terpisah", () => {
    const e = peristiwaKekurangan([
      { id: 1, akun_kode: "521211", uraian: "Konsumsi", jumlah: 1500000, prioritas_nama: "Inti", status: "dipenuhi", dicatat_oleh: 5, dicatat_at: "2026-10-20T01:00:00Z", diputus_oleh: 7, diputus_at: "2026-10-24T03:00:00Z", alasan_putus: null },
      { id: 2, akun_kode: "524111", uraian: "Perjalanan", jumlah: 2000000, status: "ditolak", dicatat_oleh: 5, dicatat_at: "2026-10-22T01:00:00Z", diputus_oleh: 7, diputus_at: "2026-10-24T03:05:00Z", alasan_putus: "belum mendesak" },
      { id: 3, akun_kode: "521811", uraian: "ATK", jumlah: 1000, status: "terbuka", dicatat_at: "2026-10-21T01:00:00Z" },
    ]);
    expect(e).toHaveLength(5);
    expect(e[0].teks).toBe("menolak 524111 Perjalanan: belum mendesak.");
    expect(e[1].teks).toBe("memenuhi 521211 Konsumsi.");
    expect(e[2].teks).toContain("Perjalanan");
    expect(e.map((x) => x.waktu)).toEqual(["2026-10-24T03:05:00Z", "2026-10-24T03:00:00Z", "2026-10-22T01:00:00Z", "2026-10-21T01:00:00Z", "2026-10-20T01:00:00Z"]);
    expect(e[4].teks).toContain("prioritas Inti");
    expect(e[3].akun).toBeNull();
  });
  it("batas jumlah", () => {
    const b = Array.from({ length: 40 }, (_, i) => ({ id: i, akun_kode: "521211", uraian: "Konsumsi", jumlah: 1, status: "terbuka", dicatat_at: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00Z` }));
    expect(peristiwaKekurangan(b)).toHaveLength(30);
    expect(peristiwaKekurangan(b, 5)).toHaveLength(5);
  });
});
