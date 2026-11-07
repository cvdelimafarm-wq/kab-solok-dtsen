// lib/__tests__/lihatSebagaiGanti.test.ts
//
// (7 Nov 2026) Penjaga: pindah akun "Lihat sebagai" harus berlaku langsung tanpa keluar-masuk lagi.
// Penyebab bug: pemilih akun adalah lapisan Back (useTutupDenganBack); menutupnya memanggil history.back() yang tak sinkron, sehingga
// window.location.replace("/") yang dijalankan bersamaan dikalahkan oleh mundur itu dan mode baru tak diterapkan. Muat ulang harus lewat
// setelahLapisanTutup(). Tes ini memindai sumber (komponen React tak bisa dirender di lingkungan node) dan gagal bila pola lama kembali.
// Juga memastikan sakelar Kartu | Ikon berada di ATAS kartu Temuan Anomali di Beranda.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const AKAR = path.resolve(__dirname, "..", "..");
const baca = (rel: string) => fs.readFileSync(path.join(AKAR, rel), "utf8");

/** Ambil isi fungsi `function nama(` sampai kurung kurawal penutupnya. */
function badanFungsi(src: string, nama: string): string {
  const mulai = src.indexOf(`function ${nama}(`);
  expect(mulai, `fungsi ${nama} tidak ditemukan`).toBeGreaterThanOrEqual(0);
  const buka = src.indexOf("{", src.indexOf(")", mulai));
  let dalam = 0;
  for (let i = buka; i < src.length; i++) {
    if (src[i] === "{") dalam++;
    else if (src[i] === "}" && --dalam === 0) return src.slice(buka, i + 1);
  }
  throw new Error(`kurung fungsi ${nama} tak seimbang`);
}

/** Setiap window.location.replace("/") di badan fungsi harus berada di dalam setelahLapisanTutup(() => ...). */
function replaceDiBungkus(badanMentah: string): boolean {
  const badan = badanMentah.replace(/\/\/[^\n]*/g, ""); // komentar baris dibuang (komentar boleh menyebut window.location.replace)
  const semua = [...badan.matchAll(/window\.location\.replace\(/g)].map((m) => m.index as number);
  if (semua.length === 0) return false;
  return semua.every((i) => {
    const sebelum = badan.slice(0, i);
    const b = sebelum.lastIndexOf("setelahLapisanTutup(");
    if (b < 0) return false;
    // tak boleh ada titik koma level-atas setelah pembungkus ditutup: cukup periksa bahwa pembungkus terdekat belum "selesai" sebelum replace
    const potong = sebelum.slice(b);
    const buka = (potong.match(/\(/g) || []).length;
    const tutup = (potong.match(/\)/g) || []).length;
    return buka > tutup;
  });
}

describe("Lihat sebagai: pindah akun menunggu pemilih tertutup", () => {
  it("Beranda.pilihSebagai memuat ulang lewat setelahLapisanTutup (dan menulis mode di dalamnya)", () => {
    const src = baca("app/portal/Beranda.tsx");
    expect(src).toMatch(/import \{ setelahLapisanTutup \} from "\.\/lapisan"/);
    const badan = badanFungsi(src, "pilihSebagai");
    expect(replaceDiBungkus(badan)).toBe(true);
    // mode baru ditulis di dalam pembungkus juga: bila ditulis sebelum, tutup lapisan tak mengganggu, tetapi urutan ini yang sudah teruji
    const bersih = badan.replace(/\/\/[^\n]*/g, "");
    expect(bersih.indexOf("mulaiLihatSebagai(")).toBeGreaterThan(bersih.indexOf("setelahLapisanTutup("));
  });

  it("BannerLihatSebagai: kembali() dan pilih() menutup pemilih lalu memuat ulang lewat setelahLapisanTutup", () => {
    const src = baca("app/components/BannerLihatSebagai.tsx");
    expect(src).toMatch(/import \{ setelahLapisanTutup \} from "@\/app\/portal\/lapisan"/);
    for (const nama of ["kembali", "pilih"]) {
      const badan = badanFungsi(src, nama);
      expect(badan, `${nama}() harus menutup pemilih`).toMatch(/setGanti\(false\)/);
      expect(replaceDiBungkus(badan), `${nama}() memuat ulang tanpa menunggu`).toBe(true);
    }
  });
});

describe("Beranda: letak sakelar Kartu | Ikon", () => {
  it("<PilihTampilan> hanya satu, dan ada sebelum <KartuAnomali>", () => {
    const src = baca("app/portal/Beranda.tsx");
    const pakai = [...src.matchAll(/<PilihTampilan\b/g)];
    expect(pakai.length).toBe(1);
    expect(src.indexOf("<PilihTampilan")).toBeLessThan(src.indexOf("<KartuAnomali"));
  });

  it("sakelar tidak lagi di dalam bagian 'Kegiatan saya'", () => {
    const src = baca("app/portal/Beranda.tsx");
    const awal = src.indexOf('aria-label="Kegiatan saya"');
    expect(awal).toBeGreaterThan(0);
    expect(src.indexOf("<PilihTampilan")).toBeLessThan(awal);
  });
});

describe("PilihTampilan: sakelar ringkas (7 Nov 2026)", () => {
  const src = baca("app/portal/PilihTampilan.tsx");
  it("tanpa tulisan 'Tampilan' yang makan tempat, tetapi tetap berlabel untuk pembaca layar", () => {
    expect(src).toMatch(/aria-label="Tampilan kegiatan"/);
    expect(src).not.toMatch(/<span[^>]*>\s*Tampilan\s*<\/span>/);
  });
  it("tombol tidak lebih tinggi dari 32 px (dulu min-h 44 px)", () => {
    expect(src).not.toMatch(/min-h-\[44px\]/);
    expect(src).toMatch(/\bh-8\b/);
  });
});
