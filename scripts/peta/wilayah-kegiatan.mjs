// scripts/peta/wilayah-kegiatan.mjs
//
// (8 Nov 2026, E1) Wilayah potong peta jalan per KEGIATAN (survei model 1: alokasi per sub SLS), dihitung dari tabel sigap_alokasi_wilayah (alokasi aktif)
// dan poligon batas sub SLS di public/peta/batas/. Tiga jenis berkas per kegiatan; kunci angka sendiri (tidak bentrok dengan kunci lama: PML bencana <= 460,
// SPDT 9.100.000-9.300.000) -- rumus HARUS sama dengan lib/petaKegiatan.ts (diuji silang di lib/__tests__/petaKegiatan.test.ts):
//   kunci = 100.000.000.000 + kegiatan_id x 10.000.000 + peran x 1.000.000 + akun      peran: 1 = PPL, 2 = PML, 3 = semua (akun 0)
//   PPL   : hanya sub SLS milik PPL itu
//   PML   : sub SLS semua PPL-nya
//   semua : seluruh alokasi kegiatan (Korwil / Supervisor)
// Wilayah = sel grid 0,01 derajat yang bersentuhan dengan poligon sub SLS, diperlebar MARGIN_DERAJAT (sekitar 500 m) di sekeliling batas. Bagian murni tanpa jaringan.

import fs from "node:fs";
import path from "node:path";
import { keLari, sidik, UKURAN_SEL } from "./wilayah.mjs";

export const DASAR_KUNCI_KEGIATAN = 100_000_000_000;
export const KODE_PERAN = { ppl: 1, pml: 2, semua: 3 };
export const MARGIN_DERAJAT = 0.0045; // sekitar 500 m di khatulistiwa
const LANGKAH_RAPAT = 0.0025; // jarak titik contoh sepanjang batas (lebih kecil dari sel dan dari margin)

/** Kunci numerik berkas peta kegiatan; null bila di luar jangkauan (kegiatan >= 10.000, akun >= 1.000.000, peran tak dikenal). */
export function kunciPetaKegiatan(kegiatanId, peran, akunId = 0) {
  const kode = KODE_PERAN[peran];
  const ok = (n, maks) => Number.isInteger(n) && n >= 0 && n < maks;
  if (!kode || !ok(kegiatanId, 10_000) || kegiatanId < 1) return null;
  const akun = peran === "semua" ? 0 : akunId;
  if (!ok(akun, 1_000_000) || (peran !== "semua" && akun < 1)) return null;
  return DASAR_KUNCI_KEGIATAN + kegiatanId * 10_000_000 + kode * 1_000_000 + akun;
}

/** Sidik himpunan sub SLS (urutan dan duplikat tidak berpengaruh). Dibandingkan dengan hash di manifest untuk tahu berkas peta sudah usang. */
export function sidikAlokasi(idsubsls) {
  return sidik([...new Set(idsubsls)].sort().join(","));
}

// ------------------------------------------------------------------ poligon -> sel
const sel = (x, y) => `${Math.floor(x / UKURAN_SEL)},${Math.floor(y / UKURAN_SEL)}`;

function titikDalamPoligon(x, y, poligon) {
  let dalam = false;
  for (const cincin of poligon) {
    for (let i = 0, j = cincin.length - 1; i < cincin.length; j = i++) {
      const [xi, yi] = cincin[i];
      const [xj, yj] = cincin[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dalam = !dalam;
    }
  }
  return dalam;
}

/**
 * Sel yang menyentuh MultiPolygon (g: poligon > cincin > [bujur, lintang]) diperlebar `margin` derajat.
 *  - batas (termasuk lubang): titik contoh rapat sepanjang cincin, tiap titik menandai semua sel dalam kotak +-margin;
 *  - bagian dalam: sel yang titik tengahnya di dalam poligon (sel tanpa titik batas dan beririsan dengan poligon pasti seluruhnya di dalam).
 */
export function selDariMultiPoligon(g, margin = MARGIN_DERAJAT) {
  const hasil = new Set();
  const tandai = (x, y) => {
    const x0 = Math.floor((x - margin) / UKURAN_SEL);
    const x1 = Math.floor((x + margin) / UKURAN_SEL);
    const y0 = Math.floor((y - margin) / UKURAN_SEL);
    const y1 = Math.floor((y + margin) / UKURAN_SEL);
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) hasil.add(`${xx},${yy}`);
  };
  for (const poligon of g) {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const cincin of poligon) {
      for (let i = 0; i < cincin.length; i++) {
        const [x, y] = cincin[i];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
        tandai(x, y);
        if (i === 0) continue;
        const [px, py] = cincin[i - 1];
        const bagi = Math.ceil(Math.hypot(x - px, y - py) / LANGKAH_RAPAT);
        for (let k = 1; k < bagi; k++) tandai(px + ((x - px) * k) / bagi, py + ((y - py) * k) / bagi);
      }
    }
    if (!Number.isFinite(w)) continue;
    const x0 = Math.floor(w / UKURAN_SEL), x1 = Math.floor(e / UKURAN_SEL);
    const y0 = Math.floor(s / UKURAN_SEL), y1 = Math.floor(n / UKURAN_SEL);
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const k = `${xx},${yy}`;
        if (hasil.has(k)) continue;
        if (titikDalamPoligon((xx + 0.5) * UKURAN_SEL, (yy + 0.5) * UKURAN_SEL, poligon)) hasil.add(k);
      }
    }
  }
  return hasil;
}

// ------------------------------------------------------------------ pengelompokan
/**
 * alokasi: [{idsubsls, ppl_akun_id, pml_akun_id, ppl_nama?, pml_nama?}], fiturPerId: Map<idsubsls, MultiPolygon g>.
 * -> { "<kunci>": { nama, kk (jumlah sub SLS), satuan, peran, akun, hash, subsls (jumlah), tanpaBatas [idsubsls], lari } }  (kelompok tanpa satu pun batas dibuang)
 */
export function kelompokkanKegiatan(kegiatanId, alokasi, fiturPerId, margin = MARGIN_DERAJAT) {
  const grup = new Map(); // kunci -> { nama, peran, akun, ids:Set }
  const tambah = (peran, akun, nama, id) => {
    const kunci = kunciPetaKegiatan(kegiatanId, peran, akun);
    if (kunci == null) return;
    let g = grup.get(kunci);
    if (!g) grup.set(kunci, (g = { nama, peran, akun, ids: new Set() }));
    g.ids.add(id);
  };
  for (const a of alokasi) {
    if (!a || typeof a.idsubsls !== "string") continue;
    tambah("semua", 0, `Kegiatan ${kegiatanId}: semua wilayah (Korwil/Supervisor)`, a.idsubsls);
    if (a.ppl_akun_id != null) tambah("ppl", a.ppl_akun_id, `Kegiatan ${kegiatanId}: PPL ${a.ppl_nama ?? a.ppl_akun_id}`, a.idsubsls);
    if (a.pml_akun_id != null) tambah("pml", a.pml_akun_id, `Kegiatan ${kegiatanId}: PML ${a.pml_nama ?? a.pml_akun_id}`, a.idsubsls);
  }
  const sub = new Map(); // cache sel per sub SLS
  const selSub = (id) => {
    if (!sub.has(id)) {
      const g = fiturPerId.get(id);
      sub.set(id, g ? selDariMultiPoligon(g, margin) : null);
    }
    return sub.get(id);
  };
  const hasil = {};
  for (const [kunci, g] of [...grup].sort((a, b) => a[0] - b[0])) {
    const gabung = new Set();
    const tanpaBatas = [];
    for (const id of [...g.ids].sort()) {
      const s = selSub(id);
      if (!s) tanpaBatas.push(id);
      else for (const k of s) gabung.add(k);
    }
    if (gabung.size === 0) continue;
    hasil[String(kunci)] = {
      nama: g.nama,
      kk: g.ids.size,
      satuan: "sub SLS",
      peran: g.peran,
      akun: g.akun,
      hash: sidikAlokasi([...g.ids]),
      subsls: g.ids.size,
      tanpaBatas,
      lari: keLari(gabung),
    };
  }
  return hasil;
}

// ------------------------------------------------------------------ data (jaringan / berkas)
/** Alokasi aktif satu kegiatan (+ nama petugas) lewat klien supabase-js service role. */
export async function ambilAlokasiKegiatan(sb, kegiatanId) {
  const baris = [];
  for (let dari = 0; ; dari += 1000) {
    const { data, error } = await sb
      .from("sigap_alokasi_wilayah")
      .select("idsubsls, ppl_akun_id, pml_akun_id")
      .eq("kegiatan_id", kegiatanId)
      .is("nonaktif_at", null)
      .order("id")
      .range(dari, dari + 999);
    if (error) throw new Error(`sigap_alokasi_wilayah: ${error.message}`);
    baris.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const akun = [...new Set(baris.flatMap((b) => [b.ppl_akun_id, b.pml_akun_id]).filter((x) => x != null))];
  const nama = new Map();
  for (let i = 0; i < akun.length; i += 200) {
    const { data, error } = await sb.from("sigap_akun").select("id, nama").in("id", akun.slice(i, i + 200));
    if (error) throw new Error(`sigap_akun: ${error.message}`);
    for (const a of data ?? []) nama.set(Number(a.id), String(a.nama));
  }
  return baris.map((b) => ({ ...b, ppl_nama: b.ppl_akun_id != null ? nama.get(b.ppl_akun_id) ?? null : null, pml_nama: b.pml_akun_id != null ? nama.get(b.pml_akun_id) ?? null : null }));
}

/** Poligon sub SLS dari berkas batas lokal (public/peta/batas/batas-<7 digit>.json). Sub SLS tanpa poligon tidak ada di hasil. */
export function bacaBatasLokal(folder, idsubsls) {
  const peta = new Map();
  const perKec = new Map();
  for (const id of new Set(idsubsls)) {
    const kec = id.slice(0, 7);
    if (!perKec.has(kec)) perKec.set(kec, new Set());
    perKec.get(kec).add(id);
  }
  for (const [kec, ids] of perKec) {
    let isi;
    try {
      isi = JSON.parse(fs.readFileSync(path.join(folder, `batas-${kec}.json`), "utf8"));
    } catch {
      continue; // kecamatan tanpa berkas batas
    }
    for (const f of Array.isArray(isi?.fitur) ? isi.fitur : []) if (f && ids.has(f.id) && Array.isArray(f.g)) peta.set(f.id, f.g);
  }
  return peta;
}
