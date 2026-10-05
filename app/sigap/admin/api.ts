// app/sigap/admin/api.ts  (hanya diimpor komponen klien)
//
// (5 Okt 2026) SIGAP Admin -- helper fetch JSON utk halaman Admin Transport Lokal & Kelola Peran & Akses
// -- permintaan user. Sesi dibaca dari localStorage (sigap_sesi + sigap_sesi_sampai), dikirim sebagai
// header Authorization: Bearer <sesi>. Sesi tidak ada / kedaluwarsa / API 401 -> ke /sigap/masuk?lanjut=<path>.

export const KUNCI_SESI = "sigap_sesi";
export const KUNCI_SESI_SAMPAI = "sigap_sesi_sampai";

/** Galat khusus: halaman sedang diarahkan ke /sigap/masuk (pemanggil cukup diam). */
export class SesiBerakhir extends Error {
  constructor() {
    super("Sesi berakhir. Silakan masuk kembali.");
    this.name = "SesiBerakhir";
  }
}

export function bacaSesi(): string | null {
  try {
    const s = localStorage.getItem(KUNCI_SESI);
    const sampai = localStorage.getItem(KUNCI_SESI_SAMPAI);
    if (!s) return null;
    if (sampai && new Date(sampai).getTime() < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

export function hapusSesi() {
  try {
    localStorage.removeItem(KUNCI_SESI);
    localStorage.removeItem(KUNCI_SESI_SAMPAI);
  } catch {
    /* penyimpanan tidak tersedia */
  }
}

export function keMasuk() {
  const path = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/sigap/admin";
  window.location.replace(`/sigap/masuk?lanjut=${encodeURIComponent(path)}`);
}

export function keluar() {
  hapusSesi();
  window.location.replace("/sigap/masuk");
}

function header(extra?: Record<string, string>): Record<string, string> {
  const s = bacaSesi();
  if (!s) {
    keMasuk();
    throw new SesiBerakhir();
  }
  return { Authorization: `Bearer ${s}`, ...(extra ?? {}) };
}

async function olah<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    hapusSesi();
    keMasuk();
    throw new SesiBerakhir();
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string })?.error ?? `Gagal (${res.status}).`);
  return json as T;
}

/** GET /api/sigap/admin?bagian=...&param... */
export async function ambil<T>(bagian: string, param: Record<string, string | number | null | undefined> = {}): Promise<T> {
  const q = new URLSearchParams({ bagian });
  for (const [k, v] of Object.entries(param)) if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  const res = await fetch(`/api/sigap/admin?${q.toString()}`, { headers: header(), cache: "no-store" });
  return olah<T>(res);
}

/** POST /api/sigap/admin { aksi, ...isi } */
export async function aksi<T = { ok: boolean }>(nama: string, isi: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("/api/sigap/admin", {
    method: "POST",
    headers: header({ "Content-Type": "application/json" }),
    body: JSON.stringify({ aksi: nama, ...isi }),
  });
  return olah<T>(res);
}

/** Fetch bebas (mis. multipart / GET lain) dengan header Bearer + penanganan 401. */
export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...header(), ...((init.headers as Record<string, string>) ?? {}) }, cache: "no-store" });
  return olah<T>(res);
}

/**
 * Buka berkas (PDF) hasil fetch ber-Bearer di tab baru via object URL.
 * Tab dibuka lebih dulu (sinkron dgn klik) supaya tidak diblokir pemblokir pop-up.
 */
export async function bukaBlob(url: string): Promise<void> {
  const w = window.open("", "_blank");
  try {
    if (w) w.document.write("<p style='font-family:sans-serif;padding:16px'>Menyiapkan dokumen…</p>");
    const res = await fetch(url, { headers: header(), cache: "no-store" });
    if (res.status === 401) {
      w?.close();
      hapusSesi();
      keMasuk();
      throw new SesiBerakhir();
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error((j as { error?: string })?.error ?? `Gagal membuka dokumen (${res.status}).`);
    }
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    if (w) w.location.href = obj;
    else window.location.href = obj;
    setTimeout(() => URL.revokeObjectURL(obj), 5 * 60_000);
  } catch (e) {
    w?.close();
    throw e;
  }
}

/** Buka URL (didapat async) di tab baru tanpa diblokir pop-up. */
export async function bukaUrlAsync(dapat: () => Promise<string | null>): Promise<void> {
  const w = window.open("", "_blank");
  try {
    const u = await dapat();
    if (!u) throw new Error("Berkas tidak tersedia.");
    if (w) w.location.href = u;
    else window.open(u, "_blank");
  } catch (e) {
    w?.close();
    throw e;
  }
}

export const pesanGalat = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");

// ---------------------------------------------------------------- Format
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const BULAN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const tglObj = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);

export const rupiah = (n: number) => "Rp" + Math.round(n || 0).toLocaleString("id-ID");
export const tglPendek = (iso: string | null | undefined) => (iso ? `${tglObj(iso).getUTCDate()} ${BULAN[tglObj(iso).getUTCMonth()]}` : "–");
export const tglSedang = (iso: string | null | undefined) =>
  iso ? `${tglObj(iso).getUTCDate()} ${BULAN[tglObj(iso).getUTCMonth()]} ${tglObj(iso).getUTCFullYear()}` : "–";
export function tglPanjang(iso: string) {
  const d = tglObj(iso);
  return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN_PANJANG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export const hariSingkat = (iso: string) => HARI[tglObj(iso).getUTCDay()].slice(0, 3);
export const tglAngka = (iso: string) => tglObj(iso).getUTCDate();
export const bulanSingkat = (iso: string) => BULAN[tglObj(iso).getUTCMonth()];
export function rentangPendek(a: string | null | undefined, b: string | null | undefined) {
  if (!a && !b) return "–";
  if (!a || !b) return tglPendek(a ?? b);
  if (a === b) return tglPendek(a);
  return `${tglPendek(a)} – ${tglPendek(b)}`;
}
/** Waktu ISO -> "5 Okt 2026 14.03 WIB". */
export function waktuWib(iso: string | null | undefined) {
  if (!iso) return "–";
  const d = new Date(new Date(iso).getTime() + 7 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()} ${p(d.getUTCHours())}.${p(d.getUTCMinutes())} WIB`;
}
export const huruf = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// ---------------------------------------------------------------- Tipe bersama
export type Level = "lihat" | "kelola";
export type PetaIzin = Record<string, { level: Level; semua: boolean; kegiatan: number[] }>;
export type PeranAkun = { peran_id: number; kode: string; nama: string; kegiatan_id: number | null };
export type KegiatanRingkas = { id: number; kode: string; nama: string; tanggal_mulai: string | null; tanggal_selesai: string | null; aktif: boolean };
export type Ringkas = { nama: string; peran: PeranAkun[]; izin: PetaIzin; kegiatan: KegiatanRingkas[]; hari_ini: string };

/** Cermin boleh() di lib/sigapAkses (sisi klien, hanya utk menampilkan/menyembunyikan UI). */
export function bolehKlien(izin: PetaIzin, menu: string, level: Level, kegiatanId?: number | null): boolean {
  const x = izin[menu];
  if (!x) return false;
  if (level === "kelola" && x.level !== "kelola") return false;
  if (kegiatanId == null) return true;
  return x.semua || x.kegiatan.includes(kegiatanId);
}
