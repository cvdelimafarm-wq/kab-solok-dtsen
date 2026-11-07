// lib/batasBerkas.ts  (dipakai di browser; murni terhadap DOM sehingga bisa diuji di Node)
//
// (7 Nov 2026, tahap C2) Dari berkas yang dipilih pengguna (zip shapefile, .shp+.dbf+.prj terpisah, GeoJSON, atau zip berisi banyak GeoJSON seperti
// kebiasaan "satu berkas per sub SLS") menjadi fitur WGS84 mentah + daftar kolom untuk dipilih. Pemeriksaan isi ada di lib/batasUnggah.ts.

import { bacaDbf, bacaPrj, bacaShp, dariGeoJson, keWgs84, tebakTanpaPrj, type FiturMentah, type SistemKoordinat } from "./batasUnggah";

export type BerkasMasuk = { nama: string; data: ArrayBuffer };
export type HasilBaca = {
  jenis: "shapefile" | "geojson";
  namaAsal: string;
  kolom: string[];
  fitur: FiturMentah[];
  sistem: string;
  catatan: string[];
  galat: string[];
};

export const MAKS_BERKAS_ZIP = 6000;
export const MAKS_BYTE_ZIP = 150 * 1024 * 1024;

const stem = (n: string) => n.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
const akhiran = (n: string) => (/\.([^.\\/]+)$/.exec(n)?.[1] ?? "").toLowerCase();

/** Buka zip menjadi berkas-berkas di dalamnya (folder dan sampah macOS dilewati). Dibatasi jumlah dan ukuran supaya zip "bom" tidak menghabiskan memori. */
export async function bukaZip(data: ArrayBuffer): Promise<BerkasMasuk[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(data);
  const entri = Object.values(zip.files).filter((f) => !f.dir && !/(^|\/)(__MACOSX|\.DS_Store)/i.test(f.name));
  if (entri.length > MAKS_BERKAS_ZIP) throw new Error(`Zip berisi terlalu banyak berkas (${entri.length}; batas ${MAKS_BERKAS_ZIP}).`);
  const hasil: BerkasMasuk[] = [];
  let total = 0;
  for (const f of entri) {
    const a = akhiran(f.name);
    if (!["shp", "dbf", "prj", "geojson", "json"].includes(a)) continue; // hanya yang dipakai; sisanya (.shx, .cpg, .xml) diabaikan
    const data2 = await f.async("arraybuffer");
    total += data2.byteLength;
    if (total > MAKS_BYTE_ZIP) throw new Error("Isi zip terlalu besar (lebih dari 150 MB setelah dibuka).");
    hasil.push({ nama: f.name, data: data2 });
  }
  return hasil;
}

const teks = (b: ArrayBuffer) => new TextDecoder("utf-8").decode(b).replace(/^﻿/, "");

export async function bacaBerkasUnggahan(masuk: readonly BerkasMasuk[]): Promise<HasilBaca> {
  const catatan: string[] = [];
  const galat: string[] = [];
  const namaAsal = masuk.map((b) => b.nama).join(", ");
  const kosong = (jenis: HasilBaca["jenis"], pesan: string): HasilBaca => ({ jenis, namaAsal, kolom: [], fitur: [], sistem: "", catatan, galat: [pesan, ...galat] });

  let berkas: BerkasMasuk[] = [];
  try {
    for (const b of masuk) {
      if (akhiran(b.nama) === "zip") berkas.push(...(await bukaZip(b.data)));
      else berkas.push(b);
    }
  } catch (e) {
    return kosong("shapefile", e instanceof Error ? e.message : "Zip tidak bisa dibuka.");
  }
  berkas = berkas.filter((b) => ["shp", "dbf", "prj", "geojson", "json"].includes(akhiran(b.nama)));

  const daftarShp = berkas.filter((b) => akhiran(b.nama) === "shp");
  if (daftarShp.length > 0) {
    const shp = daftarShp.slice().sort((a, b) => b.data.byteLength - a.data.byteLength)[0];
    if (daftarShp.length > 1) catatan.push(`Ada ${daftarShp.length} berkas .shp; yang terbesar dipakai (${shp.nama}).`);
    const s0 = stem(shp.nama).toLowerCase();
    const dbf = berkas.find((b) => akhiran(b.nama) === "dbf" && stem(b.nama).toLowerCase() === s0);
    const prj = berkas.find((b) => akhiran(b.nama) === "prj" && stem(b.nama).toLowerCase() === s0);
    if (!dbf) return kosong("shapefile", `Berkas .dbf untuk ${stem(shp.nama)} tidak ada (atribut kode sub SLS ada di .dbf).`);
    let poligon: ReturnType<typeof bacaShp>;
    let tabel: ReturnType<typeof bacaDbf>;
    try {
      poligon = bacaShp(shp.data);
      tabel = bacaDbf(dbf.data);
    } catch (e) {
      return kosong("shapefile", e instanceof Error ? e.message : "Shapefile tidak terbaca.");
    }
    if (poligon.length !== tabel.baris.length) return kosong("shapefile", `Jumlah bentuk di .shp (${poligon.length}) tidak sama dengan jumlah baris di .dbf (${tabel.baris.length}).`);
    let sk: SistemKoordinat;
    if (prj) {
      sk = bacaPrj(teks(prj.data));
      if (sk.jenis === "tak_dikenal") return kosong("shapefile", `Sistem koordinat (.prj) tidak didukung: ${sk.catatan}. Ekspor ulang ke WGS84 atau UTM.`);
      if (sk.jenis === "geografis" && !sk.wgs84) catatan.push(sk.catatan.charAt(0).toUpperCase() + sk.catatan.slice(1) + ".");
      else if (sk.jenis === "tm" && !sk.wgs84) catatan.push(sk.catatan.charAt(0).toUpperCase() + sk.catatan.slice(1) + ".");
    } else {
      const tebak = tebakTanpaPrj(poligon.flatMap((p) => p ?? []));
      if (!tebak) return kosong("shapefile", "Berkas .prj tidak ada dan angka koordinat bukan bujur-lintang; sertakan .prj.");
      sk = tebak;
      catatan.push("Berkas .prj tidak ada; koordinat dianggap bujur-lintang WGS84.");
    }
    const fitur: FiturMentah[] = [];
    let kosongBentuk = 0;
    let terhapus = 0;
    for (let i = 0; i < poligon.length; i++) {
      const atribut = tabel.baris[i];
      if (!atribut) {
        terhapus += 1;
        continue;
      }
      const g = poligon[i];
      if (!g) {
        kosongBentuk += 1;
        continue;
      }
      fitur.push({ atribut, g: keWgs84(g, sk) });
    }
    if (kosongBentuk) catatan.push(`${kosongBentuk} baris tanpa bentuk dilewati.`);
    if (terhapus) catatan.push(`${terhapus} baris bertanda hapus di .dbf dilewati.`);
    return { jenis: "shapefile", namaAsal, kolom: tabel.kolom, fitur, sistem: sk.catatan, catatan, galat };
  }

  const daftarJson = berkas.filter((b) => ["geojson", "json"].includes(akhiran(b.nama)));
  if (daftarJson.length > 0) {
    const fitur: FiturMentah[] = [];
    const kolom: string[] = [];
    for (const b of daftarJson) {
      let mentah: unknown;
      try {
        mentah = JSON.parse(teks(b.data));
      } catch {
        galat.push(`${b.nama}: bukan JSON yang sah.`);
        continue;
      }
      const h = dariGeoJson(mentah, b.nama);
      for (const m of h.masalah) galat.push(daftarJson.length > 1 ? `${b.nama}: ${m}` : m);
      for (const f of h.fitur) {
        fitur.push(f);
        for (const k of Object.keys(f.atribut)) if (!kolom.includes(k)) kolom.push(k);
      }
    }
    if (fitur.length === 0) return { jenis: "geojson", namaAsal, kolom, fitur, sistem: "WGS84", catatan, galat: galat.length ? galat : ["GeoJSON tanpa poligon."] };
    return { jenis: "geojson", namaAsal, kolom, fitur, sistem: "WGS84 (GeoJSON)", catatan, galat };
  }

  return kosong("shapefile", "Tidak ada berkas .shp (shapefile) atau .geojson. Pilih zip shapefile (.shp, .dbf, .prj) atau berkas GeoJSON.");
}
