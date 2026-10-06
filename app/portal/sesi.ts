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
    for (const k of [...Object.values(KUNCI), ...Object.values(PENYISIRAN)]) localStorage.removeItem(k);
  }, undefined);
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
  return json as T;
}
