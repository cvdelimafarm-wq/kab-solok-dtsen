// lib/__tests__/sigapPerbaikan.test.ts
// (15 Okt 2026) Uji aturan murni "Perbaiki administrasi" Transport Lokal (lib/sigapPerbaikan.ts).
import { describe, expect, it } from "vitest";
import type { AturanIsian } from "@/lib/sigap";
import type { IsianHari } from "@/lib/sigapKekurangan";
import { MAKS_KK_PER_KIRIM, hariSebelum, pesanSiaran, periksaKirim, periksaTidakBekerja, tanggalSiaran, tglPanjangPerbaikan, ucapanLengkap, waktuPerbaikan } from "@/lib/sigapPerbaikan";

const ATURAN: AturanIsian = { jenis: "pendataan", wajib_laporan: true, jumlah_foto: 2 };
const KUNCI = "3f1c1b2e-5a4d-4c3b-8a7e-0123456789ab";
const lengkap: IsianHari = { laporan: true, slot: [1, 2] };

describe("tanggal dan teks", () => {
  it("waktuPerbaikan = 12.00 WIB tanggal itu", () => {
    expect(waktuPerbaikan("2026-10-12")).toBe("2026-10-12T05:00:00.000Z");
  });
  it("hariSebelum lintas bulan", () => {
    expect(hariSebelum("2026-10-15")).toBe("2026-10-14");
    expect(hariSebelum("2026-11-01")).toBe("2026-10-31");
  });
  it("ucapan terima kasih memakai hari terakhir yang dinilai (dinamis)", () => {
    expect(ucapanLengkap("2026-10-15")).toBe("Terima kasih, seluruh administrasi translok Anda sudah lengkap sampai tanggal 14 Oktober 2026.");
    expect(ucapanLengkap("2026-10-20")).toContain("19 Oktober 2026");
    expect(tglPanjangPerbaikan("2026-01-05")).toBe("5 Januari 2026");
  });
  it("pesan siaran memuat jumlah hari dan tanggal", () => {
    const p = pesanSiaran(["2026-10-10", "2026-10-12"]);
    expect(p.judul).toContain("2 hari");
    expect(p.isi).toContain("24 jam");
    expect(p.isi).toContain("10 Okt");
  });
});

describe("tanggalSiaran", () => {
  const dasar = { hariKerja: ["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-14", "2026-10-15"], aturan: ATURAN, hariIni: "2026-10-15", batas: "2026-10-14" };
  it("hanya hari lampau yang belum lengkap, sampai batas", () => {
    const r = tanggalSiaran({ ...dasar, isian: { "2026-10-10": lengkap, "2026-10-11": { laporan: true, slot: [1] } }, pernahIzin: new Set() });
    expect(r).toEqual(["2026-10-11", "2026-10-12", "2026-10-14"]);
  });
  it("hari ini tidak ikut walau belum lengkap", () => {
    expect(tanggalSiaran({ ...dasar, isian: {}, pernahIzin: new Set() })).not.toContain("2026-10-15");
  });
  it("sekali per tanggal: yang pernah diberi izin dilewati", () => {
    const r = tanggalSiaran({ ...dasar, isian: {}, pernahIzin: new Set(["2026-10-10", "2026-10-12"]) });
    expect(r).toEqual(["2026-10-11", "2026-10-14"]);
  });
  it("laporan dianggap dari lembar dihitung selesai", () => {
    const r = tanggalSiaran({ ...dasar, hariKerja: ["2026-10-12"], isian: { "2026-10-12": { laporan: false, dianggap: true, slot: [1, 2] } }, pernahIzin: new Set() });
    expect(r).toEqual([]);
  });
  it("batas lebih awal membatasi tanggal", () => {
    const r = tanggalSiaran({ ...dasar, isian: {}, pernahIzin: new Set(), batas: "2026-10-11" });
    expect(r).toEqual(["2026-10-10", "2026-10-11"]);
  });
});

describe("periksaKirim", () => {
  const item = (o: Record<string, unknown> = {}) => ({ kk_id: 5, hasil: "terdampak", alasan: " ada  ", kunci: KUNCI, ...o });
  const ok = (o: Record<string, unknown> = {}) => ({ penugasan_id: 46, tanggal: "2026-10-12", items: [item()], ...o });
  it("menerima isian sah dan merapikan alasan", () => {
    const r = periksaKirim(ok());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.isi.items[0].alasan).toBe("ada");
  });
  it("KK ganda digabung", () => {
    const r = periksaKirim(ok({ items: [item(), item({ hasil: "tidak_terdampak" })] }));
    expect(r.ok && r.isi.items.length).toBe(1);
  });
  it("menolak: kosong, hasil asing, kunci bukan uuid, tanggal rusak, terlalu banyak", () => {
    expect(periksaKirim(ok({ items: [] })).ok).toBe(false);
    expect(periksaKirim(ok({ items: [item({ hasil: "lainnya" })] })).ok).toBe(false);
    expect(periksaKirim(ok({ items: [item({ kunci: "abc" })] })).ok).toBe(false);
    expect(periksaKirim(ok({ tanggal: "12-10-2026" })).ok).toBe(false);
    expect(periksaKirim(ok({ penugasan_id: 0 })).ok).toBe(false);
    expect(periksaKirim(null).ok).toBe(false);
    const banyak = Array.from({ length: MAKS_KK_PER_KIRIM + 1 }, (_, i) => item({ kk_id: i + 1 }));
    expect(periksaKirim(ok({ items: banyak })).ok).toBe(false);
  });
});

describe("periksaTidakBekerja", () => {
  it("sah dan tidak sah", () => {
    expect(periksaTidakBekerja({ penugasan_id: 3, tanggal: "2026-10-12" }).ok).toBe(true);
    expect(periksaTidakBekerja({ penugasan_id: 3, tanggal: "besok" }).ok).toBe(false);
    expect(periksaTidakBekerja(undefined).ok).toBe(false);
  });
});
