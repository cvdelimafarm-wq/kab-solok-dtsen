// lib/masterKk.ts  (logika murni; aman diimpor klien dan server)
//
// (7 Nov 2026, tahap C3) KK master: unggah daftar keluarga per kecamatan dan keputusan atas usulan pembaruan master dari lapangan.
// Satu baris berkas = satu keluarga pada satu sub SLS. Kolom (judul tidak membedakan huruf besar/kecil dan tanda baca):
//   Kode Sub SLS (16 digit, wajib) | Nama KK (wajib) | Anggota Lain | Patokan | Latitude | Longitude
// Latitude dan Longitude harus terisi berpasangan. Pencocokan dengan master dilakukan di basis data (SQL 20261107j, master_kk_terapkan): satu fungsi untuk
// pratinjau dan penerapan. Modul ini: pembacaan baris Excel, pemeriksaan di klien DAN ulang di server, templat, tipe data layar.

import { bacaKodeWilayah, type GalatBaris } from "@/lib/sampelSls";
import { KOTAK_SOLOK } from "@/lib/batasUnggah";

export const API_MASTER_KK = "/api/portal/master/kk";
export const MAKS_BARIS_KK = 30000;
export const PANJANG_SUBSLS_KK = 16;
export const MAKS_NAMA_KK = 120;
export const MAKS_ANGGOTA_KK = 500;
export const MAKS_PATOKAN_KK = 300;
const MAKS_GALAT_TAMPIL = 200;

export type BarisKk = { idsubsls: string; nama_kk: string; anggota_lain: string | null; patokan: string | null; lat: number | null; lng: number | null };

type Medan = "kode" | "nama" | "anggota" | "patokan" | "lat" | "lng";
const ALIAS: Record<Medan, string[]> = {
  kode: ["kodesubsls", "idsubsls", "kodewilayah", "kodesub", "kodesls16", "kode"],
  nama: ["namakk", "namakepalakeluarga", "kepalakeluarga", "namakepala", "namakeluarga", "nama"],
  anggota: ["anggotalain", "anggotakeluarga", "anggota", "anggotalainnya"],
  patokan: ["patokan", "patokanrumah", "catatanlokasi", "ciriciri", "keteranganlokasi"],
  lat: ["latitude", "lat", "lintang"],
  lng: ["longitude", "lng", "long", "lon", "bujur"],
};
const LABEL: Record<Medan, string> = { kode: "Kode Sub SLS", nama: "Nama KK", anggota: "Anggota Lain", patokan: "Patokan", lat: "Latitude", lng: "Longitude" };
export const KOLOM_TEMPLAT_KK = ["Kode Sub SLS", "Nama KK", "Anggota Lain", "Patokan", "Latitude", "Longitude"] as const;

const rapat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const teks = (v: unknown): string => (v === null || v === undefined ? "" : String(v).replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim());

/** Mencocokkan judul kolom berkas dengan kolom baku -> judul asli di berkas. */
export function petaKolomKk(judul: readonly string[]): Partial<Record<Medan, string>> {
  const hasil: Partial<Record<Medan, string>> = {};
  for (const j of judul) {
    const r = rapat(String(j ?? "").replace(/\([^)]*\)/g, ""));
    if (!r) continue;
    for (const m of Object.keys(ALIAS) as Medan[]) {
      if (!hasil[m] && ALIAS[m].includes(r)) {
        hasil[m] = String(j);
        break;
      }
    }
  }
  return hasil;
}

function bacaAngka(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  if (!/^[-+]?\d+(\.\d+)?$/.test(t)) return Number.NaN;
  return Number(t);
}

const kodeSub = (sel: string): { ok: true; kode: string } | { ok: false; pesan: string } => {
  const k = bacaKodeWilayah(sel);
  if (!k.ok) return k;
  if (k.kode.length === 14) return { ok: false, pesan: `Kode "${sel}" 14 digit (tingkat SLS). KK memakai kode Sub SLS 16 digit.` };
  if (k.kode.length !== PANJANG_SUBSLS_KK) return { ok: false, pesan: `Kode Sub SLS "${sel}" harus tepat ${PANJANG_SUBSLS_KK} digit (kode ini ${k.kode.length} digit).` };
  return { ok: true, kode: k.kode };
};

/** Memeriksa satu keluarga (dipakai klien dan server). Mengembalikan baris bersih atau daftar masalah; `peringatan` tidak menggagalkan baris. */
export function sahkanSatuKk(m: { kode: string; nama: string; anggota: string; patokan: string; lat: string; lng: string }): { baris: BarisKk | null; galat: string[]; peringatan: string[] } {
  const galat: string[] = [];
  const peringatan: string[] = [];
  const kode = kodeSub(m.kode);
  if (!kode.ok) galat.push(kode.pesan);
  const nama = m.nama.trim();
  if (!nama) galat.push("Nama KK kosong.");
  else if (nama.length > MAKS_NAMA_KK) galat.push(`Nama KK lebih dari ${MAKS_NAMA_KK} huruf.`);
  if (m.anggota.length > MAKS_ANGGOTA_KK) galat.push(`Anggota lain lebih dari ${MAKS_ANGGOTA_KK} huruf.`);
  if (m.patokan.length > MAKS_PATOKAN_KK) galat.push(`Patokan lebih dari ${MAKS_PATOKAN_KK} huruf.`);
  const lat = bacaAngka(m.lat);
  const lng = bacaAngka(m.lng);
  let koordinat: [number, number] | null = null;
  if (Number.isNaN(lat) || Number.isNaN(lng)) galat.push(`Latitude/Longitude harus angka desimal (mis. -0.7931 dan 100.6502).`);
  else if ((lat === null) !== (lng === null)) galat.push("Latitude dan Longitude harus terisi berpasangan.");
  else if (lat !== null && lng !== null) {
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) galat.push("Koordinat di luar rentang bumi (apakah Latitude dan Longitude tertukar?).");
    else {
      koordinat = [lat, lng];
      if (lng < KOTAK_SOLOK.minX || lng > KOTAK_SOLOK.maxX || lat < KOTAK_SOLOK.minY || lat > KOTAK_SOLOK.maxY) peringatan.push("Koordinat di luar wilayah Kabupaten Solok (apakah Latitude dan Longitude tertukar?).");
    }
  }
  if (galat.length > 0 || !kode.ok) return { baris: null, galat, peringatan };
  return {
    baris: { idsubsls: kode.kode, nama_kk: nama, anggota_lain: m.anggota || null, patokan: m.patokan || null, lat: koordinat ? koordinat[0] : null, lng: koordinat ? koordinat[1] : null },
    galat, peringatan,
  };
}

export type HasilPeriksaKk = { baris: BarisKk[]; nomor: number[]; galat: GalatBaris[]; peringatan: GalatBaris[]; dilewati: number; galat_total: number; peringatan_total: number };

/** Baris hasil sheet_to_json -> baris KK bersih. Nomor baris = nomor baris Excel (judul = baris 1). Galat = baris TIDAK dimasukkan. */
export function periksaBarisKk(baris: readonly Record<string, unknown>[]): HasilPeriksaKk {
  const galat: GalatBaris[] = [];
  const peringatan: GalatBaris[] = [];
  const hasil: BarisKk[] = [];
  const nomor: number[] = [];
  const kosong = (g: GalatBaris[]): HasilPeriksaKk => ({ baris: hasil, nomor, galat: g, peringatan, dilewati: 0, galat_total: g.length, peringatan_total: 0 });
  if (baris.length === 0) return kosong([{ baris: 0, pesan: "Berkas tidak berisi baris KK." }]);
  if (baris.length > MAKS_BARIS_KK) return kosong([{ baris: 0, pesan: `Berkas memuat ${baris.length} baris; batas satu unggahan ${MAKS_BARIS_KK}. Pecah per kecamatan.` }]);
  const kolom = petaKolomKk(Object.keys(baris[0]));
  const hilang = (["kode", "nama"] as Medan[]).filter((m) => !kolom[m]);
  if (hilang.length > 0) return kosong([{ baris: 1, pesan: `Kolom tidak ditemukan: ${hilang.map((m) => LABEL[m]).join(", ")}. Unduh templat untuk melihat format.` }]);
  const ambil = (b: Record<string, unknown>, m: Medan) => (kolom[m] ? teks(b[kolom[m] as string]) : "");
  const sudah = new Map<string, number>();
  let dilewati = 0;
  let galatTotal = 0;
  let peringatanTotal = 0;
  const catatGalat = (no: number, pesan: string) => { galatTotal++; if (galat.length < MAKS_GALAT_TAMPIL) galat.push({ baris: no, pesan }); };
  const catatPeringatan = (no: number, pesan: string) => { peringatanTotal++; if (peringatan.length < MAKS_GALAT_TAMPIL) peringatan.push({ baris: no, pesan }); };
  baris.forEach((b, i) => {
    const no = i + 2;
    if (Object.values(b).every((v) => teks(v) === "")) { dilewati++; return; }
    const r = sahkanSatuKk({ kode: ambil(b, "kode"), nama: ambil(b, "nama"), anggota: ambil(b, "anggota"), patokan: ambil(b, "patokan"), lat: ambil(b, "lat"), lng: ambil(b, "lng") });
    r.peringatan.forEach((p) => catatPeringatan(no, p));
    if (!r.baris) { r.galat.forEach((g) => catatGalat(no, g)); return; }
    const kunci = [r.baris.idsubsls, r.baris.nama_kk.toLowerCase().replace(/\s+/g, " "), r.baris.anggota_lain ?? "", r.baris.patokan ?? "", r.baris.lat ?? "", r.baris.lng ?? ""].join("|");
    const awal = sudah.get(kunci);
    if (awal !== undefined) catatPeringatan(no, `Baris identik dengan baris ${awal} (nama kembar boleh, tetapi baris persis sama kemungkinan salah ketik).`);
    else sudah.set(kunci, no);
    hasil.push(r.baris);
    nomor.push(no);
  });
  if (hasil.length === 0 && galatTotal === 0) catatGalat(0, "Berkas tidak berisi baris KK.");
  return { baris: hasil, nomor, galat, peringatan, dilewati, galat_total: galatTotal, peringatan_total: peringatanTotal };
}

/** Pemeriksaan ULANG di server atas apa pun yang dikirim browser. */
export function sahkanBarisKk(mentah: unknown): { ok: true; baris: BarisKk[] } | { ok: false; pesan: string } {
  if (!Array.isArray(mentah)) return { ok: false, pesan: "Isi berkas tidak terbaca." };
  if (mentah.length === 0) return { ok: false, pesan: "Berkas tidak berisi baris KK." };
  if (mentah.length > MAKS_BARIS_KK) return { ok: false, pesan: `Maksimal ${MAKS_BARIS_KK} baris per unggahan.` };
  const hasil: BarisKk[] = [];
  const s = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
  for (let i = 0; i < mentah.length; i++) {
    const x = mentah[i];
    if (!x || typeof x !== "object") return { ok: false, pesan: `Baris ${i + 1} tidak sah.` };
    const o = x as Record<string, unknown>;
    const lat = o.lat === null || o.lat === undefined ? "" : s(o.lat);
    const lng = o.lng === null || o.lng === undefined ? "" : s(o.lng);
    const r = sahkanSatuKk({ kode: s(o.idsubsls), nama: s(o.nama_kk), anggota: s(o.anggota_lain).trim(), patokan: s(o.patokan).trim(), lat, lng });
    if (!r.baris) return { ok: false, pesan: `Baris ${i + 1}: ${r.galat[0]}` };
    hasil.push(r.baris);
  }
  return { ok: true, baris: hasil };
}

/** Kecamatan (7 digit pertama kode) yang paling banyak muncul + jumlah kecamatan berbeda di berkas. */
export function kecamatanBerkas(baris: readonly Pick<BarisKk, "idsubsls">[]): { utama: string | null; jumlah: number; daftar: string[] } {
  const hitung = new Map<string, number>();
  for (const b of baris) hitung.set(b.idsubsls.slice(0, 7), (hitung.get(b.idsubsls.slice(0, 7)) ?? 0) + 1);
  const urut = [...hitung.entries()].sort((a, b) => b[1] - a[1]);
  return { utama: urut[0]?.[0] ?? null, jumlah: urut.length, daftar: urut.map((u) => u[0]) };
}

export function templatKk(): string[][] {
  return [
    [...KOLOM_TEMPLAT_KK],
    ["1303110005000102", "NAMA KEPALA KELUARGA", "Anggota lain, dipisah koma", "Dekat masjid", "-0.7931", "100.6502"],
  ];
}
export const PETUNJUK_TEMPLAT_KK = [
  "Satu baris = satu keluarga. Hapus baris contoh sebelum mengunggah.",
  "Kode Sub SLS wajib 16 digit dan berformat TEKS (jangan angka, supaya tidak berubah menjadi notasi ilmiah).",
  "Nama KK wajib. Anggota Lain dan Patokan boleh kosong.",
  "Latitude dan Longitude boleh kosong, tetapi bila diisi harus berpasangan; pakai titik atau koma desimal.",
  "Pilih kecamatan yang sesuai sebelum mengunggah: semua kode harus milik kecamatan itu.",
  "Pencocokan memakai Kode Sub SLS + Nama KK (huruf besar/kecil dan spasi ganda diabaikan). Baris yang cocok tetapi isinya berbeda akan diperbarui di tempat; yang tidak ada di berkas hanya dinonaktifkan bila Anda memilihnya, dan tidak pernah bila KK itu dipakai tag atau penggantian sampel.",
];

// ---------------------------------------------------------------------------------------------------------------------------------
// Tipe data layar (diisi server: lib/portal/masterKk.ts)

export type ContohKk = { idsubsls: string; nama: string; terpakai?: boolean };
export type HasilTerapkanKk = {
  terapkan: boolean;
  baris: number;
  baru: number;
  berubah: number;
  sama: number;
  diaktifkan: number;
  hilang: number;
  hilang_terpakai: number;
  nonaktif: number;
  unggah_id: number | null;
  contoh: { baru: ContohKk[]; berubah: ContohKk[]; hilang: ContohKk[] };
};
export type RingkasKecKk = { kd_kec: string; kecamatan: string; subsls: number; subsls_berkk: number; kk_aktif: number; terbaru: string | null };
export type RiwayatKk = { id: number; kd_kec: string; kecamatan: string; nama_berkas: string | null; dibuat_at: string; oleh: string; jumlah_baris: number; baru: number; berubah: number; sama: number; diaktifkan: number; nonaktif: number; nonaktifkan_hilang: boolean };
export type UsulanKk = { id: number; kegiatan: string; idsubsls: string; kecamatan: string; nagari: string; sls: string; alasan: string; nama_kk: string; status: "menunggu" | "disetujui"; diajukan_nama: string | null; diajukan_at: string };
export type DataMasterKk = { siap: boolean; usulan_siap: boolean; kecamatan: RingkasKecKk[]; riwayat: RiwayatKk[]; usulan: UsulanKk[] };
export const MASTER_KK_KOSONG: DataMasterKk = { siap: false, usulan_siap: false, kecamatan: [], riwayat: [], usulan: [] };
