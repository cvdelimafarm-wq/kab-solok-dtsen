// scripts/peta/potong-peta.mjs
//
// (20 Okt 2026) Memotong peta dasar (OpenStreetMap lewat build harian Protomaps) per tim PML menjadi berkas .pmtiles kecil,
// lalu (opsional) mengunggahnya ke bucket Storage "peta-dasar" bersama manifest.json. Aplikasi (tab Peta Lembar Pendataan) membacanya.
// Wilayah tiap tim = sel 0,01 derajat berisi KK tim itu (scripts/peta/wilayah-tim.json) diperlebar --pad sel.
//
// Pakai (dari folder proyek, di laptop; butuh program `pmtiles` -- lihat scripts/peta/README.md):
//   node scripts/peta/potong-peta.mjs --daftar                     -> tampilkan tim, jumlah sel, kotak batas (tanpa jaringan)
//   node scripts/peta/potong-peta.mjs --perkiraan                  -> `pmtiles extract --dry-run` untuk tiap tim: ukuran perkiraan, TANPA mengunduh
//   node scripts/peta/potong-peta.mjs --tim=96,159                 -> potong dua tim itu ke folder peta-keluar/
//   node scripts/peta/potong-peta.mjs                              -> potong semua tim
//   node scripts/peta/potong-peta.mjs --unggah                     -> potong lalu unggah (berkas + manifest.json)
//   node scripts/peta/potong-peta.mjs --hanya-unggah               -> unggah berkas yang sudah ada di peta-keluar/ (tanpa memotong ulang)
//   node scripts/peta/potong-peta.mjs --spdt [--tim=9100498] ...   -> (21 Okt 2026) berkas Lembar SPDT NTP (per PPL, per PML, supervisor); wilayah dihitung dari tabel
//                                                                     sigap_spdt_kk (butuh NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Tanpa --spdt = tim PML bencana seperti biasa.
//   node scripts/peta/potong-peta.mjs --kegiatan=ID [--tim=KUNCI] ...  -> (8 Nov 2026) berkas peta KEGIATAN (survei model 1): per PPL, per PML, dan satu "semua wilayah" (Korwil/Supervisor).
//                                                                     Wilayah dihitung dari alokasi aktif (sigap_alokasi_wilayah) + poligon sub SLS di public/peta/batas/ (jalankan dari folder
//                                                                     proyek) + margin sekitar 500 m. Kunci berkas: lihat scripts/peta/wilayah-kegiatan.mjs. Berkas "semua" bisa besar:
//                                                                     --maxzoom-semua=13 (bawaan) atau --tanpa-semua untuk melewatinya. Kartu "Peta dasar tim" di Kelola Pendataan menampilkan statusnya.
// Pilihan: --sumber=<url|berkas .pmtiles> (bawaan: build harian Protomaps terbaru)  --pad=1  --maxzoom=15  --keluar=peta-keluar  --pmtiles=pmtiles
// Unggah butuh NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY (dari lingkungan atau .env.local). Kunci tidak ditampilkan.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { wilayahTim, sidik } from "./wilayah.mjs";
import { kelompokkanSpdt, ambilKkSpdt } from "./wilayah-spdt.mjs";
import { ambilAlokasiKegiatan, bacaBatasLokal, kelompokkanKegiatan } from "./wilayah-kegiatan.mjs";

const BUCKET = "peta-dasar";
const BATAS_UNGGAH = 50 * 1024 * 1024; // batas bawaan Supabase paket gratis per berkas
const AKAR_BUILD = "https://build.protomaps.com";
const FOLDER_INI = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const pilihan = (nama, bawaan) => {
  const a = args.find((x) => x.startsWith(`--${nama}=`));
  return a ? a.slice(nama.length + 3) : bawaan;
};
const ada = (nama) => args.includes(`--${nama}`);
const modeKegiatan = args.some((a) => a === "--kegiatan" || a.startsWith("--kegiatan="));

function bacaEnvLokal() {
  try {
    for (const baris of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(baris);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["'<\s]+|["'>\s]+$/g, "");
    }
  } catch {
    /* tanpa .env.local */
  }
}

async function dapatkanWilayah() {
  let mentah;
  const kegiatan = Number(pilihan("kegiatan", "0"));
  if (modeKegiatan) {
    if (!Number.isInteger(kegiatan) || kegiatan < 1) {
      console.error("--kegiatan=<id> harus berupa angka id kegiatan (mis. --kegiatan=7).");
      process.exit(1);
    }
    bacaEnvLokal();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const kunci = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !kunci) {
      console.error("--kegiatan butuh NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY (lingkungan atau .env.local).");
      process.exit(1);
    }
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(url, kunci, { auth: { persistSession: false } });
    const alokasi = await ambilAlokasiKegiatan(sb, kegiatan);
    if (!alokasi.length) {
      console.error(`Kegiatan ${kegiatan} belum punya alokasi sub SLS aktif.`);
      process.exit(1);
    }
    const folderBatas = path.join(process.cwd(), "public", "peta", "batas");
    const fitur = bacaBatasLokal(folderBatas, alokasi.map((a) => a.idsubsls));
    if (!fitur.size) {
      console.error(`Tidak ada poligon batas sub SLS di ${folderBatas}. Jalankan skrip ini dari folder proyek dan pastikan batas kecamatan sudah ada (gabung-batas-subsls.mjs).`);
      process.exit(1);
    }
    mentah = { tim: kelompokkanKegiatan(kegiatan, alokasi, fitur) };
    const hilang = new Set(Object.values(mentah.tim).flatMap((t) => t.tanpaBatas));
    if (hilang.size) console.warn(`! ${hilang.size} sub SLS beralokasi tidak punya poligon batas di berkas lokal, tidak ikut wilayah peta: ${[...hilang].slice(0, 5).join(", ")}${hilang.size > 5 ? ", ..." : ""}`);
    if (ada("tanpa-semua")) for (const [k, t] of Object.entries(mentah.tim)) if (t.peran === "semua") delete mentah.tim[k];
  } else if (ada("spdt")) {
    bacaEnvLokal();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const kunci = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !kunci) {
      console.error("--spdt butuh NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY (lingkungan atau .env.local).");
      process.exit(1);
    }
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(url, kunci, { auth: { persistSession: false } });
    mentah = { tim: kelompokkanSpdt(await ambilKkSpdt(sb)) };
  } else {
    mentah = JSON.parse(fs.readFileSync(path.join(FOLDER_INI, "wilayah-tim.json"), "utf8"));
  }
  const pad = Number(pilihan("pad", modeKegiatan ? "0" : "1")); // peta kegiatan: margin sudah 500 m dari poligon
  const diminta = pilihan("tim", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const hasil = [];
  for (const [id, t] of Object.entries(mentah.tim)) {
    if (diminta.length && !diminta.includes(id)) continue;
    hasil.push({ id, nama: t.nama, kk: t.kk, satuan: t.satuan ?? "KK", peran: t.peran, hash: t.hash, subsls: t.subsls, ...wilayahTim(t.lari, pad) });
  }
  for (const d of diminta) if (!hasil.some((h) => h.id === d)) console.warn(`! Tim ${d} tidak ada di ${modeKegiatan ? "alokasi kegiatan" : ada("spdt") ? "data SPDT" : "wilayah-tim.json"}, dilewati.`);
  return hasil;
}

/** Build harian Protomaps terbaru (mundur sampai 14 hari). */
async function cariBuildTerbaru() {
  for (let i = 0; i < 14; i++) {
    const t = new Date(Date.now() - i * 86400000);
    const nama = `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, "0")}${String(t.getUTCDate()).padStart(2, "0")}`;
    try {
      const res = await fetch(`${AKAR_BUILD}/${nama}.pmtiles`, { method: "HEAD" });
      if (res.ok) return { url: `${AKAR_BUILD}/${nama}.pmtiles`, nama };
    } catch {
      /* coba hari sebelumnya */
    }
  }
  return null;
}

function jalankanPmtiles(biner, argumen) {
  const r = spawnSync(biner, argumen, { stdio: "inherit" });
  if (r.error && r.error.code === "ENOENT") {
    console.error(`\nProgram "${biner}" tidak ditemukan. Unduh go-pmtiles (pmtiles.exe) dari https://github.com/protomaps/go-pmtiles/releases lalu taruh di folder proyek atau di PATH, atau beri --pmtiles=<lokasi>.`);
    process.exit(1);
  }
  return r.status === 0;
}

const label = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function bacaManifestLokal(keluar) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(keluar, "manifest.json"), "utf8"));
    if (m && typeof m === "object" && m.tim) return m;
  } catch {
    /* belum ada */
  }
  return { versi: "", dibuat: "", tim: {} };
}

async function unggah(keluar, manifest, daftarBerkas) {
  bacaEnvLokal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const kunci = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !kunci) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak ditemukan (lingkungan atau .env.local).");
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, kunci, { auth: { persistSession: false } });
  for (const nama of daftarBerkas) {
    const p = path.join(keluar, nama);
    const ukuran = fs.statSync(p).size;
    if (ukuran > BATAS_UNGGAH) {
      console.error(`x ${nama}: ${label(ukuran)} melebihi batas unggah ${label(BATAS_UNGGAH)} paket gratis. Kecilkan --maxzoom atau --pad, atau naikkan batas di Supabase. Dilewati.`);
      delete manifest.tim[nama.replace(/^tim-|\.pmtiles$/g, "")];
      continue;
    }
    process.stdout.write(`↑ ${nama} (${label(ukuran)}) ... `);
    const { error } = await sb.storage.from(BUCKET).upload(nama, fs.readFileSync(p), { upsert: true, contentType: "application/octet-stream", cacheControl: "60" });
    if (error) {
      console.log(`GAGAL: ${error.message}`);
      delete manifest.tim[nama.replace(/^tim-|\.pmtiles$/g, "")];
    } else console.log("ok");
  }
  // (21 Okt 2026) gabungkan dengan manifest yang SUDAH di Storage: memotong sebagian (mis. hanya --spdt) tidak boleh menghapus tim lain dari manifest
  try {
    const { data: lama } = await sb.storage.from(BUCKET).download("manifest.json");
    if (lama) {
      const j = JSON.parse(await lama.text());
      if (j && typeof j === "object" && j.tim) for (const [k, v] of Object.entries(j.tim)) if (!(k in manifest.tim)) manifest.tim[k] = v;
    }
  } catch {
    /* belum ada manifest lama */
  }
  // manifest terakhir: aplikasi baru "melihat" versi baru setelah semua berkas naik
  const { error } = await sb.storage.from(BUCKET).upload("manifest.json", Buffer.from(JSON.stringify(manifest, null, 1)), { upsert: true, contentType: "application/json", cacheControl: "30" });
  console.log(error ? `x manifest.json GAGAL: ${error.message}` : "↑ manifest.json ok");
  if (error && /not found|bucket/i.test(error.message)) console.error('Bucket "peta-dasar" belum ada: jalankan supabase/migrations/20261020b_peta_dasar_bucket.sql dulu.');
}

async function utama() {
  const wilayah = await dapatkanWilayah();
  if (!wilayah.length) {
    console.error("Tidak ada tim yang dipilih.");
    process.exit(1);
  }

  if (ada("daftar")) {
    console.log("tim\tkk/sub SLS\tsel(+pad)\tbarat\tselatan\ttimur\tutara\tnama");
    for (const w of wilayah) console.log([w.id, w.kk, w.sel, ...w.kotak, w.nama].join("\t"));
    return;
  }

  const keluar = path.resolve(pilihan("keluar", "peta-keluar"));
  const maxzoom = Number(pilihan("maxzoom", "15"));
  const maxzoomSemua = Number(pilihan("maxzoom-semua", "13")); // berkas "semua wilayah" (kegiatan) luas: zoom maks lebih kecil menjaga ukuran di bawah batas unggah
  const biner = pilihan("pmtiles", "pmtiles");
  fs.mkdirSync(keluar, { recursive: true });
  const manifest = bacaManifestLokal(keluar);

  if (ada("hanya-unggah")) {
    const berkas = wilayah.map((w) => `tim-${w.id}.pmtiles`).filter((n) => fs.existsSync(path.join(keluar, n)));
    if (!berkas.length) {
      console.error(`Tidak ada berkas tim-*.pmtiles di ${keluar}.`);
      process.exit(1);
    }
    await unggah(keluar, manifest, berkas);
    return;
  }

  let sumber = pilihan("sumber", "");
  let namaBuild = "";
  if (!sumber) {
    const b = await cariBuildTerbaru();
    if (!b) {
      console.error(`Tidak bisa menemukan build harian di ${AKAR_BUILD} (tanpa internet / diblokir?). Beri --sumber=<url atau berkas .pmtiles>.`);
      process.exit(1);
    }
    sumber = b.url;
    namaBuild = b.nama;
    console.log(`Sumber: ${sumber}`);
  } else {
    namaBuild = path.basename(sumber).replace(/\.pmtiles$/i, "").replace(/[^\w.-]/g, "_");
  }

  const perkiraan = ada("perkiraan");
  const dibuat = [];
  for (const w of wilayah) {
    const berkasGeo = path.join(keluar, `wilayah-${w.id}.geojson`);
    fs.writeFileSync(berkasGeo, JSON.stringify(w.geojson));
    const nama = `tim-${w.id}.pmtiles`;
    const tujuan = path.join(keluar, nama);
    const zoomIni = w.peran === "semua" ? Math.min(maxzoom, maxzoomSemua) : maxzoom;
    console.log(`\n== Tim ${w.id} ${w.nama} (${w.kk} ${w.satuan}, ${w.sel} sel, zoom maks ${zoomIni}) ==`);
    const ok = jalankanPmtiles(biner, ["extract", sumber, tujuan, `--region=${berkasGeo}`, `--maxzoom=${zoomIni}`, ...(perkiraan ? ["--dry-run"] : [])]);
    if (!ok) {
      console.error(`x Tim ${w.id}: pmtiles extract gagal, dilewati.`);
      continue;
    }
    if (perkiraan) continue;
    const ukuran = fs.statSync(tujuan).size;
    manifest.tim[w.id] = { berkas: nama, ukuran, versi: `${namaBuild}-${sidik(JSON.stringify(w.geojson) + zoomIni)}`, ...(w.hash ? { hash: w.hash, subsls: w.subsls } : {}) };
    dibuat.push(nama);
    console.log(`✓ ${nama}: ${label(ukuran)}`);
  }
  if (perkiraan) {
    console.log("\nPerkiraan selesai (tidak ada berkas dibuat). Jalankan tanpa --perkiraan untuk memotong.");
    return;
  }

  manifest.versi = namaBuild;
  manifest.dibuat = new Date().toISOString();
  fs.writeFileSync(path.join(keluar, "manifest.json"), JSON.stringify(manifest, null, 1));
  const total = Object.values(manifest.tim).reduce((j, b) => j + b.ukuran, 0);
  console.log(`\nManifest: ${Object.keys(manifest.tim).length} tim, total ${label(total)} di ${keluar}`);

  if (ada("unggah")) await unggah(keluar, manifest, dibuat);
  else console.log("Belum diunggah. Tambahkan --unggah (atau jalankan --hanya-unggah) bila hasilnya sudah sesuai.");
}

utama().catch((e) => {
  console.error(e);
  process.exit(1);
});
