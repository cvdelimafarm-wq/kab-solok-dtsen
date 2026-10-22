// (22 Okt 2026) Uji pengaman kebocoran memori Railway (catatan-kebocoran-memori-railway.md).
// Kode SERVER wajib memakai `createClient` dari "@/lib/supabaseServer" (auth dimatikan + klien dipakai bersama), bukan langsung dari
// "@supabase/supabase-js": klien bawaan memasang setInterval auto refresh yang tidak pernah dilepas (~14,7 KB per klien per request).
// Uji ini GAGAL bila ada berkas server baru yang kembali mengimpor createClient langsung.
//
// Dikecualikan: lib/supabaseServer.ts sendiri; berkas "use client" (kode browser memang butuh klien sesinya sendiri); berkas uji;
// impor `import type` (tidak membuat klien). Kalau ada pengecualian sah lain, tambahkan ke PENGECUALIAN dengan alasan.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const AKAR = resolve(__dirname, "..", "..");
const FOLDER_PINDAI = ["app", "lib"];

/** Berkas yang sah mengimpor createClient langsung (jalur relatif dari akar repo, pemisah "/"). */
const PENGECUALIAN: Record<string, string> = {
  "lib/supabaseServer.ts": "pembungkus resmi: satu-satunya tempat yang boleh memanggil createClient supabase-js",
};

/** Apakah isi berkas memuat impor NILAI createClient dari supabase-js (bukan `import type`)? */
function imporLangsung(isi: string): boolean {
  const tanpaKomentar = isi.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const bernama = /import\s+(?!type\b)(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s*from\s*["']@supabase\/supabase-js["']/g;
  for (const m of tanpaKomentar.matchAll(bernama)) {
    const nama = m[1].split(",").map((s) => s.trim()).filter((s) => s && !/^type\s/.test(s));
    if (nama.some((n) => /^createClient(\s+as\s+\w+)?$/.test(n))) return true;
  }
  if (/import\s+\*\s+as\s+\w+\s+from\s*["']@supabase\/supabase-js["']/.test(tanpaKomentar)) return true;
  if (/(?:require|import)\(\s*["']@supabase\/supabase-js["']\s*\)/.test(tanpaKomentar)) return true;
  return false;
}

/** Berkas kode browser ("use client" sebagai pernyataan pertama). */
function berkasKlien(isi: string): boolean {
  const awal = isi.replace(/^\uFEFF/, "").replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
  return /^["']use client["']/.test(awal);
}

function kumpulkan(folder: string, hasil: string[] = []): string[] {
  for (const nama of readdirSync(folder)) {
    if (nama === "node_modules" || nama === ".next" || nama === "__tests__") continue;
    const p = join(folder, nama);
    const st = statSync(p);
    if (st.isDirectory()) kumpulkan(p, hasil);
    else if (/\.(ts|tsx|mts|js|mjs)$/.test(nama) && !/\.(test|spec)\.[tj]sx?$/.test(nama)) hasil.push(p);
  }
  return hasil;
}

describe("detektor impor langsung supabase-js", () => {
  it("mengenali impor nilai createClient dalam berbagai bentuk", () => {
    expect(imporLangsung(`import { createClient } from "@supabase/supabase-js";`)).toBe(true);
    expect(imporLangsung(`import { createClient as buat } from '@supabase/supabase-js'`)).toBe(true);
    expect(imporLangsung(`import {\n  type SupabaseClient,\n  createClient,\n} from "@supabase/supabase-js";`)).toBe(true);
    expect(imporLangsung(`import * as sb from "@supabase/supabase-js";`)).toBe(true);
    expect(imporLangsung(`const { createClient } = require("@supabase/supabase-js");`)).toBe(true);
    expect(imporLangsung(`const m = await import("@supabase/supabase-js");`)).toBe(true);
  });

  it("tidak menandai impor tipe, impor pembungkus, atau teks dalam komentar", () => {
    expect(imporLangsung(`import type { SupabaseClient } from "@supabase/supabase-js";`)).toBe(false);
    expect(imporLangsung(`import { type SupabaseClient } from "@supabase/supabase-js";`)).toBe(false);
    expect(imporLangsung(`import type { createClient } from "@supabase/supabase-js";`)).toBe(false);
    expect(imporLangsung(`import { createClient } from "@/lib/supabaseServer";`)).toBe(false);
    expect(imporLangsung(`// import { createClient } from "@supabase/supabase-js";\nconst x = 1;`)).toBe(false);
    expect(imporLangsung(`/* import { createClient } from "@supabase/supabase-js"; */`)).toBe(false);
  });

  it("mengenali berkas kode browser", () => {
    expect(berkasKlien(`"use client";\nimport x from "y";`)).toBe(true);
    expect(berkasKlien(`'use client'\nimport x from "y";`)).toBe(true);
    expect(berkasKlien(`// komentar dulu\n"use client";\n`)).toBe(true);
    expect(berkasKlien(`import x from "y";\n"use client";`)).toBe(false);
    expect(berkasKlien(`export const a = 1;`)).toBe(false);
  });
});

describe("kode server memakai klien bersama", () => {
  it("pembungkus ada dan mematikan auto refresh", () => {
    const isi = readFileSync(join(AKAR, "lib", "supabaseServer.ts"), "utf8");
    expect(isi).toMatch(/autoRefreshToken:\s*false/);
    expect(isi).toMatch(/persistSession:\s*false/);
  });

  it("tidak ada berkas server yang mengimpor createClient langsung dari @supabase/supabase-js", () => {
    const berkas = FOLDER_PINDAI.flatMap((f) => kumpulkan(join(AKAR, f)));
    expect(berkas.length).toBeGreaterThan(0);
    const pelanggar: string[] = [];
    for (const p of berkas) {
      const rel = relative(AKAR, p).split("\\").join("/");
      if (rel in PENGECUALIAN) continue;
      const isi = readFileSync(p, "utf8");
      if (!imporLangsung(isi)) continue;
      if (berkasKlien(isi)) continue;
      pelanggar.push(rel);
    }
    expect(
      pelanggar,
      `Berkas server ini masih mengimpor createClient langsung dari @supabase/supabase-js. Ganti ke: import { createClient } from "@/lib/supabaseServer";\n  ${pelanggar.join("\n  ")}`
    ).toEqual([]);
  });
});
