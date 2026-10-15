// lib/__tests__/sigapPushJadwal.test.ts
import { describe, expect, it } from "vitest";
import { awalHariWibIso, jamSenyap, layakUntukSlot, MAKS_PUSH_PER_HARI, pilihPushJadwal, slotDariJam, susunPesanPush } from "@/lib/sigapPushJadwal";
import { kunciKekurangan } from "@/lib/sigapPengingat";
import type { Kekurangan } from "@/lib/sigapKekurangan";

const at = (jam: string) => Date.parse(`2026-10-15T${jam}:00+07:00`);
const mk = (o: Partial<Kekurangan> = {}): Kekurangan => ({
  kode: "foto-2026-10-15", jenis: "foto", tanggal: "2026-10-15", skor: 74, nada: "emas", label: "TUGAS HARI INI", judul: "Foto kurang 2: nomor 4–5", ringkas: "Foto kurang 2",
  uraian: "Unggah 2 foto dokumentasi.", batas: null, aksi: "Unggah foto 4–5", href: "/sigap/translok/tok?p=1&tab=hari_ini&fokus=foto", ...o,
});
const kosong = { jumlah: 0, kunci: [] as string[] };

describe("slot & jam", () => {
  it("slot dari jam WIB; jam senyap 23.00-05.59", () => {
    expect(slotDariJam(at("07:00"))).toBe("pagi");
    expect(slotDariJam(at("13:00"))).toBe("siang");
    expect(slotDariJam(at("17:00"))).toBe("sore");
    expect(slotDariJam(at("22:15"))).toBe("malam");
    expect(jamSenyap(at("23:05"))).toBe(true);
    expect(jamSenyap(at("03:00"))).toBe(true);
    expect(jamSenyap(at("06:00"))).toBe(false);
    expect(jamSenyap(at("22:59"))).toBe(false);
  });
  it("awal hari WIB dalam UTC", () => {
    expect(awalHariWibIso(at("09:00"))).toBe("2026-10-14T17:00:00.000Z");
    expect(awalHariWibIso(at("00:30"))).toBe("2026-10-14T17:00:00.000Z");
  });
});

describe("layakUntukSlot", () => {
  it("pagi hanya izin & pilih hari kerja; siang/sore kekurangan hari ini; malam hanya mendesak; terlewat tak pernah", () => {
    expect(layakUntukSlot(mk({ jenis: "hari_kerja", skor: 65 }), "pagi")).toBe(true);
    expect(layakUntukSlot(mk({ jenis: "izin_susulan", skor: 76 }), "pagi")).toBe(true);
    expect(layakUntukSlot(mk(), "pagi")).toBe(false);
    expect(layakUntukSlot(mk(), "siang")).toBe(true);
    expect(layakUntukSlot(mk({ jenis: "hari_kerja", skor: 65 }), "siang")).toBe(false);
    expect(layakUntukSlot(mk(), "malam")).toBe(false);
    expect(layakUntukSlot(mk({ skor: 88, nada: "merah" }), "malam")).toBe(true);
    expect(layakUntukSlot(mk({ jenis: "hari_terlewat", skor: 95 }), "malam")).toBe(false);
  });
});

describe("pilihPushJadwal", () => {
  it("memilih skor tertinggi yang layak", () => {
    const d = [mk({ kode: "a", skor: 72, judul: "a" }), mk({ kode: "b", skor: 76, judul: "b", jenis: "izin_susulan" })];
    expect(pilihPushJadwal(d, "sore", at("17:00"), kosong)?.kode).toBe("b");
  });
  it("kekurangan yang sama tidak dikirim dua kali sehari; angka berubah = boleh", () => {
    const k = mk();
    expect(pilihPushJadwal([k], "sore", at("17:00"), { jumlah: 1, kunci: [kunciKekurangan(k)] })).toBeNull();
    const k2 = mk({ kode: "foto-2026-10-15-4", judul: "Tinggal 1 foto lagi (nomor 5)" });
    expect(pilihPushJadwal([k2], "sore", at("17:00"), { jumlah: 1, kunci: [kunciKekurangan(k)] })?.judul).toBe(k2.judul);
  });
  it("batas harian dan jam senyap", () => {
    expect(pilihPushJadwal([mk()], "sore", at("17:00"), { jumlah: MAKS_PUSH_PER_HARI, kunci: [] })).toBeNull();
    expect(pilihPushJadwal([mk({ skor: 90 })], "malam", at("23:30"), kosong)).toBeNull();
  });
});

describe("susunPesanPush", () => {
  it("judul/isi dipotong dalam batas; mendesak diberi awalan; tautan luar diganti '/'", () => {
    const p = susunPesanPush(mk({ nada: "merah", judul: "x".repeat(200), uraian: "y".repeat(400), href: "https://jahat.example/x" }));
    expect(p.judul.length).toBeLessThanOrEqual(80);
    expect(p.isi.length).toBeLessThanOrEqual(240);
    expect(p.url).toBe("/");
    expect(susunPesanPush(mk({ nada: "merah" })).judul.startsWith("Segera: ")).toBe(true);
  });
  it("isi memuat ajakan tindakan dan tautan internal dipertahankan", () => {
    const p = susunPesanPush(mk());
    expect(p.isi).toContain("Unggah 2 foto dokumentasi.");
    expect(p.isi).toContain("Ketuk untuk unggah foto 4–5.");
    expect(p.url).toBe("/sigap/translok/tok?p=1&tab=hari_ini&fokus=foto");
  });
});
