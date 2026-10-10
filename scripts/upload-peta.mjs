// scripts/upload-peta.mjs
//
// (10 Okt 2026) Unggah berkas peta (peta SLS & peta WA desa) ke bucket Storage "peta-wilayah" -- permintaan user: file peta diunggah ke database.
// Jenis ditebak dari kode di depan nama berkas:
//   16 digit (idsubsls) atau 14 digit (kode SLS)  -> sls/   mis. "1303040001000100 1 dari 2.jpg"
//   10 digit (kode desa)                           -> wa/    mis. "1303040001.jpg" atau "1303040001 1 dari 2.jpg"
// Spasi pada nama diganti garis bawah saat diunggah (aman untuk Storage; aplikasi mengenali keduanya). Berkas yang sama ditimpa (aman diulang).
//
// Pakai (dari folder proyek):
//   node scripts/upload-peta.mjs "D:\peta"          -> unggah semua berkas di folder itu (termasuk subfolder)
//   node scripts/upload-peta.mjs "D:\peta" --dry    -> hanya tampilkan rencana, tidak mengunggah
//   node scripts/upload-peta.mjs "D:\peta" --batas=3 -> uji coba: unggah hanya 3 berkas pertama
// Butuh NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY (dibaca dari lingkungan atau .env.local). Kunci tidak ditampilkan.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "peta-wilayah";
// (10 Okt 2026) Boleh ada label nama sesudah kode, mis. "1303040001 - SURIAN.jpg" (peta WA dari Drive); label dibuang saat diunggah.
const POLA = /^(\d{16}|\d{14}|\d{10})(?:\s*-\s*[^.]*?)?(?:[\s_-]+(\d+)[\s_-]+dari[\s_-]+(\d+))?\.(jpe?g|png|pdf|webp)$/i;
const TIPE = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf", webp: "image/webp" };

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const folder = args.find((a) => !a.startsWith("--"));
if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
  console.error('Pakai: node scripts/upload-peta.mjs "<folder peta>" [--dry] [--batas=N]');
  process.exit(1);
}

function bacaEnvLokal() {
  try {
    for (const baris of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(baris);
      // (10 Okt 2026) Buang tanda kutip, spasi, dan kurung sudut <...> di pinggir nilai (kunci sempat tersimpan sebagai <eyJ...>).
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["'<\s]+|["'>\s]+$/g, "");
    }
  } catch {
    /* tanpa .env.local */
  }
}

function kumpulkan(dir, hasil = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) kumpulkan(p, hasil);
    else hasil.push(p);
  }
  return hasil;
}

const rencana = [];
const dilewati = [];
for (const p of kumpulkan(folder)) {
  const nama = path.basename(p);
  const m = POLA.exec(nama);
  if (!m) {
    dilewati.push(nama);
    continue;
  }
  const jenis = m[1].length === 10 ? "wa" : "sls";
  // Nama tersimpan dibentuk dari bagian yang dikenali: kode[_N_dari_M].ext (label nama nagari tidak ikut).
  const aman = `${m[1]}${m[2] ? `_${m[2]}_dari_${m[3]}` : ""}.${m[4].toLowerCase()}`;
  rencana.push({ p, jenis, kunci: `${jenis}/${aman}`, tipe: TIPE[m[4].toLowerCase()], kode: m[1] });
}

// (10 Okt 2026) --batas=N: unggah hanya N berkas pertama (uji coba kecil dulu) -- permintaan user.
const batas = Number((args.find((a) => a.startsWith("--batas=")) ?? "").slice(8));
if (batas > 0 && rencana.length > batas) {
  rencana.splice(batas);
  console.log(`Uji coba: hanya ${batas} berkas pertama yang diproses (--batas=${batas}).`);
}

const per = (j) => rencana.filter((r) => r.jenis === j);
console.log(`Ditemukan ${rencana.length} berkas peta: ${per("sls").length} peta SLS (${new Set(per("sls").map((r) => r.kode)).size} kode), ${per("wa").length} peta WA (${new Set(per("wa").map((r) => r.kode)).size} desa).`);
if (dilewati.length) console.log(`Dilewati ${dilewati.length} berkas yang namanya tidak dikenali, contoh: ${dilewati.slice(0, 5).join(" | ")}`);
if (dry) {
  for (const r of rencana.slice(0, 10)) console.log(`  ${r.kunci}`);
  if (rencana.length > 10) console.log(`  ... dan ${rencana.length - 10} lagi`);
  console.log("Mode --dry: tidak ada yang diunggah.");
  process.exit(0);
}

bacaEnvLokal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const kunci = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/^["'<\s]+|["'>\s]+$/g, "");
if (kunci && kunci.split(".").length !== 3) {
  console.error("SUPABASE_SERVICE_ROLE_KEY bukan kunci JWT yang utuh (harus 3 bagian dipisah titik, diawali eyJ). Periksa .env.local; kunci tidak ditampilkan.");
  process.exit(1);
}
if (!url || !kunci) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum ada (lingkungan atau .env.local).");
  process.exit(1);
}
const db = createClient(url, kunci, { auth: { persistSession: false } });

let ok = 0;
const gagal = [];
for (const [i, r] of rencana.entries()) {
  const { error } = await db.storage.from(BUCKET).upload(r.kunci, fs.readFileSync(r.p), { contentType: r.tipe, upsert: true });
  if (error) gagal.push(`${r.kunci}: ${error.message}`);
  else ok++;
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${rencana.length}`);
}
console.log(`Selesai: ${ok} berhasil, ${gagal.length} gagal.`);
for (const g of gagal.slice(0, 10)) console.log(`  GAGAL ${g}`);
process.exit(gagal.length ? 2 : 0);
