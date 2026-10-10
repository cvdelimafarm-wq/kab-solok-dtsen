// lib/__tests__/sigapPrioritas.test.ts
// (10 Okt 2026) Uji aturan prioritas kartu "Tugas aktif" kegiatan induk (lib/sigapPrioritas.ts).
import { describe, expect, it } from "vitest";
import { adalahTugas, tugasDariInduk } from "@/lib/sigapPrioritas";
import type { LangkahKegiatan, RingkasKegiatan } from "@/lib/sigapKegiatan";
import type { ModulTahap, TahapHasil } from "@/lib/sigapTahap";

const induk = { kode: "pascabencana", nama: "Pendataan Pascabencana", ikon: "bencana" as const };
const NOW = Date.parse("2026-10-11T08:00:00+07:00");

const tahap = (no: number, nama: string, modul: ModulTahap[], extra: Partial<TahapHasil> = {}): TahapHasil => ({
  kode: nama.toLowerCase(), urutan: no, nama, uraian: null, isi: [], buka_mode: "langsung", buka_tanggal: null,
  no, status: "berjalan", modul, terkunci: false, alasanKunci: null, rute: `/sigap/kegiatan/pascabencana/${nama.toLowerCase()}`, ringkas: "", pecahan: 0, ...extra,
});
const modul = (kode: string, judul: string, status: ModulTahap["status"], o: Partial<ModulTahap> = {}): ModulTahap => ({ kode, judul, ket: "ket", status, href: `/h/${kode}`, aksi: "Buka", pecahan: 0, ...o });
const langkah = (no: number, kode: string, judul: string, ket: string, status: LangkahKegiatan["status"], o: Partial<LangkahKegiatan> = {}): LangkahKegiatan => ({ no, kode, kelompok: "Pelaksanaan", judul, ket, status, href: "/kerja", aksi: "Buka isian", ...o });
const keg = (l3: LangkahKegiatan): RingkasKegiatan[] => [
  { id: "translok-46", judul: "Transport Lokal", pendek: "Translok Pendataan", ikon: "motor", nada: "biru", pecahan: 0.4, selesai: 2, total: 5, sub: "", peringatan: false, href: "/sigap/kegiatan/translok-46", langkah: [langkah(1, "penugasan", "Terima", "", "selesai"), langkah(2, "hari_kerja", "Pilih", "", "selesai"), l3] },
];

describe("tugasDariInduk", () => {
  it("PPL di luar hari kerja: BERIKUTNYA, tombol 'Lihat tahapan' ke daftar langkah", () => {
    const l3 = langkah(3, "harian", "Laporan & foto harian", "Hari kerja pertama 11 Okt 2026", "menunggu", { href: null, pesanKunci: "Anda berada di luar hari kerja." });
    const g = tugasDariInduk(induk, [tahap(3, "Pendataan", [modul("translok-46", "Transport Lokal", "berjalan", { href: "/sigap/kegiatan/translok-46?dari=x" })])], keg(l3), NOW)!;
    expect(g.skor).toBe(30);
    expect(g.aksi).toBe("Lihat tahapan");
    expect(g.href).toBe("/sigap/kegiatan/translok-46?dari=x");
    expect(g.label).toContain("BERIKUTNYA");
  });
  it("PPL hari kerja mendesak: langsung ke isian dengan hitung mundur", () => {
    const l3 = langkah(3, "harian", "Laporan & foto harian", "Hari ini: foto 0 dari 5.", "mendesak", { aksi: "Lanjutkan isi hari ini", batas: "2026-10-11T09:00:00+07:00", href: "/sigap/translok/tok" });
    const g = tugasDariInduk(induk, [tahap(3, "Pendataan", [modul("translok-46", "Transport Lokal", "mendesak")])], keg(l3), NOW)!;
    expect(g.skor).toBe(89);
    expect(g.href).toBe("/sigap/translok/tok");
    expect(g.lencana?.nada).toBe("merah");
  });
  it("PML: Lembar Identifikasi = langkah 1 dari 2, lalu Transport Lokal = langkah 2 dari 2", () => {
    const l3 = langkah(3, "harian", "Laporan & foto harian", "Foto kurang 5", "perlu", { href: "/sigap/translok/tok2" });
    const pen = (st: ModulTahap["status"]) => [tahap(3, "Pendataan", [modul("wilayah_tim", "Wilayah", "menunggu", { href: null }), modul("identifikasi", "Lembar Identifikasi SLS", st, { href: "/sigap/identifikasi" }), modul("translok-46", "Transport Lokal", "perlu")])];
    const a = tugasDariInduk(induk, pen("perlu"), keg(l3), NOW)!;
    expect(a.judul).toBe("Lembar Identifikasi SLS");
    expect(a.uraian.startsWith("Langkah 1 dari 2")).toBe(true);
    const b = tugasDariInduk(induk, pen("selesai"), keg(l3), NOW)!;
    expect(b.uraian.startsWith("Langkah 2 dari 2")).toBe(true);
    expect(b.href).toBe("/sigap/translok/tok2");
    expect(b.progres).toEqual({ selesai: 1, total: 2 });
  });
  it("mendesak mengalahkan perlu; tahap lebih awal menang bila setingkat", () => {
    const a = tugasDariInduk(induk, [tahap(1, "Perencanaan", [modul("konfirmasi", "Konfirmasi", "perlu")]), tahap(3, "Pendataan", [modul("identifikasi", "Lembar Identifikasi SLS", "mendesak")])], [], NOW)!;
    expect(a.skor).toBe(89);
    const b = tugasDariInduk(induk, [tahap(1, "Perencanaan", [modul("konfirmasi", "Konfirmasi", "perlu")]), tahap(3, "Pendataan", [modul("identifikasi", "Lembar Identifikasi SLS", "perlu")])], [], NOW)!;
    expect(b.judul).toBe("Konfirmasi");
  });
  it("tahap berikutnya yang terkunci tampil bila tak ada yang perlu; semua selesai = null; pelatihan diabaikan", () => {
    const g = tugasDariInduk(induk, [tahap(3, "Pendataan", [modul("identifikasi", "x", "selesai")]), tahap(4, "Evaluasi", [], { terkunci: true, alasanKunci: "Dibuka setelah Pendataan selesai", status: "terkunci" })], [], NOW)!;
    expect(g.judul).toContain("Tahap 4");
    expect(tugasDariInduk(induk, [tahap(3, "Pendataan", [modul("identifikasi", "x", "selesai")])], [], NOW)).toBeNull();
    expect(tugasDariInduk(induk, [tahap(2, "Pelatihan", [modul("pelatihan", "Langkah pelatihan", "perlu")])], [], NOW)).toBeNull();
  });
  it("adalahTugas mengenali kode translok-<id> maupun translok:<id>", () => {
    expect(adalahTugas("translok-46")).toBe(true);
    expect(adalahTugas("translok:1")).toBe(true);
    expect(adalahTugas("identifikasi")).toBe(true);
    expect(adalahTugas("konfirmasi")).toBe(false);
  });
});
