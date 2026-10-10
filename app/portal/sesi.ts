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

// (10 Okt 2026) Simpanan data bersama antar-layer (app/portal/dataBersama.ts) disimpan di localStorage (bertahan walau aplikasi ditutup);
// dibuang saat KELUAR. Saat sesi hanya kedaluwarsa (12 jam) data akun yang sama dipertahankan supaya tampilan pertama setelah masuk lagi tetap instan.
export const KUNCI_SIMPAN_DATA = "sigap_cache_v2";
/** Peta wilayah kerja yang diunduh ke HP (Cache Storage) + daftar berkasnya (app/portal/petaOffline.ts). Tidak dibuang saat keluar (bukan data pribadi). */
export const NAMA_CACHE_PETA = "sigap-peta-v1";
export const KUNCI_MANIFEST_PETA = "sigap_peta_manifest_v1";
/** Antrean hasil yang menunggu dikirim ke server (app/portal/antreanKirim.ts). Dimiliki satu akun; tidak dibuang saat keluar agar tidak hilang. */
export const KUNCI_ANTREAN = "sigap_antrean_v1";

/** Id akun pemilik sesi aktif (bagian pertama token sesi), atau null. */
export function pemilikSesi(): number | null {
  const s = bacaSesi();
  if (!s) return null;
  const n = Number(s.split(".")[0]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Pendengar penulisan (POST/PUT/PATCH/DELETE lewat apiPortal yang berhasil): dipakai simpanan data untuk menandai data terkait kedaluwarsa. */
export const pendengarTulis = new Set<(path: string) => void>();

/** Galat dari apiPortal membawa kode status HTTP (undefined = gagal sambung / tak ada jawaban). */
export type GalatApi = Error & { status?: number };

/** (10 Okt 2026) Id build aplikasi yang sedang berjalan di HP (diisi saat build, next.config.js) dan yang terakhir dilaporkan server lewat header X-Build-Id.
 *  Beda = ada deploy baru; kode di HP ini masih versi lama (lihat PembaruanTersedia.tsx). Data simpanan TIDAK dibuang karena deploy:
 *  tiap jenis data punya nomor skema sendiri (dataBersama.ts) -- permintaan user: perbarui hanya area yang berkaitan. */
export const BUILD_ID_KLIEN = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
export const infoBuild: { server: string | null } = { server: null };
export const pendengarBuild = new Set<() => void>();

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

/** Keluar dari portal: hapus sesi portal/SIGAP & token penyisiran turunan (perangkat bisa dipakai bergantian).
 *  `simpanData` = hanya sesi habis (bukan keluar disengaja): data simpanan akun yang sama dipertahankan. */
export function hapusSemuaSesi(opsi?: { simpanData?: boolean }) {
  aman(() => {
    for (const k of [...Object.values(KUNCI), ...Object.values(PENYISIRAN), ...Object.values(KUNCI_ASLI)]) localStorage.removeItem(k);
  }, undefined);
  if (!opsi?.simpanData) {
    // (10 Okt 2026) data simpanan antar-layer milik akun ini ikut dibuang (HP bisa dipakai bergantian)
    aman(() => localStorage.removeItem(KUNCI_SIMPAN_DATA), undefined);
    aman(() => sessionStorage.removeItem("sigap_cache_v1"), undefined);
  }
}

function hapusPenyisiran() {
  aman(() => {
    for (const k of Object.values(PENYISIRAN)) localStorage.removeItem(k);
  }, undefined);
}

/** Penanda mode tanpa memeriksa sesi (dipakai apiPortal saat 401). */
function bacaLihatSebagaiMentah(): boolean {
  return aman(() => !!localStorage.getItem(KUNCI_ASLI.sebagai), false);
}

/** Sedang "masuk sebagai" akun lain? (null = akun sendiri) */
export function bacaLihatSebagai(): LihatSebagai | null {
  return aman(() => {
    const raw = localStorage.getItem(KUNCI_ASLI.sebagai);
    // (11 Okt 2026) spanduk hanya bila sesi akun yang dilihat masih sah (dulu tetap tampil di halaman Masuk setelah sesi habis)
    if (!raw || !localStorage.getItem(KUNCI_ASLI.sesi) || !bacaSesi()) return null;
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
    // (11 Okt 2026) Perbaikan audit: sesi asli yang SUDAH KEDALUWARSA juga ditimpa. Dulu hanya disimpan bila belum ada, sehingga sesi asli kemarin
    // tertinggal -> tombol "Ganti" diam dan "Kembali ke akun saya" mengeluarkan akun. Saat "Ganti" (asli.sampai kosong) sesi asli yang masih sah dipertahankan.
    if (!bacaSesiAsli() && asli.sampai) {
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
    // (11 Okt 2026) simpanan data akun sebelumnya dibuang saat berganti akun (tidak tertinggal di perangkat; lihat juga dataBersama.ts)
    localStorage.removeItem(KUNCI_SIMPAN_DATA);
  }, undefined);
}

/** (11 Okt 2026) Hapus semua jejak mode "masuk sebagai" (dipanggil saat login biasa, supaya sesi asli lama & spanduk tidak tertinggal). */
export function hapusLihatSebagai() {
  aman(() => {
    for (const k of Object.values(KUNCI_ASLI)) localStorage.removeItem(k);
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
    // (11 Okt 2026) simpanan data milik akun yang dilihat dibuang (dulu tertinggal di perangkat, terutama bila sesi asli sudah habis)
    localStorage.removeItem(KUNCI_SIMPAN_DATA);
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
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { ...(init?.headers ?? {}), "Content-Type": "application/json", ...(s ? { Authorization: `Bearer ${s}` } : {}) },
    });
  } catch (e) {
    const g: GalatApi = new Error(e instanceof Error ? e.message : "Tidak ada sambungan.");
    throw g;
  }
  const buildServer = res.headers.get("x-build-id");
  if (buildServer && buildServer !== infoBuild.server) {
    infoBuild.server = buildServer;
    pendengarBuild.forEach((f) => f());
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) {
    // (11 Okt 2026) mode "masuk sebagai": sesi akun yang dilihat habis -> kembali ke akun super (sesi asli tidak ikut dihapus)
    if (bacaLihatSebagaiMentah()) {
      kembaliKeAkunSaya();
      if (typeof window !== "undefined") window.location.replace("/");
      throw new Error("SESI_BERAKHIR");
    }
    hapusSemuaSesi({ simpanData: true });
    throw new Error("SESI_BERAKHIR");
  }
  if (!res.ok) {
    const g: GalatApi = new Error((json as { error?: string }).error ?? `Gagal (${res.status})`);
    g.status = res.status;
    throw g;
  }
  // (10 Okt 2026) setelah menulis (POST/PUT/PATCH/DELETE) data simpanan terkait ditandai kedaluwarsa -> dimuat ulang di belakang saat halaman dibuka
  if (init?.method && init.method.toUpperCase() !== "GET") {
    const jalur = path.split("?")[0];
    pendengarTulis.forEach((f) => f(jalur));
  }
  return json as T;
}
