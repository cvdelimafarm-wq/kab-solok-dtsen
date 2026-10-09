// (9 Okt 2026) Uji logika presensi rapat Zoom: jendela waktu, token, sasaran peran, pemilihan rapat.
import { describe, expect, it } from "vitest";
import { bolehHadir, cocokToken, keBentukPetugas, perannyaSasaran, pilihRapat, statusRapat, tautanAman, type Rapat } from "../sigapRapat";

const T0 = Date.parse("2026-10-09T10:00:00Z"); // mulai rapat
const mnt = (n: number) => n * 60_000;
const rapat = (o: Partial<Rapat> = {}): Rapat => ({
  id: 1, judul: "Rapat", aktif: true, mulai_at: new Date(T0).toISOString(), selesai_at: new Date(T0 + mnt(120)).toISOString(),
  tautan: "https://zoom.us/j/123", meeting_id: "123", passcode: "abc", token: "psp2026", buka_menit: 15, tutup_menit: 30, sasaran_peran: "semua", sasaran_kegiatan_id: 1, akun_tambahan: [], ...o,
});

describe("statusRapat", () => {
  it("belum -> buka -> tutup menurut jendela [mulai-15, selesai+30)", () => {
    expect(statusRapat(rapat(), false, T0 - mnt(16))).toBe("belum");
    expect(statusRapat(rapat(), false, T0 - mnt(15))).toBe("buka");
    expect(statusRapat(rapat(), false, T0 + mnt(150) - 1)).toBe("buka");
    expect(statusRapat(rapat(), false, T0 + mnt(150))).toBe("tutup");
  });
  it("sudah hadir menang atas jendela; nonaktif menang atas semua", () => {
    expect(statusRapat(rapat(), true, T0 + mnt(500))).toBe("sudah");
    expect(statusRapat(rapat({ aktif: false }), true, T0)).toBe("nonaktif");
  });
});

describe("bolehHadir", () => {
  it("hanya dalam jendela", () => {
    expect(bolehHadir(rapat(), false, T0 - mnt(20))).toMatchObject({ ok: false, kode: "belum_buka" });
    expect(bolehHadir(rapat(), false, T0)).toEqual({ ok: true });
    expect(bolehHadir(rapat(), false, T0 + mnt(200))).toMatchObject({ ok: false, kode: "tutup" });
    expect(bolehHadir(rapat(), true, T0)).toMatchObject({ ok: false, kode: "sudah" });
  });
});

describe("cocokToken", () => {
  it("tidak peka huruf besar/kecil dan spasi tepi", () => {
    expect(cocokToken("psp2026", "psp2026")).toBe(true);
    expect(cocokToken("  PSP2026 ", "psp2026")).toBe(true);
    expect(cocokToken("Psp2026", "PSP2026")).toBe(true);
  });
  it("menolak salah, kosong, bukan teks", () => {
    expect(cocokToken("psp2025", "psp2026")).toBe(false);
    expect(cocokToken("psp202", "psp2026")).toBe(false);
    expect(cocokToken("psp20266", "psp2026")).toBe(false);
    expect(cocokToken("", "psp2026")).toBe(false);
    expect(cocokToken(null, "psp2026")).toBe(false);
    expect(cocokToken(2026, "psp2026")).toBe(false);
    expect(cocokToken("x", "")).toBe(false);
  });
});

describe("perannyaSasaran", () => {
  it("semua = PPL & PML saja", () => {
    expect(perannyaSasaran("ppl", "semua")).toBe(true);
    expect(perannyaSasaran("PML", "semua")).toBe(true);
    expect(perannyaSasaran("korwil", "semua")).toBe(false);
    expect(perannyaSasaran("ppl", "pml")).toBe(false);
    expect(perannyaSasaran("pml", "pml")).toBe(true);
  });
});

describe("pilihRapat", () => {
  it("memilih yang sudah dibuka, mengabaikan yang lewat/nonaktif", () => {
    const lewat = rapat({ id: 1, mulai_at: new Date(T0 - mnt(600)).toISOString(), selesai_at: new Date(T0 - mnt(500)).toISOString() });
    const nanti = rapat({ id: 2, mulai_at: new Date(T0 + mnt(1000)).toISOString(), selesai_at: new Date(T0 + mnt(1100)).toISOString() });
    const kini = rapat({ id: 3 });
    const mati = rapat({ id: 4, aktif: false });
    expect(pilihRapat([lewat, nanti, kini, mati], T0 + mnt(5))?.id).toBe(3);
    expect(pilihRapat([lewat, mati], T0)).toBeNull();
    expect(pilihRapat([nanti], T0)?.id).toBe(2);
  });
});

describe("keBentukPetugas", () => {
  it("tidak membocorkan token", () => {
    const x = keBentukPetugas(rapat(), null, T0);
    expect(JSON.stringify(x)).not.toContain("psp2026");
    expect("token" in x).toBe(false);
    expect(x.status).toBe("buka");
  });
});

describe("tautanAman", () => {
  it("hanya https", () => {
    expect(tautanAman("https://us06web.zoom.us/j/1?pwd=x")).toContain("https://");
    expect(tautanAman("http://zoom.us/j/1")).toBeNull();
    expect(tautanAman("javascript:alert(1)")).toBeNull();
    expect(tautanAman("")).toBeNull();
  });
});
