// lib/portal/batasServer.ts  (hanya server)
//
// (7 Nov 2026) Daftar sub SLS yang punya polygon batas, dibaca dari berkas statis public/peta/batas (manifest.json + batas-<kec>.json) yang sama dengan
// yang dibaca peta di HP. Untuk status "batas (shapefile)" pada Master > Wilayah dan Peta. Tahan galat: berkas tidak terbaca -> dibaca:false.
// Hasil disimpan di memori proses 10 menit (berkas hanya berubah saat deploy).

import { promises as fs } from "node:fs";
import path from "node:path";
import { bacaBerkasBatas, bacaManifestBatas } from "@/lib/batasSubsls";
import type { RingkasBatas } from "@/lib/masterWilayah";

export type HasilBatas = { ids: Set<string>; ringkas: RingkasBatas };

const TTL_MS = 10 * 60_000;
let simpan: { at: number; hasil: HasilBatas } | null = null;

const KOSONG: RingkasBatas = { versi: null, dibuat: null, dibaca: false, kecamatan: 0, poligon: 0 };

export function folderBatas(): string {
  return path.join(process.cwd(), "public", "peta", "batas");
}

export async function muatIdBatas(folder = folderBatas(), sekarang = Date.now()): Promise<HasilBatas | null> {
  if (simpan && folder === folderBatas() && sekarang - simpan.at < TTL_MS) return simpan.hasil;
  try {
    const manifest = bacaManifestBatas(JSON.parse(await fs.readFile(path.join(folder, "manifest.json"), "utf8")));
    if (!manifest) return null;
    const ids = new Set<string>();
    let terbaca = 0;
    for (const kec of Object.values(manifest.kecamatan)) {
      try {
        const berkas = bacaBerkasBatas(JSON.parse(await fs.readFile(path.join(folder, kec.berkas), "utf8")));
        if (!berkas) continue;
        terbaca += 1;
        for (const f of berkas.fitur) ids.add(f.id);
      } catch {
        // satu berkas kecamatan rusak: lewati, sub SLS-nya tampil "tanpa batas"
      }
    }
    if (terbaca === 0) return null;
    const hasil: HasilBatas = { ids, ringkas: { versi: manifest.versi, dibuat: manifest.dibuat || null, dibaca: true, kecamatan: terbaca, poligon: ids.size } };
    if (folder === folderBatas()) simpan = { at: sekarang, hasil };
    return hasil;
  } catch {
    return null;
  }
}

export const RINGKAS_BATAS_KOSONG = KOSONG;
