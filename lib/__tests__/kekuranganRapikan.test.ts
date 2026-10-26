// lib/__tests__/kekuranganRapikan.test.ts  (21 Okt 2026)
// Kartu Beranda "Foto kurang" berubah menjadi "Rapikan nomor foto" bila ada foto Kamera SIGAP terkirim yang belum menempati nomor.
import { describe, it, expect } from "vitest";
import { susunKekurangan, type MasukanKekurangan, type IsianHari } from "@/lib/sigapKekurangan";

const HARI = "2026-10-21";
const NOW = Date.parse(`${HARI}T10:00:00+07:00`);

function masukan(isi: IsianHari): MasukanKekurangan {
  return {
    penugasanId: 185,
    namaKegiatan: "Pendataan",
    aturan: { jenis: "pendataan", wajib_laporan: true, jumlah_foto: 5 },
    satuan: "KK",
    aktif: true,
    hariKerja: [HARI],
    isian: { [HARI]: isi },
    hariIni: HARI,
    hrefDasar: "/sigap/translok/tok123?p=185",
  };
}
const kartuFoto = (isi: IsianHari) => susunKekurangan(masukan(isi), NOW).find((k) => k.jenis === "foto");

describe("kartu foto di Beranda", () => {
  it("tanpa foto cadangan: teks lama, tombol 'Unggah foto ...'", () => {
    const k = kartuFoto({ laporan: true, slot: [1, 2, 4, 5] })!;
    expect(k.aksi).toBe("Unggah foto 3");
    expect(k.judul).toMatch(/Tinggal 1 foto lagi/);
    expect(k.ringkas).toBe("Foto belum lengkap"); // tidak mengulang judul "Tinggal 1 foto lagi"
  });

  it("ada foto cadangan: tombol 'Rapikan nomor foto' dan jumlah foto belum terpakai", () => {
    const k = kartuFoto({ laporan: true, slot: [1, 2, 4, 5], cadangan: 1 })!;
    expect(k.aksi).toBe("Rapikan nomor foto");
    expect(k.judul).toMatch(/1 foto belum terpakai/);
    expect(k.ringkas).toBe("1 foto belum bernomor");
    expect(k.href).toContain("fokus=foto");
    expect(k.href).toContain("tab=hari_ini");
    expect(k.href).toContain("p=185");
  });

  it("kode kartu berubah menurut jumlah cadangan (modal pengingat muncul lagi)", () => {
    const a = kartuFoto({ laporan: true, slot: [1, 2, 4, 5], cadangan: 1 })!;
    const b = kartuFoto({ laporan: true, slot: [1, 2, 4, 5], cadangan: 2 })!;
    const c = kartuFoto({ laporan: true, slot: [1, 2, 4, 5] })!;
    expect(new Set([a.kode, b.kode, c.kode]).size).toBe(3);
  });

  it("semua nomor terisi: tidak ada kartu foto walau ada cadangan", () => {
    expect(kartuFoto({ laporan: true, slot: [1, 2, 3, 4, 5], cadangan: 2 })).toBeUndefined();
  });

  it("belum ada foto sama sekali dan tanpa cadangan: ajakan unggah semua", () => {
    const k = kartuFoto({ laporan: true, slot: [] })!;
    expect(k.aksi).toMatch(/Unggah foto/);
  });
});
