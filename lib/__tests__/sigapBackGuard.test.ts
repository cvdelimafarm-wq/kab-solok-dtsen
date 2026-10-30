// lib/__tests__/sigapBackGuard.test.ts
//
// (31 Okt 2026) PENJAGA BACK. Permintaan user: Back (tombol di layar maupun Back HP) harus mundur persis 1 langkah -- menutup 1 modal yang terbuka, atau kembali ke
// halaman sebelumnya -- tidak boleh meloncat jauh. Tes ini memindai kode di app/ dan GAGAL bila ada pola yang merusak itu, supaya pelanggaran ketahuan sebelum deploy
// (npm test) tanpa perlu mengingatkan lagi di setiap permintaan.
//
// Aturan:
//  1. Setiap modal / layar penuh (`fixed inset-0`, role="dialog", aria-modal) harus memakai useTutupDenganBack (Back HP menutupnya) -- kecuali yang
//     SENGAJA tak boleh ditutup (gerbang) atau bukan modal biasa; daftar pengecualian di bawah wajib beralasan dan dicek tetap relevan.
//  2. router.back() / history.back() / history.go() hanya di berkas yang memang pemilik mekanisme riwayat (daftar PEMILIK_RIWAYAT).
//     Halaman lain memakai <TombolKembali> / keAtas, bukan membuat tombol kembali sendiri.
//  3. router.push("/") / router.replace("/") hanya untuk sesi berakhir (konteksnya menyebut sesi); bukan sebagai "kembali" buatan.
//
// Cara memperbaiki bila tes ini gagal: lihat pesan galat -- untuk modal baru panggil useTutupDenganBack(terbuka, tutup) (app/portal/useTutupDenganBack.ts).

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const AKAR = path.resolve(__dirname, "..", "..");

function semuaBerkas(dir: string, hasil: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".next" || e.name === "__tests__") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) semuaBerkas(p, hasil);
    else if (/\.(ts|tsx)$/.test(e.name)) hasil.push(p);
  }
  return hasil;
}
const rel = (p: string) => path.relative(AKAR, p).split(path.sep).join("/");
/** buang komentar supaya penjelasan di komentar tidak dianggap kode */
const tanpaKomentar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const BERKAS = semuaBerkas(path.join(AKAR, "app")).map((p) => ({ nama: rel(p), isi: tanpaKomentar(fs.readFileSync(p, "utf8")) }));

/** Modal yang SENGAJA tidak ditutup Back HP. Alasan wajib. */
const PENGECUALIAN_MODAL: Record<string, string> = {
  "app/components/GerbangAplikasi.tsx": "gerbang layar penuh (masuk / izin awal): tidak boleh dilewati, bukan modal yang bisa ditutup",
  "app/components/TutupSementara.tsx": "layar penutup sementara aplikasi: tidak boleh ditutup pengguna",
  "app/portal/qc/QcGerbang.tsx": "gerbang QC wajib diisi petugas: tidak boleh ditutup",
  "app/portal/PengaturanAwal.tsx": "pengaturan awal wajib (notifikasi/instal): tidak boleh ditutup",
  "app/sigap/admin/PaletPerintah.tsx": "palet perintah admin untuk desktop (Esc / klik di luar), bukan alur HP",
  "app/sigap/delego/Lonceng.tsx": "dropdown notifikasi yang itemnya Link ke halaman lain; penanda riwayat bisa berebut dengan navigasi",
};

/** Pemilik mekanisme riwayat: satu-satunya tempat yang boleh memanggil back()/go(). */
const PEMILIK_RIWAYAT = new Set([
  "app/components/TombolKembali.tsx",
  "app/components/PenjagaKembali.tsx",
  "app/portal/navigasi.ts",
  "app/portal/lapisan.ts",
  "app/sigap/pendataan/page.tsx", // Sub SLS dibuka dengan pushState; menutupnya = mundur satu entri
]);

const POLA_MODAL = /fixed inset-0|role="dialog"|aria-modal/;
const PAKAI_HOOK = /useTutupDenganBack\(/;

describe("Penjaga Back: modal menutup dengan Back HP", () => {
  it("setiap modal / layar penuh memakai useTutupDenganBack (kecuali pengecualian beralasan)", () => {
    const melanggar = BERKAS.filter((b) => POLA_MODAL.test(b.isi) && !PAKAI_HOOK.test(b.isi) && !(b.nama in PENGECUALIAN_MODAL)).map((b) => b.nama);
    expect(melanggar, `Modal tanpa useTutupDenganBack (Back HP akan keluar dari halaman, bukan menutup modal): ${melanggar.join(", ")}`).toEqual([]);
  });

  it("daftar pengecualian tidak usang: berkasnya ada, masih berpola modal, dan belum memakai hook", () => {
    for (const nama of Object.keys(PENGECUALIAN_MODAL)) {
      const b = BERKAS.find((x) => x.nama === nama);
      expect(b, `${nama} tidak ada lagi: hapus dari PENGECUALIAN_MODAL`).toBeTruthy();
      expect(POLA_MODAL.test(b!.isi), `${nama} tidak lagi berpola modal: hapus dari PENGECUALIAN_MODAL`).toBe(true);
      expect(PAKAI_HOOK.test(b!.isi), `${nama} sudah memakai useTutupDenganBack: hapus dari PENGECUALIAN_MODAL`).toBe(false);
    }
  });
});

describe("Penjaga Back: tidak ada tombol kembali buatan", () => {
  it("router.back() / history.back() / history.go() hanya di pemilik mekanisme riwayat", () => {
    const melanggar = BERKAS.filter((b) => /router\.back\(\)|history\.back\(\)|history\.go\(/.test(b.isi) && !PEMILIK_RIWAYAT.has(b.nama)).map((b) => b.nama);
    expect(melanggar, `Pakai <TombolKembali> / keAtas, bukan back() sendiri: ${melanggar.join(", ")}`).toEqual([]);
  });

  it("pemilik riwayat yang terdaftar memang masih ada", () => {
    for (const nama of PEMILIK_RIWAYAT) expect(BERKAS.some((b) => b.nama === nama), `${nama} tidak ada lagi: hapus dari PEMILIK_RIWAYAT`).toBe(true);
  });

  it('router.push("/") / router.replace("/") hanya untuk sesi berakhir', () => {
    const melanggar: string[] = [];
    for (const b of BERKAS) {
      const baris = b.isi.split("\n");
      baris.forEach((l, i) => {
        if (!/router\.(push|replace)\(\s*["']\/["']\s*\)/.test(l)) return;
        const konteks = baris.slice(Math.max(0, i - 2), i + 1).join(" ").toLowerCase();
        if (!konteks.includes("sesi")) melanggar.push(`${b.nama}:${i + 1}`);
      });
    }
    expect(melanggar, `Pindah ke "/" bukan karena sesi berakhir (Back buatan?): ${melanggar.join(", ")}`).toEqual([]);
  });
});
