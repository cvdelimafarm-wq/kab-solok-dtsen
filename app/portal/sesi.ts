// app/portal/sesi.ts  (hanya klien)
//
// (7 Okt 2026) Portal satu login -- penyimpanan sesi di browser. Kunci SAMA dgn SIGAP (sigap_sesi, sigap_sesi_sampai,
// sigap_token) supaya halaman SIGAP lama langsung ikut masuk. Kunci penyisiran SAMA dgn
// app/seruti/penyisiran-usaha.tsx (TOKEN_KEY dst.) supaya /penyisiran langsung terbuka tanpa login ulang.

export const KUNCI = {
  sesi: "sigap_sesi",
  sampai: "sigap_sesi_sampai",
  tokenPetugas: "sigap_token",
} as const;

// Salinan nama kunci dari app/seruti/penyisiran-usaha.tsx (tidak diimpor: file itu besar & khusus klien penyisiran).
const PENYISIRAN = {
  token: "penyisiran-petugas-login-token",
  nama: "penyisiran-petugas-login-nama",
  id: "penyisiran-petugas-login-id",
  isPml: "penyisiran-petugas-login-ispml",
  lat: "penyisiran-petugas-login-lat",
  lng: "penyisiran-petugas-login-lng",
  jorongToken: "identifikasi-jorong-login-token",
  jorongNama: "identifikasi-jorong-login-nama",
} as const;

// (10 Okt 2026) Akun super "masuk sebagai" akun lain: sesi akun super disimpan di sini selama mode ini, supaya bisa kembali / ganti akun.
export const KUNCI_ASLI = {
  sesi: "sigap_sesi_asli",
  sampai: "sigap_sesi_asli_sampai",
  tokenPetugas: "sigap_token_asli",
  sebagai: "sigap_lihat_sebagai",
} as const;

// (10 Okt 2026) Simpanan data bersama antar-layer (app/portal/dataBersama.ts) disimpan di sessionStorage dengan kunci ini; dibuang saat keluar.
export const KUNCI_SIMPAN_DATA = "sigap_cache_v1";

/** Waktu (ms) penulisan terakhir lewat apiPortal di tab ini; data simpanan yang diambil sebelum itu dianggap kedaluwarsa. */
export function waktuTulisTerakhir(): number {
  return (globalThis as { __sigapTulis?: number }).__sigapTulis ?? 0;
}

export type LihatSebagai = { id: number; nama: string; aktor: string };

function aman<T>(f: () => T, cadangan: T): T {
  try {
    return f();
  } catch {
    return cadangan;
  }
}

export function bacaSesi(): string | null {
  return aman(() => {
    const s = localStorage.getItem(KUNCI.sesi);
    const sampai = localStorage.getItem(KUNCI.sampai);
    if (!s) return null;
    if (sampai && Date.parse(sampai) < Date.now()) return null;
    return s;
  }, null);
}

export function simpanSesi(x: { sesi: string; sampai: string; token?: string | null }) {
  aman(() => {
    localStorage.setItem(KUNCI.sesi, x.sesi);
    localStorage.setItem(KUNCI.sampai, x.sampai);
    if (x.token) localStorage.setItem(KUNCI.tokenPetugas, x.token);
  }, undefined);
}

export type SsoPenyisiran = { token: string; jorong_token: string | null; nama: string; lat: number | null; lng: number | null; petugas_id: number; is_pml: boolean };

export function simpanPenyisiran(d: SsoPenyisiran) {
  aman(() => {
    localStorage.setItem(PENYISIRAN.token, d.token);
    localStorage.setItem(PENYISIRAN.nama, d.nama);
    localStorage.setItem(PENYISIRAN.id, String(d.petugas_id));
    localStorage.setItem(PENYISIRAN.isPml, d.is_pml ? "1" : "0");
    if (d.lat != null) localStorage.setItem(PENYISIRAN.lat, String(d.lat));
    else localStorage.removeItem(PENYISIRAN.lat);
    if (d.lng != null) localStorage.setItem(PENYISIRAN.lng, String(d.lng));
    else localStorage.removeItem(PENYISIRAN.lng);
    if (d.jorong_token) {
      localStorage.setItem(PENYISIRAN.jorongToken, d.jorong_token);
      localStorage.setItem(PENYISIRAN.jorongNama, d.nama);
    }
  }, undefined);
}

/** Keluar dari portal: hapus sesi portal/SIGAP & token penyisiran turunan (perangkat bisa dipakai bergantian). */
export function hapusSemuaSesi() {
  aman(() => {
    for (const k of [...Object.values(KUNCI), ...Object.values(PENYISIRAN), ...Object.values(KUNCI_ASLI)]) localStorage.removeItem(k);
  }, undefined);
  // (10 Okt 2026) data simpanan antar-layer milik akun ini ikut dibuang (HP bisa dipakai bergantian)
  aman(() => sessionStorage.removeItem(KUNCI_SIMPAN_DATA), undefined);
}

function hapusPenyisiran() {
  aman(() => {
    for (const k of Object.values(PENYISIRAN)) localStorage.removeItem(k);
  }, undefined);
}

/** Sedang "masuk sebagai" akun lain? (null = akun sendiri) */
export function bacaLihatSebagai(): LihatSebagai | null {
  return aman(() => {
    const raw = localStorage.getItem(KUNCI_ASLI.sebagai);
    if (!raw || !localStorage.getItem(KUNCI_ASLI.sesi)) return null;
    const v = JSON.parse(raw) as Partial<LihatSebagai>;
    return typeof v.id === "number" && typeof v.nama === "string" ? { id: v.id, nama: v.nama, aktor: typeof v.aktor === "string" ? v.aktor : "" } : null;
  }, null);
}

/** Sesi asli (akun super) yang disimpan selama mode "masuk sebagai". */
export function bacaSesiAsli(): string | null {
  return aman(() => {
    const s = localStorage.getItem(KUNCI_ASLI.sesi);
    const sampai = localStorage.getItem(KUNCI_ASLI.sampai);
    if (!s) return null;
    if (sampai && Date.parse(sampai) < Date.now()) return null;
    return s;
  }, null);
}

/** Simpan sesi akun super (asli) lalu pakai sesi akun target. Token penyisiran lama dibuang (milik akun sebelumnya). */
export function mulaiLihatSebagai(asli: { sesi: string; sampai: string; token?: string | null }, target: { sesi: string; sampai: string; token?: string | null; id: number; nama: string; aktor: string }) {
  aman(() => {
    if (!localStorage.getItem(KUNCI_ASLI.sesi)) {
      localStorage.setItem(KUNCI_ASLI.sesi, asli.sesi);
      localStorage.setItem(KUNCI_ASLI.sampai, asli.sampai);
      if (asli.token) localStorage.setItem(KUNCI_ASLI.tokenPetugas, asli.token);
    }
    localStorage.setItem(KUNCI_ASLI.sebagai, JSON.stringify({ id: target.id, nama: target.nama, aktor: target.aktor }));
    hapusPenyisiran();
    localStorage.setItem(KUNCI.sesi, target.sesi);
    localStorage.setItem(KUNCI.sampai, target.sampai);
    if (target.token) localStorage.setItem(KUNCI.tokenPetugas, target.token);
    else localStorage.removeItem(KUNCI.tokenPetugas);
  }, undefined);
}

/** Kembali ke akun super (sesi asli dipulihkan). false bila sesi asli sudah tidak ada/kedaluwarsa. */
export function kembaliKeAkunSaya(): boolean {
  return aman(() => {
    const asli = bacaSesiAsli();
    const sampai = localStorage.getItem(KUNCI_ASLI.sampai);
    const token = localStorage.getItem(KUNCI_ASLI.tokenPetugas);
    hapusPenyisiran();
    localStorage.removeItem(KUNCI_ASLI.sebagai);
    for (const k of [KUNCI_ASLI.sesi, KUNCI_ASLI.sampai, KUNCI_ASLI.tokenPetugas]) localStorage.removeItem(k);
    if (!asli || !sampai) {
      for (const k of Object.values(KUNCI)) localStorage.removeItem(k);
      return false;
    }
    localStorage.setItem(KUNCI.sesi, asli);
    localStorage.setItem(KUNCI.sampai, sampai);
    if (token) localStorage.setItem(KUNCI.tokenPetugas, token);
    else localStorage.removeItem(KUNCI.tokenPetugas);
    return true;
  }, false);
}

/** ?lanjut= yg aman (path internal saja). */
export function tujuanLanjut(): string | null {
  return aman(() => {
    const l = new URLSearchParams(window.location.search).get("lanjut");
    return l && l.startsWith("/") && !l.startsWith("//") ? l : null;
  }, null);
}

export async function apiPortal<T>(path: string, init?: RequestInit): Promise<T> {
  const s = bacaSesi();
  const res = await fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", ...(s ? { Authorization: `Bearer ${s}` } : {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) {
    hapusSemuaSesi();
    throw new Error("SESI_BERAKHIR");
  }
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Gagal (${res.status})`);
  // (10 Okt 2026) setelah menulis (POST/PUT/PATCH/DELETE), data simpanan antar-layer ditandai kedaluwarsa -> dimuat ulang di belakang saat halaman dibuka
  if (init?.method && init.method.toUpperCase() !== "GET") (globalThis as { __sigapTulis?: number }).__sigapTulis = Date.now();
  return json as T;
}
