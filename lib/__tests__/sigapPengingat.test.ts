// lib/__tests__/sigapPengingat.test.ts
// (15 Okt 2026) Uji aturan modal pengingat dinamis (lib/sigapPengingat.ts).
import { describe, expect, it } from "vitest";
import { catatTampil, hariWib, kunciKekurangan, layakModal, masihKurang, MAKS_PER_HARI, pilihPengingat, segarkanKeadaan, TUNDA_MENIT } from "@/lib/sigapPengingat";
import type { Kekurangan } from "@/lib/sigapKekurangan";

const NOW = Date.parse("2026-10-15T09:00:00+07:00");
const mk = (o: Partial<Kekurangan>): Kekurangan => ({
  kode: "foto-2026-10-15", jenis: "foto", tanggal: "2026-10-15", skor: 74, nada: "emas", label: "TUGAS HARI INI", judul: "Foto kurang 2: nomor 4–5", ringkas: "Foto kurang 2",
  uraian: "Unggah 2 foto.", batas: null, aksi: "Unggah foto 4–5", href: "/sigap/translok/x?tab=hari_ini&fokus=foto", ...o,
});
const kosong = () => segarkanKeadaan(null, NOW);

describe("hariWib & segarkanKeadaan", () => {
  it("memakai tanggal WIB (UTC+7)", () => {
    expect(hariWib(Date.parse("2026-10-14T18:30:00Z"))).toBe("2026-10-15");
    expect(hariWib(Date.parse("2026-10-14T16:30:00Z"))).toBe("2026-10-14");
  });
  it("bentuk rusak -> kosong; hari berganti -> hitungan nol, tunda yang masih berlaku dibawa, yang lewat dibuang", () => {
    expect(segarkanKeadaan("x", NOW)).toEqual({ hari: "2026-10-15", tampil: 0, tunda: {} });
    const lama = { hari: "2026-10-14", tampil: 3, tunda: { a: NOW + 1000, b: NOW - 1000 } };
    expect(segarkanKeadaan(lama, NOW)).toEqual({ hari: "2026-10-15", tampil: 0, tunda: { a: NOW + 1000 } });
  });
});

describe("pilihPengingat", () => {
  it("memilih skor tertinggi; hari terlewat dan skor rendah tidak pernah jadi modal", () => {
    const d = [mk({ kode: "t", jenis: "hari_terlewat", skor: 60 }), mk({ kode: "f", skor: 74 }), mk({ kode: "i", jenis: "izin_susulan", skor: 90, judul: "Izin" })];
    expect(pilihPengingat(d, kosong(), NOW)?.kode).toBe("i");
    expect(pilihPengingat([mk({ jenis: "hari_terlewat", skor: 60 })], kosong(), NOW)).toBeNull();
    expect(layakModal(mk({ skor: 69 }))).toBe(false);
  });
  it("sekali per kekurangan: setelah tampil ditahan 2 jam, lalu muncul lagi bila masih kurang", () => {
    const k = mk({});
    let s = catatTampil(kosong(), k, NOW);
    expect(pilihPengingat([k], s, NOW + 60_000)).toBeNull();
    expect(pilihPengingat([k], s, NOW + (TUNDA_MENIT - 1) * 60_000)).toBeNull();
    expect(pilihPengingat([k], s, NOW + TUNDA_MENIT * 60_000 + 1000)?.kode).toBe(k.kode);
    s = segarkanKeadaan(s, NOW);
    expect(s.tampil).toBe(1);
  });
  it("angka berubah (foto 3 -> 4) = kekurangan baru dengan kunci baru, langsung boleh tampil", () => {
    const a = mk({ kode: "foto-2026-10-15-3", judul: "Foto kurang 2: nomor 4–5" });
    const b = mk({ kode: "foto-2026-10-15-4", judul: "Tinggal 1 foto lagi (nomor 5)" });
    expect(kunciKekurangan(a)).not.toBe(kunciKekurangan(b));
    const s = catatTampil(kosong(), a, NOW);
    expect(pilihPengingat([b], s, NOW + 1000)?.judul).toBe(b.judul);
  });
  it("maksimal 3 per hari; mendesak boleh melampaui sampai 2 kali lagi", () => {
    let s = kosong();
    for (let i = 0; i < MAKS_PER_HARI; i++) s = catatTampil(s, mk({ kode: `k${i}`, judul: `j${i}` }), NOW);
    const biasa = mk({ kode: "baru", judul: "baru" });
    const mendesak = mk({ kode: "m", judul: "m", skor: 88, nada: "merah" });
    expect(pilihPengingat([biasa], s, NOW + 5 * 3_600_000)).toBeNull();
    expect(pilihPengingat([biasa, mendesak], s, NOW + 5 * 3_600_000)?.kode).toBe("m");
    s = catatTampil(s, mk({ kode: "m1", judul: "m1", skor: 88 }), NOW);
    s = catatTampil(s, mk({ kode: "m2", judul: "m2", skor: 88 }), NOW);
    expect(pilihPengingat([mendesak], s, NOW + 5 * 3_600_000)).toBeNull();
  });
  it("hari berganti -> hitungan mulai lagi dari nol", () => {
    let s = kosong();
    for (let i = 0; i < 3; i++) s = catatTampil(s, mk({ kode: `k${i}`, judul: `j${i}` }), NOW);
    const besok = NOW + 24 * 3_600_000;
    expect(pilihPengingat([mk({ kode: "baru", judul: "baru" })], s, besok)?.kode).toBe("baru");
  });
  it("tertahan (dialog lain/antrean menunggu/simulasi) = tidak ada modal", () => {
    expect(pilihPengingat([mk({})], kosong(), NOW, true)).toBeNull();
  });
});

describe("masihKurang", () => {
  it("hilang bila kekurangan itu sudah tidak ada di daftar", () => {
    const k = mk({});
    expect(masihKurang([k], k)).toBe(true);
    expect(masihKurang([], k)).toBe(false);
    expect(masihKurang([mk({ kode: "lain", judul: "lain" })], k)).toBe(false);
  });
});
