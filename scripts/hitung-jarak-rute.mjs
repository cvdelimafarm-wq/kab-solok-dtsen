// Hitung jarak RUTE JALAN (OSRM) dari rumah tiap petugas ke tiap Sub SLS wilayah timnya,
// lalu simpan ke tabel bencana_jarak_rute.
// (9 Okt 2026) -- permintaan user: "kenapa ini pakai garis lurus lagi? harusnya pakai jarak rute jalan".
//
// Cara pakai (dari folder repo, PowerShell):
//   node scripts/hitung-jarak-rute.mjs --dry-run     # hitung & tampilkan ringkasan, TIDAK menulis ke DB
//   node scripts/hitung-jarak-rute.mjs               # hitung & simpan (upsert; tidak ada yang dihapus)
//   node scripts/hitung-jarak-rute.mjs --petugas=123 # hanya satu petugas (id bencana_petugas)
//
// Butuh .env.local di folder repo berisi NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY.
// Server OSRM: default https://router.project-osrm.org (publik, ada batas wajar pemakaian -> script memberi jeda).
// Bisa diganti server sendiri: $env:OSRM_URL="http://localhost:5000"
//
// PRIVASI: koordinat rumah petugas ikut dikirim ke server OSRM. Untuk server publik koordinat
// DIBULATKAN 4 desimal (~11 m) supaya tidak persis di titik rumah. Pakai OSRM_URL sendiri bila ingin nol kebocoran.

import { readFileSync, existsSync } from "node:fs";

const DESIMAL = 4;
const MAKS_KOORDINAT_PER_PERMINTAAN = 90; // batas server demo OSRM ~100 koordinat
const JEDA_MS = 1200;

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const SATU = (args.find((a) => a.startsWith("--petugas=")) ?? "").split("=")[1];
const OSRM = (process.env.OSRM_URL || "https://router.project-osrm.org").replace(/\/+$/, "");

function muatEnv() {
  // (9 Okt 2026) nilai di .env.local MENGGANTI variabel lama di sesi PowerShell (kunci usang di sesi memicu 401),
  // dan nilai dirapikan: spasi/kutip/komentar di ujung dibuang.
  for (const f of [".env", ".env.local"]) {
    if (!existsSync(f)) continue;
    for (const baris of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = baris.match(/^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=\s*(.*)$/);
      if (!m || baris.trim().startsWith("#")) continue;
      let v = m[2].trim();
      const kutip = v.match(/^(["'])(.*?)\1/);
      v = kutip ? kutip[2] : v.replace(/\s+#.*$/, "").trim();
      v = v.replace(/^<+/, "").replace(/>+$/, "").trim(); // tanda < > sisa dari contoh/placeholder ikut tersalin
      process.env[m[1]] = v;
    }
  }
}

const bulat = (x) => Number(x.toFixed(DESIMAL));
const rad = (d) => (d * Math.PI) / 180;
export function haversineKm(la1, lo1, la2, lo2) {
  const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

// Satu rumah -> banyak titik tujuan. Mengembalikan [{ km, menit } | null] sejajar dengan `tujuan`.
export async function rutePerRumah(rumah, tujuan, fetchFn = fetch) {
  const hasil = [];
  for (let i = 0; i < tujuan.length; i += MAKS_KOORDINAT_PER_PERMINTAAN - 1) {
    const potong = tujuan.slice(i, i + MAKS_KOORDINAT_PER_PERMINTAAN - 1);
    const koord = [rumah, ...potong].map((p) => `${bulat(p.lon)},${bulat(p.lat)}`).join(";");
    const url = `${OSRM}/table/v1/driving/${koord}?sources=0&annotations=distance,duration`;
    let json = null;
    for (let coba = 1; coba <= 3; coba++) {
      const r = await fetchFn(url, { headers: { "User-Agent": "sigap-bps-solok-jarak-rute/1.0" } });
      if (r.ok) { json = await r.json(); break; }
      if (r.status === 429 || r.status >= 500) { await tidur(JEDA_MS * coba * 2); continue; }
      throw new Error(`OSRM ${r.status} ${r.statusText} -- hentikan (jangan dipaksa).`);
    }
    if (!json || json.code !== "Ok") throw new Error(`OSRM gagal: ${json?.code ?? "tanpa respons"} ${json?.message ?? ""}`);
    const jarak = json.distances?.[0] ?? [];
    const durasi = json.durations?.[0] ?? [];
    for (let j = 0; j < potong.length; j++) {
      const m = jarak?.[j + 1];
      const d = durasi?.[j + 1];
      hasil.push(typeof m === "number" ? { km: m / 1000, menit: typeof d === "number" ? d / 60 : null } : null);
    }
  }
  return hasil;
}

async function main() {
  muatEnv();
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const kunci = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !kunci) { console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak ditemukan di .env.local"); process.exitCode = 1; return; }
  // Diagnosa aman (kunci TIDAK dicetak): bantu cari penyebab 401.
  const ref = (() => { try { return new URL(base).hostname.split(".")[0]; } catch { return "URL tidak valid"; } })();
  console.log(`Supabase proyek: ${ref} | panjang kunci: ${kunci.length} | awalan: ${kunci.slice(0, 6)}...`);
  if (ref !== "nlwkpakyfprugqwklxiu") console.warn("PERINGATAN: proyek bukan dtsen-usulan-solok (nlwkpakyfprugqwklxiu).");
  const H = { apikey: kunci, Authorization: `Bearer ${kunci}`, "Content-Type": "application/json" };

  async function ambil(path) {
    const semua = [];
    for (let off = 0; ; off += 1000) {
      const r = await fetch(`${base}/rest/v1/${path}`, { headers: { ...H, Range: `${off}-${off + 999}`, "Range-Unit": "items" } });
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
      const rows = await r.json();
      semua.push(...rows);
      if (rows.length < 1000) break;
    }
    return semua;
  }

  const petugas = await ambil("bencana_petugas?select=id,nama,peran,atasan_id,lat,lng,lokasi_status,aktif&aktif=eq.true&lokasi_status=eq.riil&lat=not.is.null&lng=not.is.null");
  const alokasi = await ambil("bencana_alokasi_subsls?select=idsubsls,ppl_id,pml_id");
  const koordRows = await ambil("bencana_subsls_koordinat?select=idsubsls,lat,lon&lat=not.is.null&lon=not.is.null");
  const koord = new Map(koordRows.map((k) => [k.idsubsls, k]));

  // Wilayah tim sebuah petugas = Sub SLS dengan pml_id tim-nya + Sub SLS yang dipegangnya langsung.
  // (sama dengan logika API konfirmasi)
  const timDari = (p) => (p.peran === "pml" ? p.id : p.atasan_id);
  const daftar = petugas.filter((p) => (p.peran === "ppl" || p.peran === "pml") && (!SATU || String(p.id) === SATU));

  const upserts = [];
  const banding = [];
  let tanpaKoord = 0, gagal = 0, nPetugas = 0;

  for (const p of daftar) {
    const tim = timDari(p);
    const ids = new Set();
    for (const a of alokasi) if ((tim != null && a.pml_id === tim) || a.ppl_id === p.id) ids.add(a.idsubsls);
    const tujuan = [];
    for (const id of ids) {
      const k = koord.get(id);
      if (!k) { tanpaKoord++; continue; }
      tujuan.push({ idsubsls: id, lat: k.lat, lon: k.lon });
    }
    if (!tujuan.length) continue;
    nPetugas++;
    let hasil;
    try {
      hasil = await rutePerRumah({ lat: p.lat, lon: p.lng }, tujuan);
    } catch (e) {
      console.error(`Petugas ${p.id} (${p.nama}): ${e.message}`);
      if (/403|407/.test(e.message)) { console.error("Diblokir proxy/kebijakan jaringan -- berhenti."); process.exitCode = 2; return; }
      gagal += tujuan.length;
      continue;
    }
    tujuan.forEach((t, i) => {
      const h = hasil[i];
      const lurus = haversineKm(p.lat, p.lng, t.lat, t.lon);
      if (!h) { gagal++; return; }
      upserts.push({ petugas_id: p.id, idsubsls: t.idsubsls, jarak_km: Math.round(h.km * 100) / 100, durasi_menit: h.menit == null ? null : Math.round(h.menit * 10) / 10, sumber: "osrm_driving", dihitung_at: new Date().toISOString() });
      banding.push({ lurus, perkiraan: lurus * 1.35, rute: h.km });
    });
    process.stdout.write(`\r${nPetugas}/${daftar.length} petugas diproses, ${upserts.length} pasangan...`);
    await tidur(JEDA_MS);
  }
  console.log("");

  if (banding.length) {
    const rata = (f) => banding.reduce((s, b) => s + f(b), 0) / banding.length;
    const rasio = banding.map((b) => b.rute / Math.max(b.lurus, 0.05)).sort((a, b) => a - b);
    const med = rasio[Math.floor(rasio.length / 2)];
    console.log(`Pasangan terhitung : ${banding.length}`);
    console.log(`Rata-rata garis lurus      : ${rata((b) => b.lurus).toFixed(2)} km`);
    console.log(`Rata-rata lurus x 1,35     : ${rata((b) => b.perkiraan).toFixed(2)} km  (cara lama)`);
    console.log(`Rata-rata rute jalan nyata : ${rata((b) => b.rute).toFixed(2)} km`);
    console.log(`Rasio rute/lurus: median ${med.toFixed(2)}, min ${rasio[0].toFixed(2)}, maks ${rasio[rasio.length - 1].toFixed(2)}`);
  }
  console.log(`Tanpa koordinat Sub SLS: ${tanpaKoord} | gagal/tidak ada rute: ${gagal}`);

  if (DRY) { console.log("--dry-run: tidak ada yang ditulis ke database."); return; }
  for (let i = 0; i < upserts.length; i += 500) {
    const r = await fetch(`${base}/rest/v1/bencana_jarak_rute?on_conflict=petugas_id,idsubsls`, {
      method: "POST",
      headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(upserts.slice(i, i + 500)),
    });
    if (!r.ok) throw new Error(`Simpan gagal ${r.status}: ${await r.text()}`);
  }
  console.log(`Tersimpan: ${upserts.length} baris ke bencana_jarak_rute.`);
}

if (/hitung-jarak-rute\.mjs$/i.test(process.argv[1] || "")) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
