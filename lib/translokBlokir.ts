// lib/translokBlokir.ts  (murni; dipakai server dan klien)
//
// (3 Nov 2026) Aturan blokir sementara translok petugas dan alur "Ajukan unblock". Basis data: sigap_translok_blokir (SQL 20261103a).
//   blokir   : diblokir; petugas boleh mengajukan unblock
//   diajukan : menunggu persetujuan PML / Korwil / Supervisor / admin translok
//   dibuka   : disetujui; tidak memblokir lagi (baris tetap sebagai riwayat; bisa diblokir lagi)
// Ditolak = kembali ke "blokir" dengan catatan penolakan.

export type StatusBlokir = "blokir" | "diajukan" | "dibuka";
export type BarisBlokir = {
  id: number;
  kegiatan_id: number;
  akun_id: number;
  status: StatusBlokir;
  alasan_blokir: string | null;
  diblokir_oleh: string | null;
  diblokir_at: string | null;
  alasan_unblock: string | null;
  diajukan_at: string | null;
  keputusan_oleh: string | null;
  keputusan_at: string | null;
  keputusan_catatan: string | null;
};

export const MIN_ALASAN = 5;
export const MAKS_ALASAN = 500;
export const MAKS_CATATAN = 300;

export const KOLOM_BLOKIR = "id, kegiatan_id, akun_id, status, alasan_blokir, diblokir_oleh, diblokir_at, alasan_unblock, diajukan_at, keputusan_oleh, keputusan_at, keputusan_catatan";

export function statusValid(s: unknown): s is StatusBlokir {
  return s === "blokir" || s === "diajukan" || s === "dibuka";
}

/** Memblokir akses? Hanya "blokir" dan "diajukan". */
export function memblokir(status: unknown): boolean {
  return status === "blokir" || status === "diajukan";
}
export const bolehAjukan = (status: unknown): boolean => status === "blokir";
export const bolehPutuskan = (status: unknown): boolean => status === "diajukan";

export const PESAN_DIBLOKIR = "Akses translok Anda diblokir sementara. Buka halaman Transport Lokal dan ajukan unblock.";

/** Rapikan teks bebas (spasi ganda, panjang). */
export function rapikanTeks(v: unknown, maks: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, maks) : "";
}

export type HasilCek = { ok: true; alasan: string } | { ok: false; pesan: string };
export function cekAlasan(v: unknown): HasilCek {
  const a = rapikanTeks(v, MAKS_ALASAN);
  return a.length < MIN_ALASAN ? { ok: false, pesan: `Tulis alasan pengajuan minimal ${MIN_ALASAN} huruf.` } : { ok: true, alasan: a };
}

/** Teks status untuk petugas yang diblokir (modal). */
export type TeksModal = { judul: string; isi: string; nada: "merah" | "emas"; boleh_ajukan: boolean };
export function teksModalPetugas(b: Pick<BarisBlokir, "status" | "alasan_blokir" | "keputusan_catatan" | "keputusan_oleh" | "keputusan_at">): TeksModal | null {
  if (b.status === "diajukan") {
    return { judul: "Menunggu persetujuan", isi: "Pengajuan unblock Anda sudah dikirim ke PML, Korwil, dan Supervisor. Halaman terbuka setelah salah satunya menyetujui.", nada: "emas", boleh_ajukan: false };
  }
  if (b.status === "blokir") {
    const tolak = b.keputusan_at && b.keputusan_catatan !== undefined && b.keputusan_oleh ? ` Pengajuan sebelumnya ditolak${b.keputusan_oleh ? ` oleh ${b.keputusan_oleh}` : ""}${b.keputusan_catatan ? `: ${b.keputusan_catatan}` : "."}` : "";
    return { judul: "Translok diblokir sementara", isi: `${b.alasan_blokir?.trim() || "Akses translok Anda diblokir sementara oleh admin."}${tolak}`, nada: "merah", boleh_ajukan: true };
  }
  return null;
}

/** Penyetuju sah: PML / Korwil / Supervisor / admin. Himpunan akun id; pengaju sendiri tidak boleh menyetujui dirinya. */
export function bolehMenyetujui(penyetuju: ReadonlySet<number> | readonly number[], akunId: number, pengajuId: number): boolean {
  if (akunId === pengajuId) return false;
  const s = penyetuju instanceof Set ? penyetuju : new Set(penyetuju);
  return s.has(akunId);
}

/** Gabung penyetuju dari beberapa sumber: unik, bilangan bulat positif, tanpa pengaju. */
export function gabungPenyetuju(sumber: ReadonlyArray<ReadonlyArray<number | null | undefined>>, pengajuId: number): number[] {
  const s = new Set<number>();
  for (const d of sumber) for (const v of d) if (typeof v === "number" && Number.isInteger(v) && v > 0 && v !== pengajuId) s.add(v);
  return [...s].sort((a, b) => a - b);
}

export type PermintaanTampil = { id: number; kegiatan_id: number; akun_id: number; nama: string; peran: string | null; alasan: string; diajukan_at: string | null };

/** Terlama dulu (yang menunggu paling lama didahulukan). */
export function urutkanPermintaan<T extends { diajukan_at: string | null; id: number }>(daftar: readonly T[]): T[] {
  return [...daftar].sort((a, b) => (a.diajukan_at ?? "").localeCompare(b.diajukan_at ?? "") || a.id - b.id);
}

/** "5 menit lalu" / "2 jam lalu" / "3 hari lalu". */
export function umurTeks(iso: string | null, sekarangMs: number): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const menit = Math.max(0, Math.floor((sekarangMs - t) / 60_000));
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit lalu`;
  if (menit < 1440) return `${Math.floor(menit / 60)} jam lalu`;
  return `${Math.floor(menit / 1440)} hari lalu`;
}

export function pesanPengajuan(nama: string, kegiatan: string): { judul: string; isi: string } {
  const n = rapikanTeks(nama, 60) || "Petugas";
  return { judul: "Permintaan unblock translok", isi: `${n} meminta translok dibuka kembali${kegiatan ? ` (${rapikanTeks(kegiatan, 80)})` : ""}. Buka tab Hari ini untuk menyetujui atau menolak.` };
}
export function pesanKeputusan(setuju: boolean, oleh: string): { judul: string; isi: string } {
  const o = rapikanTeks(oleh, 60) || "Atasan";
  return setuju
    ? { judul: "Translok dibuka kembali", isi: `${o} menyetujui pengajuan Anda. Halaman translok bisa dipakai lagi.` }
    : { judul: "Pengajuan unblock ditolak", isi: `${o} belum dapat membuka translok Anda. Hubungi PML atau admin.` };
}

// ---------- Rantai atasan (murni) ----------
// Atasan petugas = rantai ke atas (PPL -> PML -> Korwil). `atasanDari` memetakan simpul -> atasannya (null/undefined = puncak). Aman dari siklus.

/** Semua atasan (bertingkat) dari `mulai`, terdekat dulu. */
export function rantaiAtasan(mulai: number, atasanDari: ReadonlyMap<number, number | null | undefined>, batas = 12): number[] {
  const hasil: number[] = [];
  const lihat = new Set<number>([mulai]);
  let id = atasanDari.get(mulai);
  while (typeof id === "number" && !lihat.has(id) && hasil.length < batas) {
    hasil.push(id);
    lihat.add(id);
    id = atasanDari.get(id);
  }
  return hasil;
}

/** Semua bawahan (bertingkat) dari `induk`. */
export function turunanDari(induk: number, atasanDari: ReadonlyMap<number, number | null | undefined>): number[] {
  const anak = new Map<number, number[]>();
  for (const [k, a] of atasanDari) if (typeof a === "number") anak.set(a, [...(anak.get(a) ?? []), k]);
  const hasil: number[] = [];
  const lihat = new Set<number>([induk]);
  const antre = [induk];
  while (antre.length) {
    const x = antre.shift() as number;
    for (const c of anak.get(x) ?? []) if (!lihat.has(c)) { lihat.add(c); hasil.push(c); antre.push(c); }
  }
  return hasil.sort((a, b) => a - b);
}

/** Label peran untuk daftar: "PPL", "PML", ... */
export const labelPeran = (peran: string | null | undefined): string => (peran ? peran.toUpperCase() : "");

/** Urut daftar bawahan: yang bermasalah dulu (diajukan, lalu blokir), lalu nama. */
export function urutkanBawahan<T extends { status: StatusBlokir | null; nama: string }>(daftar: readonly T[]): T[] {
  const bobot = (s: StatusBlokir | null) => (s === "diajukan" ? 0 : s === "blokir" ? 1 : s === "dibuka" ? 2 : 3);
  return [...daftar].sort((a, b) => bobot(a.status) - bobot(b.status) || a.nama.localeCompare(b.nama, "id"));
}

export function pesanBlokir(oleh: string): { judul: string; isi: string } {
  return { judul: "Translok diblokir sementara", isi: `${rapikanTeks(oleh, 60) || "Atasan"} memblokir translok Anda sementara. Buka halaman translok dan ajukan unblock.` };
}
