// scripts/peta/gabung-batas-subsls.mjs
//
// (2 Nov 2026) Memeriksa dan menggabungkan berkas batas Sub SLS (satu berkas GeoJSON per Sub SLS, nama berkas = idsubsls 16 digit) menjadi berkas ringan untuk peta.
// TIDAK mengubah aplikasi dan tidak menyentuh basis data. Jalankan di laptop (Node 18+):
//
//   node scripts/peta/gabung-batas-subsls.mjs --dir "D:\\...\\batas-subsls" [--daftar daftar-idsubsls.txt] [--keluar peta-keluar/batas] [--desimal 6]
//
// --daftar : berkas teks berisi satu idsubsls per baris (mis. hasil `select idsubsls from bencana_wilayah` atau daftar seluruh Sub SLS Kab. Solok);
//            dipakai untuk mendaftar Sub SLS yang TIDAK punya berkas dan berkas yang tidak ada di daftar.
// --keluar : folder keluaran (bawaan: peta-keluar/batas). Berisi batas-subsls.json (semua), batas-<kode kecamatan>.json (per kecamatan), manifest.json, laporan.txt.
// --desimal: pembulatan koordinat (bawaan 6 = sekitar 0,11 m). TIDAK ada penyederhanaan garis: pembulatan yang sama membuat titik batas bersama dua Sub SLS tetap
//            identik (tidak timbul celah atau tumpang tindih baru). Pembulatan saja sudah memangkas ukuran lebih dari separuh.
//
// Pemeriksaan: sistem koordinat (harus WGS84/CRS84, bujur-lintang), nama berkas = idsubsls = properti, jenis geometri, gelang tertutup, kotak wilayah Kab. Solok,
// duplikat id, luas, sisi batas bersama (tetangga yang rapat) dan kandidat tumpang tindih (titik sebuah Sub SLS yang jatuh di dalam Sub SLS lain).

import fs from "node:fs";
import path from "node:path";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const DIR = arg("dir", "");
const KELUAR = arg("keluar", path.join("peta-keluar", "batas"));
const DESIMAL = Number(arg("desimal", "6"));
const DAFTAR = arg("daftar", "");
if (!DIR || !fs.existsSync(DIR)) {
  console.error('Pakai: node scripts/peta/gabung-batas-subsls.mjs --dir "<folder berkas .geojson>" [--daftar daftar.txt] [--keluar folder] [--desimal 6]');
  process.exit(1);
}
// kotak longgar Kabupaten Solok (bujur, lintang); di luar ini hampir pasti salah sistem koordinat atau tertukar
const KOTAK = { minX: 100.2, maxX: 101.6, minY: -1.9, maxY: -0.2 };
const bulat = (n) => Number(n.toFixed(DESIMAL));
const KM_PER_DER_Y = 110.57;

const masalah = [];
const catat = (id, tingkat, pesan, dalam = 0) => masalah.push({ id, tingkat, pesan, dalam });

function luasKm2(gelang) {
  let a = 0;
  for (let i = 0; i < gelang.length - 1; i++) a += gelang[i][0] * gelang[i + 1][1] - gelang[i + 1][0] * gelang[i][1];
  const lat = gelang.reduce((s, p) => s + p[1], 0) / gelang.length;
  return Math.abs(a / 2) * 111.32 * Math.cos((lat * Math.PI) / 180) * KM_PER_DER_Y;
}
function dalam(titik, gelang) {
  // ray casting
  let d = false;
  for (let i = 0, j = gelang.length - 1; i < gelang.length; j = i++) {
    const [xi, yi] = gelang[i];
    const [xj, yj] = gelang[j];
    if (yi > titik[1] !== yj > titik[1] && titik[0] < ((xj - xi) * (titik[1] - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

// jarak titik ke gelang dalam meter (pendekatan datar lokal)
function jarakKeGelangM(q, gelang) {
  const kx = 111320 * Math.cos((q[1] * Math.PI) / 180);
  const ky = 110570;
  let min = Infinity;
  for (let i = 0; i < gelang.length - 1; i++) {
    const ax = (gelang[i][0] - q[0]) * kx, ay = (gelang[i][1] - q[1]) * ky;
    const bx = (gelang[i + 1][0] - q[0]) * kx, by = (gelang[i + 1][1] - q[1]) * ky;
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < min) min = d;
  }
  return min;
}

const berkas = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".geojson")).sort();
const fitur = [];
const lihatId = new Map();
for (const f of berkas) {
  const idBerkas = f.replace(/\.geojson$/i, "");
  let d;
  try {
    d = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  } catch (e) {
    catat(idBerkas, "GALAT", `bukan JSON yang sah (${e.message})`);
    continue;
  }
  const namaCrs = d?.crs?.properties?.name ?? "";
  if (d?.crs && !/CRS84|WGS ?84|EPSG[:/]*4326/i.test(namaCrs)) catat(idBerkas, "GALAT", `sistem koordinat ${namaCrs} bukan WGS84 (CRS84/EPSG:4326)`);
  if (!/^\d{16}$/.test(idBerkas)) catat(idBerkas, "GALAT", "nama berkas bukan 16 digit idsubsls");
  const fs_ = Array.isArray(d?.features) ? d.features : [];
  if (fs_.length !== 1) catat(idBerkas, fs_.length === 0 ? "GALAT" : "PERINGATAN", `berisi ${fs_.length} fitur (diharapkan 1)`);
  for (const ft of fs_) {
    const p = ft.properties ?? {};
    const id = String(p.idsubsls ?? "");
    if (id !== idBerkas) catat(idBerkas, "GALAT", `properti idsubsls (${id || "kosong"}) tidak sama dengan nama berkas`);
    const g = ft.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) {
      catat(idBerkas, "GALAT", `geometri ${g?.type ?? "kosong"} (harus Polygon atau MultiPolygon)`);
      continue;
    }
    const poligon = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    const bagian = [];
    let titik = 0;
    let luas = 0;
    let luarKotak = false;
    for (const poli of poligon) {
      const gelangBaru = poli.map((gelang, gi) => {
        if (gelang.length < 4) catat(idBerkas, "GALAT", "gelang kurang dari 4 titik");
        const a = gelang[0];
        const b = gelang[gelang.length - 1];
        if (a[0] !== b[0] || a[1] !== b[1]) catat(idBerkas, "GALAT", "gelang tidak tertutup");
        for (const [x, y] of gelang) {
          if (x < KOTAK.minX || x > KOTAK.maxX || y < KOTAK.minY || y > KOTAK.maxY) luarKotak = true;
        }
        titik += gelang.length;
        if (gi === 0) luas += luasKm2(gelang);
        else luas -= luasKm2(gelang);
        return gelang.map(([x, y]) => [bulat(x), bulat(y)]);
      });
      bagian.push(gelangBaru);
    }
    if (luarKotak) catat(idBerkas, "GALAT", "ada titik di luar kotak Kab. Solok (periksa sistem koordinat atau bujur-lintang tertukar)");
    if (lihatId.has(id)) catat(idBerkas, "GALAT", `id ganda dengan berkas ${lihatId.get(id)}`);
    lihatId.set(id, f);
    if (luas < 0.0005) catat(idBerkas, "PERINGATAN", `luas sangat kecil (${(luas * 1e6).toFixed(0)} m2)`);
    const semua = bagian.flat(2);
    fitur.push({
      id,
      nm: String(p.nmsls ?? ""),
      kd: String(p.kdsubsls ?? ""),
      bb: [bulat(Math.min(...semua.map((q) => q[0]))), bulat(Math.min(...semua.map((q) => q[1]))), bulat(Math.max(...semua.map((q) => q[0]))), bulat(Math.max(...semua.map((q) => q[1])))],
      km2: Number(luas.toFixed(3)),
      titik,
      g: bagian,
    });
  }
}

// ---- tetangga rapat dan kandidat tumpang tindih
const kunciTitik = (q) => `${q[0]},${q[1]}`;
const milikTitik = new Map(); // titik -> set id
for (const ft of fitur) for (const poli of ft.g) for (const gelang of poli) for (const q of gelang) {
  const k = kunciTitik(q);
  let s = milikTitik.get(k);
  if (!s) milikTitik.set(k, (s = new Set()));
  s.add(ft.id);
}
const tetangga = new Map();
for (const s of milikTitik.values()) if (s.size > 1) {
  const l = [...s];
  for (const a of l) for (const b of l) if (a !== b) (tetangga.get(a) ?? tetangga.set(a, new Map()).get(a)).set(b, (tetangga.get(a).get(b) ?? 0) + 1);
}
const bersinggung = (a, b) => a.bb[0] <= b.bb[2] && a.bb[2] >= b.bb[0] && a.bb[1] <= b.bb[3] && a.bb[3] >= b.bb[1];
let kandidatTumpang = 0;
let sliver = 0;
const SLIVER_M = 5; // irisan yang titik terdalamnya kurang dari ini dianggap sliver tipis
for (let i = 0; i < fitur.length; i++) {
  for (let j = i + 1; j < fitur.length; j++) {
    const A = fitur[i];
    const B = fitur[j];
    if (!bersinggung(A, B)) continue;
    const hitung = (P, Q) => {
      const gelangQ = Q.g.map((p) => p[0]);
      let n = 0;
      let dalamMaks = 0;
      for (const q of P.g.flatMap((p) => p[0]).slice(0, 4000)) {
        if (milikTitik.get(kunciTitik(q))?.has(Q.id)) continue; // titik bersama = di tepi, bukan tumpang tindih
        const gq = gelangQ.find((g) => dalam(q, g));
        if (gq) {
          n++;
          dalamMaks = Math.max(dalamMaks, jarakKeGelangM(q, gq));
        }
      }
      return { n, dalamMaks };
    };
    const aDiB = hitung(A, B);
    const bDiA = hitung(B, A);
    if (aDiB.n + bDiA.n >= 1) {
      const dalamMaks = Math.max(aDiB.dalamMaks, bDiA.dalamMaks);
      const pesan = `tumpang tindih dengan ${B.id}: ${aDiB.n} titik ${A.id} di dalam ${B.id}, ${bDiA.n} titik ${B.id} di dalam ${A.id}; terdalam ${dalamMaks.toFixed(1)} m dari tepi`;
      // irisan tipis (beberapa meter) hanya ketidakrapian digitasi dan tidak mengganggu pemeriksaan titik KK; yang dalam perlu diperbaiki
      if (dalamMaks < SLIVER_M) {
        sliver++;
        catat(A.id, "INFO", pesan, dalamMaks);
      } else {
        kandidatTumpang++;
        catat(A.id, "PERINGATAN", pesan, dalamMaks);
      }
    }
  }
}

// ---- daftar acuan
let hilang = [];
let lebih = [];
if (DAFTAR && fs.existsSync(DAFTAR)) {
  const acuan = new Set(fs.readFileSync(DAFTAR, "utf8").split(/\r?\n/).map((s) => s.trim()).filter((s) => /^\d{16}$/.test(s)));
  hilang = [...acuan].filter((id) => !lihatId.has(id)).sort();
  lebih = fitur.map((f) => f.id).filter((id) => !acuan.has(id)).sort();
}

// ---- keluaran
fs.mkdirSync(KELUAR, { recursive: true });
const dibuat = new Date().toISOString();
const bungkus = (list) => JSON.stringify({ versi: dibuat.slice(0, 10).replace(/-/g, ""), dibuat, krs: "WGS84", desimal: DESIMAL, n: list.length, fitur: list.map(({ id, nm, kd, bb, g }) => ({ id, nm, kd, bb, g })) });
fs.writeFileSync(path.join(KELUAR, "batas-subsls.json"), bungkus(fitur));
const perKec = new Map();
for (const ft of fitur) {
  const kec = ft.id.slice(0, 7); // 13 03 040
  (perKec.get(kec) ?? perKec.set(kec, []).get(kec)).push(ft);
}
const versi = dibuat.slice(0, 10).replace(/-/g, "");
const manifest = { versi, dibuat, desimal: DESIMAL, semua: { berkas: "batas-subsls.json", ukuran: fs.statSync(path.join(KELUAR, "batas-subsls.json")).size, n: fitur.length }, kecamatan: {} };
for (const [kec, list] of perKec) {
  const nama = `batas-${kec}.json`;
  fs.writeFileSync(path.join(KELUAR, nama), bungkus(list));
  // kotak kecamatan (bb) dipakai aplikasi untuk memilih kecamatan mana yang dimuat di HP
  const bb = [Math.min(...list.map((f) => f.bb[0])), Math.min(...list.map((f) => f.bb[1])), Math.max(...list.map((f) => f.bb[2])), Math.max(...list.map((f) => f.bb[3]))];
  manifest.kecamatan[kec] = { berkas: nama, ukuran: fs.statSync(path.join(KELUAR, nama)).size, n: list.length, bb };
}
fs.writeFileSync(path.join(KELUAR, "manifest.json"), JSON.stringify(manifest, null, 1));

const asli = berkas.reduce((s, f) => s + fs.statSync(path.join(DIR, f)).size, 0);
const baris = [];
baris.push(`LAPORAN BATAS SUB SLS (${dibuat})`);
baris.push(`Berkas dibaca: ${berkas.length}; fitur sah: ${fitur.length}; kecamatan: ${perKec.size}`);
baris.push(`Ukuran asli ${(asli / 1e6).toFixed(2)} MB -> gabungan ${(manifest.semua.ukuran / 1e6).toFixed(2)} MB (${Math.round((manifest.semua.ukuran / Math.max(asli, 1)) * 100)}%), pembulatan ${DESIMAL} desimal, tanpa penyederhanaan garis`);
baris.push(`Luas total ${fitur.reduce((s, f) => s + f.km2, 0).toFixed(1)} km2; titik total ${fitur.reduce((s, f) => s + f.titik, 0)}; rata-rata ${Math.round(fitur.reduce((s, f) => s + f.titik, 0) / Math.max(fitur.length, 1))} titik per Sub SLS`);
const tanpaTetangga = fitur.filter((f) => !tetangga.has(f.id));
baris.push(`Sub SLS yang berbagi titik batas dengan tetangga: ${fitur.length - tanpaTetangga.length}; tanpa tetangga (terpencil atau batas tidak rapat): ${tanpaTetangga.length}`);
baris.push(`Tumpang tindih serius (terdalam >= ${SLIVER_M} m): ${kandidatTumpang}; sliver tipis (< ${SLIVER_M} m, tidak mengganggu): ${sliver}`);
if (DAFTAR) baris.push(`Terhadap daftar acuan: tidak punya berkas ${hilang.length}; berkas tidak ada di daftar ${lebih.length}`);
const galat = masalah.filter((m) => m.tingkat === "GALAT");
baris.push(`GALAT: ${galat.length}; PERINGATAN: ${masalah.filter((m) => m.tingkat === "PERINGATAN").length}; INFO: ${masalah.filter((m) => m.tingkat === "INFO").length}`);
const info = masalah.filter((m) => m.tingkat === "INFO");
const serius = masalah.filter((m) => m.tingkat === "PERINGATAN").sort((x, y) => y.dalam - x.dalam);
if (info.length) {
  const d = info.map((m) => m.dalam).sort((x, y) => x - y);
  baris.push(`Sliver tipis: ${info.length} pasangan; kedalaman median ${d[Math.floor(d.length / 2)].toFixed(1)} m, persentil 95 ${d[Math.floor(d.length * 0.95)].toFixed(1)} m, terdalam ${d[d.length - 1].toFixed(1)} m (tidak dirinci di sini; ada di laporan.txt)`);
}
for (const m of galat.slice(0, 100)) baris.push(`  [GALAT] ${m.id}: ${m.pesan}`);
for (const m of serius.slice(0, 40)) baris.push(`  [PERINGATAN] ${m.id}: ${m.pesan}`);
if (serius.length > 40) baris.push(`  ... ${serius.length - 40} peringatan serius lain (lihat laporan.txt)`);
const lengkap = [...baris, ...galat.slice(100).map((m) => `  [GALAT] ${m.id}: ${m.pesan}`), ...serius.slice(40).map((m) => `  [PERINGATAN] ${m.id}: ${m.pesan}`), ...info.map((m) => `  [INFO] ${m.id}: ${m.pesan}`)];
if (hilang.length) baris.push(`Tidak punya berkas (${hilang.length}): ${hilang.slice(0, 50).join(", ")}${hilang.length > 50 ? ", ..." : ""}`);
if (lebih.length) baris.push(`Ada berkas tetapi tidak di daftar (${lebih.length}): ${lebih.slice(0, 50).join(", ")}${lebih.length > 50 ? ", ..." : ""}`);
const teks = baris.join("\n");
fs.writeFileSync(path.join(KELUAR, "laporan.txt"), lengkap.join("\n") + "\n");
console.log(teks);
