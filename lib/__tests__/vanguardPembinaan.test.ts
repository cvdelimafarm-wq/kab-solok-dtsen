import { describe, expect, it } from "vitest";
import { akhirPekan, hariPekan, hitungStreak } from "../vanguard/pembinaan/streak";
import { statusKesegaran, MASA_SEGAR_HARI } from "../vanguard/pembinaan/segar";
import { benihHarian, benihMinggu, nomorMinggu, pilihTantangan } from "../vanguard/pembinaan/tantangan";
import { bacaTinjauan, bacaUsulan } from "../vanguard/pembinaan/usulan";
import { KOLAM } from "../vanguard/sertifikasi/nilai";
import { hariWibNomor } from "../vanguard/sertifikasi/jeda";

// Senin 2 Nov 2026 WIB = 2026-11-01T17:00Z .. (1 Nov 2026 adalah Minggu)
const hr = (isoTanggal: string) => `${isoTanggal}T05:00:00Z`; // 12.00 WIB

describe("hari dalam pekan (WIB)", () => {
  it("1 Nov 2026 Minggu, 2 Nov Senin, 7 Nov Sabtu", () => {
    expect(hariPekan(hariWibNomor(hr("2026-11-01")))).toBe(0);
    expect(hariPekan(hariWibNomor(hr("2026-11-02")))).toBe(1);
    expect(akhirPekan(hariWibNomor(hr("2026-11-07")))).toBe(true);
    expect(akhirPekan(hariWibNomor(hr("2026-11-04")))).toBe(false);
  });
});

describe("streak latihan harian (tidak menghukum)", () => {
  it("kosong = 0", () => expect(hitungStreak([], new Date(hr("2026-11-04")))).toEqual({ sekarang: 0, terpanjang: 0, selesaiHariIni: false }));
  it("Sen–Rab berturut, hari ini Rabu sudah selesai = 3", () => {
    const s = hitungStreak([hr("2026-11-02"), hr("2026-11-03"), hr("2026-11-04")], new Date(hr("2026-11-04")));
    expect(s).toEqual({ sekarang: 3, terpanjang: 3, selesaiHariIni: true });
  });
  it("hari ini belum berlatih tidak memutus (Rabu belum, Sen–Sel ada) = 2", () => {
    expect(hitungStreak([hr("2026-11-02"), hr("2026-11-03")], new Date(hr("2026-11-04"))).sekarang).toBe(2);
  });
  it("kemarin hari kerja terlewat memutus: Sen ada, Rabu hari ini belum, Selasa kosong = 0", () => {
    expect(hitungStreak([hr("2026-11-02")], new Date(hr("2026-11-04"))).sekarang).toBe(0);
  });
  it("akhir pekan dilewati tanpa putus: Jum (6 Nov) lalu Sen (9 Nov)", () => {
    const s = hitungStreak([hr("2026-11-05"), hr("2026-11-06"), hr("2026-11-09")], new Date(hr("2026-11-09")));
    expect(s.sekarang).toBe(3); expect(s.terpanjang).toBe(3);
  });
  it("terpanjang dipisah dari sekarang", () => {
    const s = hitungStreak([hr("2026-11-02"), hr("2026-11-03"), hr("2026-11-04"), hr("2026-11-05"), hr("2026-11-10")], new Date(hr("2026-11-10")));
    expect(s.terpanjang).toBe(4); expect(s.sekarang).toBe(1);
  });
  it("hari Sabtu hari ini belum berlatih: rangkaian Jumat tetap hidup", () => {
    expect(hitungStreak([hr("2026-11-05"), hr("2026-11-06")], new Date(hr("2026-11-07"))).sekarang).toBe(2);
  });
});

describe("kesegaran sertifikat", () => {
  const selesai = "2026-11-01T00:00:00Z";
  const plus = (h: number) => new Date(new Date(selesai).getTime() + h * 86_400_000);
  it("segar sampai hari ke-75, segera 76–90, perlu sesudahnya", () => {
    expect(statusKesegaran(selesai, plus(0)).status).toBe("segar");
    expect(statusKesegaran(selesai, plus(75)).status).toBe("segar");
    expect(statusKesegaran(selesai, plus(76))).toMatchObject({ status: "segera", sisaHari: 14 });
    expect(statusKesegaran(selesai, plus(MASA_SEGAR_HARI))).toMatchObject({ status: "segera", sisaHari: 0 });
    expect(statusKesegaran(selesai, plus(91))).toMatchObject({ status: "perlu", sisaHari: -1 });
    expect(statusKesegaran(selesai, plus(0)).jatuhTempo).toBe("2027-01-30T00:00:00.000Z");
  });
});

describe("tantangan mingguan", () => {
  it("nomor minggu berganti Senin 00.00 WIB", () => {
    expect(nomorMinggu("2026-11-01T16:59:00Z")).toBe(nomorMinggu("2026-10-27T05:00:00Z")); // Minggu 1 Nov 23.59 WIB masih minggu yang sama dengan Selasa sebelumnya
    expect(nomorMinggu("2026-11-01T17:00:00Z")).toBe(nomorMinggu("2026-11-01T16:59:00Z") + 1); // Senin 2 Nov 00.00 WIB
  });
  it("benih minggu dan benih harian deterministik; beda minggu/akun/hari = beda", () => {
    expect(benihMinggu(5)).toBe(benihMinggu(5)); expect(benihMinggu(5)).not.toBe(benihMinggu(6));
    expect(benihHarian(1, 100)).toBe(benihHarian(1, 100)); expect(benihHarian(1, 100)).not.toBe(benihHarian(2, 100)); expect(benihHarian(1, 100)).not.toBe(benihHarian(1, 101));
  });
  it("memuat 5 butir berbeda; 3 butir tersulit (rata poin terendah, minimal 2 jawaban, 7 hari terakhir) masuk lebih dulu", () => {
    const sekarang = new Date("2026-11-04T05:00:00Z");
    const j = (kasus: string, poin: number, hari = 1) => ({ kasus, poin, jawab_at: new Date(sekarang.getTime() - hari * 86_400_000).toISOString() });
    const data = [j("A02", 20), j("A02", 40), j("B03", 60), j("B03", 50), j("C05", 0), j("A07", 90), j("A07", 80), j("K01", 10, 9), j("K01", 0, 9), j("C09", 0)];
    const t = pilihTantangan(data, KOLAM, 100, sekarang);
    expect(t).toHaveLength(5);
    expect(t.slice(0, 3).map((x) => x.kode)).toEqual(["A02", "B03", "A07"]); // C05 (1 jawaban) dan K01 (lama) tidak masuk; C09 (1 jawaban) tidak
    expect(new Set(t.map((x) => x.kode)).size).toBe(5);
    expect(t.map((x) => x.urut)).toEqual([1, 2, 3, 4, 5]);
    expect(pilihTantangan(data, KOLAM, 100, sekarang)).toEqual(t); // deterministik
  });
  it("tanpa data: 5 butir acak berimbang dari kolam", () => {
    const t = pilihTantangan([], KOLAM, 101, new Date());
    expect(t).toHaveLength(5); expect(new Set(t.map((x) => x.kode)).size).toBe(5);
  });
});

describe("usulan kasus", () => {
  const ok = { judul: "Beras raskin dibayar tunai", cerita: "Rumah tangga membeli beras raskin 10 kg dengan harga Rp3.000 per kg dari pemerintah desa.", jawaban: "Dicatat sebagai bantuan pemerintah sebesar selisih harga pasar.", blok: "V.E" };
  it("usulan sah dirapikan; terlalu pendek, terlalu panjang, dan memuat nomor 16 digit ditolak", () => {
    expect(bacaUsulan(ok).usulan).toMatchObject({ judul: "Beras raskin dibayar tunai", blok: "V.E" });
    expect(bacaUsulan({ ...ok, judul: "abc" }).galat).toMatch(/Judul/);
    expect(bacaUsulan({ ...ok, cerita: "pendek" }).galat).toMatch(/cerita|Ceritakan/i);
    expect(bacaUsulan({ ...ok, cerita: "x".repeat(1501) }).galat).toMatch(/terlalu panjang/);
    expect(bacaUsulan({ ...ok, cerita: ok.cerita + " NIK 1306010101010001" }).galat).toMatch(/nomor identitas/);
    expect(bacaUsulan("x").galat).not.toBeNull(); expect(bacaUsulan(null).galat).not.toBeNull();
    expect(bacaUsulan({ ...ok, cerita: `  ${ok.cerita}\r\n\r\n   ` }).usulan?.cerita).toBe(ok.cerita);
  });
  it("tinjauan: status harus salah satu dari diterima/ditolak/dikerjakan (bukan 'baru'); catatan dibatasi", () => {
    expect(bacaTinjauan({ status: "diterima", catatan: " bagus " })).toEqual({ status: "diterima", catatan: "bagus", galat: null });
    expect(bacaTinjauan({ status: "baru" }).galat).not.toBeNull();
    expect(bacaTinjauan({ status: "ngawur" }).galat).not.toBeNull();
    expect(bacaTinjauan({ status: "ditolak", catatan: "x".repeat(601) }).galat).toMatch(/panjang/);
  });
});
