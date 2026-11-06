// lib/__tests__/gerbangRuteGuard.test.ts
// (6 Nov 2026) PENJAGA OTOMATIS rute bencana (audit Kelola K04a-A1): setiap berkas route di app/api/bencana/** harus
// (a) tercantum sebagai PUBLIK di bawah ini, atau (b) memanggil gerbangBencanaAdmin di baris pertama SETIAP handler-nya.
// Rute baru yang lupa digerbangi akan membuat uji ini gagal. Menambah rute ke daftar PUBLIK adalah keputusan sadar:
// rute itu terbuka tanpa login dan memakai kunci service role -- jangan mengembalikan data pribadi petugas/mitra.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const AKAR = process.cwd();
const FOLDER_RUTE = path.join(AKAR, "app", "api", "bencana");
const FOLDER_HALAMAN = path.join(AKAR, "app", "bencana");

/** Publik karena dirancang demikian (isian umum mitra, atau tautan bertoken pribadi petugas). */
const PUBLIK = new Set([
  "gate/route.ts",
  "jorong/route.ts",
  "monitoring/route.ts",
  "pegawai-magang/route.ts",
  "wilayah/route.ts",
  "konfirmasi/[token]/route.ts",
  "lokasi/[token]/route.ts",
  "menginap/[token]/route.ts",
  "pml/[token]/route.ts",
  "undangan/akun/route.ts",
  "undangan/daftar/route.ts",
  "undangan/masuk/route.ts",
  "undangan/verifikasi/route.ts",
]);
/** Terbuka untuk dropdown/bantuan di form umum, tetapi nomor telepon wajib disamarkan bagi yang bukan pemegang izin PSP. */
const PUBLIK_DISAMARKAN = new Set(["mitra/route.ts", "rekomendasi-mitra/route.ts"]);

function semuaRute(dir: string, dasar = dir): string[] {
  const hasil: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) hasil.push(...semuaRute(p, dasar));
    else if (e.name === "route.ts") hasil.push(path.relative(dasar, p).split(path.sep).join("/"));
  }
  return hasil.sort();
}

function handler(isi: string): { metode: string; badan: string }[] {
  const hasil: { metode: string; badan: string }[] = [];
  const re = /export async function (GET|POST|PATCH|PUT|DELETE)\s*\([^)]*\)\s*\{\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(isi))) hasil.push({ metode: m[1], badan: isi.slice(m.index + m[0].length, m.index + m[0].length + 260) });
  return hasil;
}

describe("rute /api/bencana/**", () => {
  const rute = semuaRute(FOLDER_RUTE);

  it("ada rute yang diperiksa (uji tidak kosong)", () => {
    expect(rute.length).toBeGreaterThanOrEqual(30);
  });

  it("daftar PUBLIK tidak berisi berkas yang sudah tidak ada", () => {
    for (const r of [...PUBLIK, ...PUBLIK_DISAMARKAN]) expect(rute, r).toContain(r);
  });

  it("semua rute non-publik memanggil gerbangBencanaAdmin di awal setiap handler", () => {
    const tanpaGerbang: string[] = [];
    for (const r of rute) {
      if (PUBLIK.has(r) || PUBLIK_DISAMARKAN.has(r)) continue;
      const isi = fs.readFileSync(path.join(FOLDER_RUTE, r), "utf8");
      const hs = handler(isi);
      if (hs.length === 0) tanpaGerbang.push(`${r} (tanpa handler terbaca)`);
      for (const h of hs) if (!/await gerbangBencanaAdmin\(\w+\)/.test(h.badan)) tanpaGerbang.push(`${r} ${h.metode}`);
    }
    expect(tanpaGerbang).toEqual([]);
  });

  it("rute publik berdata pribadi memakai samarkanTelp dan pemegangIzinPsp", () => {
    for (const r of PUBLIK_DISAMARKAN) {
      const isi = fs.readFileSync(path.join(FOLDER_RUTE, r), "utf8");
      expect(isi, r).toContain("samarkanTelp");
      expect(isi, r).toContain("pemegangIzinPsp");
    }
  });

  it("tidak ada PIN statis di rute bencana", () => {
    for (const r of rute) {
      const isi = fs.readFileSync(path.join(FOLDER_RUTE, r), "utf8");
      expect(isi, r).not.toMatch(/PIN_RESET|PIN_TIMPA|"1234"/);
    }
  });

  it("rute admin yang bukan GET tidak menerima 'pin' sebagai kredensial", () => {
    for (const r of ["alokasi/reset-semua/route.ts", "alokasi/impor/route.ts"]) {
      const isi = fs.readFileSync(path.join(FOLDER_RUTE, r), "utf8");
      expect(isi, r).toContain("konfirmasi");
      expect(isi, r).not.toMatch(/body\??\.pin\b/);
    }
  });
});

describe("halaman admin /bencana", () => {
  const BERKAS = ["page.tsx", "PapanTim.tsx", "ReportKonfirmasiWilayah.tsx", "UndanganAdminCard.tsx"];
  const ADMIN = /\bfetch\(\s*[`"']\/api\/bencana\/(alokasi|master-petugas|kegiatan-petugas|pengaturan-beban)/;

  it("setiap panggilan ke rute admin memakai fetchBencana (mengirim sesi)", () => {
    for (const b of BERKAS) {
      const isi = fs.readFileSync(path.join(FOLDER_HALAMAN, b), "utf8");
      expect(ADMIN.test(isi), `${b} masih memakai fetch biasa ke rute admin`).toBe(false);
      expect(isi, b).toContain("fetchBencana");
    }
  });

  it("halaman utama tidak lagi mengirim 'pin'", () => {
    const isi = fs.readFileSync(path.join(FOLDER_HALAMAN, "page.tsx"), "utf8");
    expect(isi).not.toMatch(/\bpin: (resetPin|imporPin)/);
  });
});
