// scripts/peta/wilayah-spdt.mjs
//
// (21 Okt 2026) Wilayah potong peta untuk Lembar Pendataan SPDT NTP, dihitung LANGSUNG dari tabel sigap_spdt_kk (selalu mengikuti data terbaru,
// tanpa berkas JSON tambahan). Tiga jenis berkas, kunci angka sendiri supaya tidak bentrok dengan id tim PML bencana (lihat lib/petaDasar.ts):
//   PPL        9.100.000 + ppl_akun_id   (hanya KK milik PPL itu)
//   PML        9.200.000 + pml_akun_id   (KK semua PPL-nya)
//   Supervisor 9.300.000                 (seluruh wilayah)
// Bagian murni (kelompokkanSpdt) tanpa jaringan; ambilKkSpdt memakai klien supabase-js (service role) yang sudah dipakai potong-peta.mjs.

import { keLari, UKURAN_SEL } from "./wilayah.mjs";

export const KUNCI_SPDT = { ppl: 9_100_000, pml: 9_200_000, semua: 9_300_000 };

const sel = (k) => `${Math.floor(k.lng / UKURAN_SEL)},${Math.floor(k.lat / UKURAN_SEL)}`;
const sahih = (k) => Number.isFinite(k.lat) && Number.isFinite(k.lng) && k.lat != null && k.lng != null;

/** baris KK [{ppl_akun_id, ppl_nama, pml_akun_id, pml_nama, lat, lng}] -> { "<kunci>": { nama, kk, lari } } */
export function kelompokkanSpdt(baris) {
  const kelompok = new Map(); // kunci -> { nama, kk, sel:Set }
  const tambah = (kunci, nama, k) => {
    let g = kelompok.get(kunci);
    if (!g) kelompok.set(kunci, (g = { nama, kk: 0, sel: new Set() }));
    g.kk++;
    g.sel.add(sel(k));
  };
  for (const k of baris) {
    if (!sahih(k)) continue;
    if (k.ppl_akun_id != null) tambah(String(KUNCI_SPDT.ppl + k.ppl_akun_id), `SPDT PPL ${k.ppl_nama ?? k.ppl_akun_id}`, k);
    if (k.pml_akun_id != null) tambah(String(KUNCI_SPDT.pml + k.pml_akun_id), `SPDT PML ${k.pml_nama ?? k.pml_akun_id}`, k);
    tambah(String(KUNCI_SPDT.semua), "SPDT semua wilayah (supervisor)", k);
  }
  const hasil = {};
  for (const [kunci, g] of [...kelompok].sort((a, b) => Number(a[0]) - Number(b[0]))) hasil[kunci] = { nama: g.nama, kk: g.kk, lari: keLari(g.sel) };
  return hasil;
}

/** Ambil seluruh KK SPDT berkoordinat (bertahap 1000 baris). */
export async function ambilKkSpdt(sb) {
  const semua = [];
  for (let dari = 0; ; dari += 1000) {
    const { data, error } = await sb.from("sigap_spdt_kk").select("ppl_akun_id, ppl_nama, pml_akun_id, pml_nama, lat, lng").not("lat", "is", null).not("lng", "is", null).order("id").range(dari, dari + 999);
    if (error) throw new Error(`sigap_spdt_kk: ${error.message}`);
    semua.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return semua;
}
