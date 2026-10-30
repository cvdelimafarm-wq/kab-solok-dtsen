// lib/laporanFoto.ts  (logika murni; aman diimpor klien dan server)
//
// (30 Okt 2026) Pemilih foto untuk Lampiran B "Dokumentasi foto" pada Laporan Sementara PSP: saringan (peran, nomor foto 1-5, tanggal, nama),
// pilihan banyak (centang, rentang shift, seret), keterangan foto, dan ukuran gambar pada halaman Word.

/** Foto dokumentasi yang bisa dipilih berasal dari sigap_dokumentasi (nomor foto 1-5 per petugas per hari kerja). */
export const JUMLAH_NOMOR = 5;
/** Batas foto dalam satu laporan: menjaga ukuran berkas Word (sekitar 100 KB per foto setelah diperkecil) dan waktu menyusun. */
export const MAKS_FOTO_LAPORAN = 60;
export const UKURAN_HALAMAN = 48;
export const MAKS_UKURAN_HALAMAN = 96;
/** Jumlah id maksimum yang dikembalikan untuk "pilih semua hasil saringan". */
export const MAKS_ID_SARINGAN = 500;

export type KodePeranFoto = "ppl" | "pml" | "supervisi";
export const PERAN_FOTO: { kode: KodePeranFoto; label: string; peran: string[] }[] = [
  { kode: "ppl", label: "PPL", peran: ["ppl"] },
  { kode: "pml", label: "PML", peran: ["pml"] },
  { kode: "supervisi", label: "Korwil / Supervisor", peran: ["korwil", "supervisor"] },
];
const PERAN_LABEL: Record<string, string> = { ppl: "PPL", pml: "PML", korwil: "Korwil", supervisor: "Supervisor" };
export const labelPeran = (p: string): string => PERAN_LABEL[p] ?? p.toUpperCase();

export type FilterFoto = {
  peran: KodePeranFoto[];
  slot: number[];
  /** YYYY-MM-DD atau "". */
  dari: string;
  sampai: string;
  cari: string;
  halaman: number;
  ukuran: number;
};

const TGL = /^\d{4}-\d{2}-\d{2}$/;
export const tanggalSah = (s: string): boolean => {
  if (!TGL.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
};

function daftarKode(mentah: string | null): string[] {
  return (mentah ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

/** Saringan dari alamat (parameter tak tepercaya): nilai di luar daftar dibuang, halaman dan ukuran dibatasi. */
export function bacaFilterFoto(sp: URLSearchParams): FilterFoto {
  const kodePeran = new Set(PERAN_FOTO.map((p) => p.kode as string));
  const peran = Array.from(new Set(daftarKode(sp.get("peran")).filter((x) => kodePeran.has(x)))) as KodePeranFoto[];
  const slot = Array.from(new Set(daftarKode(sp.get("slot")).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= JUMLAH_NOMOR))).sort((a, b) => a - b);
  const dari = tanggalSah(sp.get("dari") ?? "") ? (sp.get("dari") as string) : "";
  const sampai = tanggalSah(sp.get("sampai") ?? "") ? (sp.get("sampai") as string) : "";
  const halaman = Math.max(1, Math.min(10_000, Math.floor(Number(sp.get("halaman"))) || 1));
  const ukuran = Math.max(1, Math.min(MAKS_UKURAN_HALAMAN, Math.floor(Number(sp.get("ukuran"))) || UKURAN_HALAMAN));
  // karakter yang bermakna khusus bagi penyaring PostgREST dibuang; panjang dibatasi
  const cari = (sp.get("cari") ?? "").replace(/[^\p{L}\p{N} .'-]/gu, "").trim().slice(0, 60);
  return { peran, slot, dari, sampai, cari, halaman, ukuran };
}

/** Nilai peran basis data yang dicakup oleh pilihan peran ([] = semua peran). */
export function peranBasisData(kode: KodePeranFoto[]): string[] {
  return PERAN_FOTO.filter((p) => kode.includes(p.kode)).flatMap((p) => p.peran);
}

/** Bentuk parameter alamat dari saringan (kebalikan bacaFilterFoto); nilai bawaan tidak ditulis. */
export function paramFilterFoto(f: Partial<FilterFoto>): string {
  const p = new URLSearchParams();
  if (f.peran?.length) p.set("peran", f.peran.join(","));
  if (f.slot?.length) p.set("slot", f.slot.join(","));
  if (f.dari) p.set("dari", f.dari);
  if (f.sampai) p.set("sampai", f.sampai);
  if (f.cari) p.set("cari", f.cari);
  if (f.halaman && f.halaman > 1) p.set("halaman", String(f.halaman));
  if (f.ukuran && f.ukuran !== UKURAN_HALAMAN) p.set("ukuran", String(f.ukuran));
  return p.toString();
}

/** Satu foto pada daftar / pilihan. `id` = sigap_dokumentasi.id. */
export type FotoItem = {
  id: number;
  slot: number;
  peran: string;
  nama: string;
  /** Tanggal hari kerja (YYYY-MM-DD). */
  tanggal: string;
  /** Waktu pemotretan (ISO) bila foto kamera; null untuk foto unggahan. */
  diambil: string | null;
  lokasi: string | null;
  kamera: boolean;
};

export function bacaFotoItem(mentah: unknown): FotoItem | null {
  if (typeof mentah !== "object" || mentah === null) return null;
  const r = mentah as Record<string, unknown>;
  const id = Number(r.id);
  const slot = Number(r.slot);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(slot) || slot < 1) return null;
  const s = (v: unknown, maks = 300): string => (typeof v === "string" ? v.slice(0, maks) : "");
  const sn = (v: unknown, maks = 300): string | null => (typeof v === "string" && v.trim() ? v.slice(0, maks) : null);
  return { id, slot, peran: s(r.peran, 20), nama: s(r.nama, 120), tanggal: s(r.tanggal, 10), diambil: sn(r.diambil, 40), lokasi: sn(r.lokasi, 300), kamera: r.kamera === true };
}

export type HasilDaftarFoto = { total: number; halaman: number; ukuran: number; foto: FotoItem[] };

export function bacaHasilDaftarFoto(mentah: unknown): HasilDaftarFoto {
  const r = (typeof mentah === "object" && mentah !== null ? mentah : {}) as Record<string, unknown>;
  const foto = (Array.isArray(r.foto) ? r.foto : []).map(bacaFotoItem).filter((x): x is FotoItem => x !== null);
  return { total: Math.max(0, Math.floor(Number(r.total)) || 0), halaman: Math.max(1, Math.floor(Number(r.halaman)) || 1), ukuran: Math.max(1, Math.floor(Number(r.ukuran)) || UKURAN_HALAMAN), foto };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Pilihan banyak
// ---------------------------------------------------------------------------------------------------------------------------------

/** Tambah / buang `baru` dari pilihan (urutan pilihan dipertahankan, id ganda dibuang, dibatasi MAKS_FOTO_LAPORAN). */
export function ubahPilihan(pilihan: FotoItem[], baru: FotoItem[], pilih: boolean, maks = MAKS_FOTO_LAPORAN): { pilihan: FotoItem[]; terpotong: number } {
  if (!pilih) {
    const buang = new Set(baru.map((f) => f.id));
    return { pilihan: pilihan.filter((f) => !buang.has(f.id)), terpotong: 0 };
  }
  const ada = new Set(pilihan.map((f) => f.id));
  const out = [...pilihan];
  let terpotong = 0;
  for (const f of baru) {
    if (ada.has(f.id)) continue;
    if (out.length >= maks) {
      terpotong++;
      continue;
    }
    out.push(f);
    ada.add(f.id);
  }
  return { pilihan: out, terpotong };
}

/** Indeks `a` sampai `b` (termasuk keduanya, urutan bebas) pada daftar tampil; -1 bila tidak ada. Dipakai shift-klik dan seret. */
export function rentangIndeks(jumlah: number, a: number, b: number): number[] {
  if (a < 0 || b < 0 || a >= jumlah || b >= jumlah) return [];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Keterangan dan ukuran
// ---------------------------------------------------------------------------------------------------------------------------------

export type KetFoto = { nomor: boolean; nama: boolean; peran: boolean; tanggal: boolean; lokasi: boolean };
export const KET_FOTO_AWAL: KetFoto = { nomor: true, nama: true, peran: true, tanggal: true, lokasi: false };
export type OpsiFoto = { perBaris: 2 | 3; ket: KetFoto };
export const OPSI_FOTO_AWAL: OpsiFoto = { perBaris: 2, ket: KET_FOTO_AWAL };

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export function tanggalSingkat(iso: string): string {
  if (!tanggalSah(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

/** Keterangan di bawah foto, mis. "Foto 2 · Ayu Sepriani (PML) · 21 Okt 2026". */
export function keteranganFoto(f: FotoItem, k: KetFoto): string {
  const nama = k.nama && f.nama ? (k.peran && f.peran ? `${f.nama} (${labelPeran(f.peran)})` : f.nama) : k.peran && f.peran ? labelPeran(f.peran) : "";
  const bagian = [k.nomor ? `Foto ${f.slot}` : "", nama, k.tanggal ? tanggalSingkat(f.tanggal) : "", k.lokasi && f.lokasi ? f.lokasi : ""].filter((x) => x);
  return bagian.join(" · ");
}

/** Urutan foto dalam laporan: tanggal, nama, nomor foto (tetap, tidak bergantung urutan memilih). */
export function urutkanFoto(daftar: FotoItem[], cara: "pilih" | "tanggal" | "petugas" = "pilih"): FotoItem[] {
  if (cara === "pilih") return [...daftar];
  const kmp = (a: FotoItem, b: FotoItem) =>
    cara === "tanggal"
      ? a.tanggal.localeCompare(b.tanggal) || a.nama.localeCompare(b.nama, "id") || a.slot - b.slot
      : a.nama.localeCompare(b.nama, "id") || a.tanggal.localeCompare(b.tanggal) || a.slot - b.slot;
  return [...daftar].sort(kmp);
}

/** Ukuran tampil (EMU, 914400 per inci / 360000 per cm) yang muat dalam kotak lebarMaks x tinggiMaks dengan perbandingan sisi tetap. */
export function ukuranMuat(lebar: number, tinggi: number, lebarMaks: number, tinggiMaks: number): { cx: number; cy: number } {
  if (!(lebar > 0) || !(tinggi > 0)) return { cx: lebarMaks, cy: Math.round(lebarMaks * 0.75) };
  const skala = Math.min(lebarMaks / lebar, tinggiMaks / tinggi);
  return { cx: Math.max(1, Math.round(lebar * skala)), cy: Math.max(1, Math.round(tinggi * skala)) };
}

/** Sisi terpanjang gambar yang disematkan ke Word (piksel); cukup tajam untuk cetak A4 setengah halaman. */
export const SISI_GAMBAR_WORD = 1000;
export const SISI_GAMBAR_KECIL = 320;
