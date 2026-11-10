// lib/__tests__/responsPenggunaMonitoring.test.ts
//
// (11 Nov 2026) PENJAGA: setiap respons pengguna (pretest, posttest, presensi, undangan, hari tugas, translok, kuis, penilaian, dll.) wajib terpantau
// di backoffice. Aturan dan cara menambah fitur: lihat kepala lib/responsPengguna.ts. Pemindaian sumber (tanpa merender React).

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { BUKAN_RESPONS, RESPONS_PENGGUNA, kodeRespons, tabelRespons } from "../responsPengguna";
import { BUKAN_UMPAN_BALIK, UMPAN_BALIK } from "../umpanBalik";

const AKAR = path.resolve(__dirname, "..", "..");
const ada = (rel: string) => fs.existsSync(path.join(AKAR, rel));
const baca = (rel: string) => fs.readFileSync(path.join(AKAR, rel), "utf8");
const LEWATI = new Set(["node_modules", ".next", ".git", "__tests__"]);

function berkas(rel: string, cocok: (nama: string) => boolean): string[] {
  const dir = path.join(AKAR, rel);
  if (!fs.existsSync(dir)) return [];
  const hasil: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (LEWATI.has(e.name)) continue;
    const sub = `${rel}/${e.name}`;
    if (e.isDirectory()) hasil.push(...berkas(sub, cocok));
    else if (cocok(e.name)) hasil.push(sub);
  }
  return hasil;
}

const kutip = (t: string) => new RegExp(`\\.from\\(\\s*["'\`]${t}["'\`]\\s*\\)`);
const memuatSalahSatu = (src: string, tabel: string[]) => tabel.some((t) => kutip(t).test(src));

const terdaftar = new Set<string>([
  ...tabelRespons(),
  ...BUKAN_RESPONS.map((b) => b.tabel),
  ...UMPAN_BALIK.map((s) => s.tabel),
  ...BUKAN_UMPAN_BALIK.map((b) => b.tabel),
]);

describe("registri respons pengguna", () => {
  it("kode dan tabel unik; tidak ada tabel di dua daftar sekaligus", () => {
    expect(new Set(kodeRespons()).size).toBe(RESPONS_PENGGUNA.length);
    const semua = tabelRespons();
    expect(new Set(semua).size, "tabel respons ganda").toBe(semua.length);
    const bukan = BUKAN_RESPONS.map((b) => b.tabel);
    expect(new Set(bukan).size, "BUKAN_RESPONS ganda").toBe(bukan.length);
    for (const t of bukan) {
      expect(semua.includes(t), `${t} tidak boleh ada di RESPONS_PENGGUNA dan BUKAN_RESPONS`).toBe(false);
      expect(UMPAN_BALIK.some((s) => s.tabel === t), `${t} sudah di UMPAN_BALIK`).toBe(false);
    }
    for (const b of BUKAN_RESPONS) expect(b.alasan.trim().length, `${b.tabel}: alasan wajib diisi`).toBeGreaterThan(15);
  });
});

describe.each(RESPONS_PENGGUNA.map((s) => [s.kode, s] as const))("respons %s", (_kode, s) => {
  it("berkas penulis ada dan memakai tabelnya", () => {
    for (const t of s.tulis) {
      expect(ada(t), `${t} tidak ada`).toBe(true);
      const src = baca(t);
      if (t.startsWith("app/api/")) expect(src, `${t} harus mengekspor POST/PUT/PATCH`).toMatch(/export\s+async\s+function\s+(POST|PUT|PATCH)\b/);
      expect(memuatSalahSatu(src, s.tabel), `${t} harus memakai salah satu tabel: ${s.tabel.join(", ")}`).toBe(true);
    }
  });

  it("rute/berkas baca pengelola ada dan membaca tabelnya", () => {
    expect(ada(s.baca), `${s.baca} tidak ada`).toBe(true);
    expect(memuatSalahSatu(baca(s.baca), s.tabel), `${s.baca} harus membaca salah satu tabel: ${s.tabel.join(", ")}`).toBe(true);
  });

  it("halaman pemantau ada", () => {
    expect(ada(s.halaman), `${s.halaman} tidak ada`).toBe(true);
    expect(s.alamat.trim().length).toBeGreaterThan(0);
  });
});

describe("penemuan tabel respons yang belum terdaftar", () => {
  it("tabel sigap_*/bencana_* yang ditulis (insert/upsert) oleh rute POST/PUT/PATCH harus terdaftar: RESPONS_PENGGUNA, UMPAN_BALIK, atau BUKAN_RESPONS", () => {
    const pola = /\.from\(\s*["'`]((?:sigap|bencana)_[a-z0-9_]+)["'`]\s*\)\s*\.(?:insert|upsert)\(/g;
    const belum = new Map<string, string[]>();
    for (const f of berkas("app/api/sigap", (n) => n === "route.ts")) {
      const src = baca(f);
      if (!/export\s+async\s+function\s+(POST|PUT|PATCH)\b/.test(src)) continue;
      for (const m of src.matchAll(pola)) {
        if (!terdaftar.has(m[1])) belum.set(m[1], [...(belum.get(m[1]) ?? []), f]);
      }
    }
    const laporan = [...belum].map(([t, fs_]) => `${t} (ditulis di ${[...new Set(fs_)].slice(0, 3).join(", ")})`);
    expect(
      laporan,
      "Tabel ini menerima isian lewat rute API tetapi belum terdaftar: tambahkan ke RESPONS_PENGGUNA (dengan rute baca + halaman pemantau di backoffice), UMPAN_BALIK, atau BUKAN_RESPONS (dengan alasan) di lib/responsPengguna.ts.",
    ).toEqual([]);
  });

  it("SQL baru (sejak 20261111) yang membuat tabel sigap_*/bencana_* harus terdaftar di salah satu daftar", () => {
    const belum: string[] = [];
    for (const f of berkas("skema-sql", (n) => /^\d{8}[a-z]*_.*\.sql$/.test(n))) {
      if (path.posix.basename(f).slice(0, 8) < "20261111") continue;
      for (const m of baca(f).matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?((?:sigap|bencana)_[a-z0-9_]+)/gi)) {
        const t = m[1].toLowerCase();
        if (!terdaftar.has(t)) belum.push(`${t} (${f})`);
      }
    }
    expect(belum, "Tabel baru belum diklasifikasi: daftarkan di lib/responsPengguna.ts (respons pengguna + monitoring, atau BUKAN_RESPONS dengan alasan)").toEqual([]);
  });
});
