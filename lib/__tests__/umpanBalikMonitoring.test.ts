// lib/__tests__/umpanBalikMonitoring.test.ts
//
// (10 Nov 2026) PENJAGA: setiap fitur yang mengumpulkan umpan balik dari pengguna (masukan, polling, penilaian, usulan, ...) wajib terpantau di SIGAP Kelola.
// Aturan dan cara menambah fitur baru: lihat kepala lib/umpanBalik.ts. Pemindaian sumber (komponen React tidak bisa dirender di lingkungan node).
//
// Pesan gagal sengaja berisi tindakan yang harus dilakukan, mis. "daftarkan di lib/umpanBalik.ts".

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { BUKAN_UMPAN_BALIK, POLA_NAMA_UMPAN_BALIK, UMPAN_BALIK, kodeUmpanBalik } from "../umpanBalik";

const AKAR = path.resolve(__dirname, "..", "..");
const ada = (rel: string) => fs.existsSync(path.join(AKAR, rel));
const baca = (rel: string) => fs.readFileSync(path.join(AKAR, rel), "utf8");
const LEWATI = new Set(["node_modules", ".next", ".git", "__tests__"]);

/** Semua berkas (relatif, pemisah "/") di bawah `rel` yang lolos `cocok`. Folder yang tidak ada = kosong (mis. sandbox). */
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

const terdaftar = new Set<string>([...UMPAN_BALIK.map((s) => s.tabel), ...BUKAN_UMPAN_BALIK.map((b) => b.tabel)]);
const apiDariBerkas = (rute: string) => rute.replace(/^app/, "").replace(/\/route\.ts$/, "");
const kutip = (t: string) => new RegExp(`\\.from\\(\\s*["'\`]${t}["'\`]\\s*\\)`);

describe("registri umpan balik", () => {
  it("kode dan tabel unik; tabel tidak sekaligus dikecualikan", () => {
    expect(new Set(kodeUmpanBalik()).size).toBe(UMPAN_BALIK.length);
    expect(new Set(UMPAN_BALIK.map((s) => s.tabel)).size).toBe(UMPAN_BALIK.length);
    expect(new Set(BUKAN_UMPAN_BALIK.map((b) => b.tabel)).size).toBe(BUKAN_UMPAN_BALIK.length);
    for (const b of BUKAN_UMPAN_BALIK) {
      expect(UMPAN_BALIK.some((s) => s.tabel === b.tabel), `${b.tabel} tidak boleh ada di kedua daftar`).toBe(false);
      expect(b.alasan.trim().length, `${b.tabel}: alasan pengecualian wajib diisi`).toBeGreaterThan(15);
    }
  });

  it("penilaian rahasia (360) tidak pernah menampilkan cuplikan isi di pantauan induk", () => {
    expect(UMPAN_BALIK.find((s) => s.kode === "penilaian360")?.cuplikan).toBeUndefined();
  });
});

describe.each(UMPAN_BALIK.map((s) => [s.kode, s] as const))("sumber %s", (_kode, s) => {
  it("rute penerima: berkas ada, menerima POST, menulis ke tabelnya, dan bertanda UMPAN-BALIK", () => {
    expect(s.tulis.length).toBeGreaterThan(0);
    for (const t of s.tulis) {
      expect(ada(t), `${t} tidak ada`).toBe(true);
      const src = baca(t);
      expect(src, `${t} harus mengekspor POST`).toMatch(/export\s+async\s+function\s+POST\b/);
      expect(src, `${t} harus memakai tabel ${s.tabel}`).toMatch(kutip(s.tabel));
      expect(src, `${t} harus bertanda "UMPAN-BALIK: ${s.kode}"`).toMatch(new RegExp(`UMPAN-BALIK:\\s*${s.kode}\\b`));
    }
  });

  it("rute baca pengelola: berkas ada, GET, membaca tabelnya, dan memeriksa izin", () => {
    expect(ada(s.baca), `${s.baca} tidak ada`).toBe(true);
    const src = baca(s.baca);
    expect(src).toMatch(/export\s+async\s+function\s+GET\b/);
    expect(src).toMatch(kutip(s.tabel));
    expect(src, "rute baca harus memeriksa izin lewat boleh(...)").toMatch(/\bboleh\(/);
    expect(src, `rute baca harus memakai menu izin ${s.izin.menu}`).toContain(`"${s.izin.menu}"`);
  });

  it("halaman pemantau: ada, beralamat sesuai, dan memanggil rute baca", () => {
    expect(ada(s.halaman), `${s.halaman} tidak ada`).toBe(true);
    expect(s.alamat.startsWith("/sigap/")).toBe(true);
    expect(path.posix.dirname(s.halaman), `${s.halaman} tidak sesuai alamat ${s.alamat}`).toBe(`app${s.alamat}`);
    expect(baca(s.halaman), `${s.halaman} harus memanggil ${apiDariBerkas(s.baca)}`).toContain(apiDariBerkas(s.baca));
  });
});

describe("pantauan induk (Umpan balik pengguna)", () => {
  it("rute induk dibangun dari registri dan memeriksa izin tiap sumber", () => {
    const rute = "app/api/sigap/kelola/umpan-balik/route.ts";
    expect(ada(rute)).toBe(true);
    const src = baca(rute);
    expect(src).toMatch(/from\s+"@\/lib\/umpanBalik"/);
    expect(src).toContain("UMPAN_BALIK");
    expect(src).toMatch(/boleh\(izin,\s*s\.izin\.menu,\s*s\.izin\.level/);
  });
  it("halaman induk memanggil rute induk, dan menu Kelola menautkannya", () => {
    expect(baca("app/sigap/kelola/umpan-balik/page.tsx")).toContain("/api/sigap/kelola/umpan-balik");
    expect(baca("lib/sigapMenuV2.ts")).toContain("/sigap/kelola/umpan-balik");
  });
});

describe("penemuan fitur umpan balik yang belum terdaftar", () => {
  it("tabel sigap_*/bencana_* bernama mirip umpan balik yang dipakai di kode harus terdaftar (UMPAN_BALIK) atau dikecualikan (BUKAN_UMPAN_BALIK)", () => {
    const pola = /\.from\(\s*["'`]((?:sigap|bencana)_[a-z0-9_]+)["'`]\s*\)/g;
    const belum = new Map<string, string[]>();
    for (const f of [...berkas("app", (n) => /\.(ts|tsx)$/.test(n)), ...berkas("lib", (n) => /\.(ts|tsx)$/.test(n))]) {
      for (const m of baca(f).matchAll(pola)) {
        const t = m[1];
        if (POLA_NAMA_UMPAN_BALIK.test(t) && !terdaftar.has(t)) belum.set(t, [...(belum.get(t) ?? []), f]);
      }
    }
    const laporan = [...belum].map(([t, fs_]) => `${t} (dipakai di ${[...new Set(fs_)].slice(0, 3).join(", ")})`);
    expect(laporan, `Tabel ini tampak menampung umpan balik pengguna: daftarkan di lib/umpanBalik.ts (UMPAN_BALIK dengan halaman pemantau di sigap/kelola, atau BUKAN_UMPAN_BALIK dengan alasan).`).toEqual([]);
  });

  it("rute bertanda `UMPAN-BALIK: <kode>` harus memakai kode yang terdaftar", () => {
    const salah: string[] = [];
    for (const f of berkas("app/api", (n) => n === "route.ts")) {
      for (const m of baca(f).matchAll(/UMPAN-BALIK:\s*([a-z0-9_]+)/g)) {
        if (!kodeUmpanBalik().includes(m[1])) salah.push(`${f} -> ${m[1]}`);
      }
    }
    expect(salah, "Kode umpan balik pada rute belum terdaftar di lib/umpanBalik.ts").toEqual([]);
  });

  it("SQL baru (sejak 20261110) yang membuat tabel sigap_*/bencana_* bernama mirip umpan balik harus terdaftar atau dikecualikan", () => {
    const belum: string[] = [];
    for (const f of berkas("skema-sql", (n) => /^\d{8}[a-z]*_.*\.sql$/.test(n))) {
      if (path.posix.basename(f).slice(0, 8) < "20261110") continue;
      const sql = baca(f);
      for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?((?:sigap|bencana)_[a-z0-9_]+)/gi)) {
        const t = m[1].toLowerCase();
        if (POLA_NAMA_UMPAN_BALIK.test(t) && !terdaftar.has(t)) belum.push(`${t} (${f})`);
      }
    }
    expect(belum, "Tabel baru tampak menampung umpan balik pengguna: daftarkan di lib/umpanBalik.ts").toEqual([]);
  });
});
