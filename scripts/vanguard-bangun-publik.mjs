// scripts/vanguard-bangun-publik.mjs
//
// (1 Nov 2026) VANGUARD V5b: membangun lib/vanguard/kasus/publik.json = bahan soal TANPA bagian rahasia (kunci, jebakan, alternatif, nol, petunjuk, langkah,
// pembahasan, rujukan). Berkas inilah satu-satunya data kasus yang boleh dimuat ke perangkat petugas (Mode Uji). Jalankan setelah mengubah berkas level-*.json:
//   node scripts/vanguard-bangun-publik.mjs
// Kasus ber-bidang "ditangguhkan" tidak ikut ke publik.json; kodenya ditulis ke ditangguhkan.json.
// Tes lib/__tests__/vanguardPublik.test.ts gagal bila publik.json tertinggal dari level-*.json.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "vanguard", "kasus");
const LEVEL = ["A", "B", "C", "D", "E", "G", "H"];
const PUBLIK = ["kode", "level", "judul", "cerita", "info", "iv", "meta", "blok", "lengkap", "bebas", "nama"];

const semua = LEVEL.flatMap((l) => JSON.parse(fs.readFileSync(path.join(dir, `level-${l}.json`), "utf8")));
const aktif = semua.filter((k) => !k.ditangguhkan);
const tangguh = semua.filter((k) => !!k.ditangguhkan).map((k) => k.kode);
const publik = aktif.map((k) => Object.fromEntries(PUBLIK.filter((f) => k[f] !== undefined).map((f) => [f, k[f]])));
fs.writeFileSync(path.join(dir, "publik.json"), JSON.stringify(publik) + "\n");
fs.writeFileSync(path.join(dir, "ditangguhkan.json"), JSON.stringify(tangguh) + "\n"); // hanya kode (tanpa alasan/kunci): dipakai dasbor untuk mengabaikan rekaman lama
console.log(`ditangguhkan.json: ${tangguh.length} kode ${tangguh.join(",")}`);
console.log(`publik.json: ${publik.length} kasus, ${fs.statSync(path.join(dir, "publik.json")).size} byte`);
