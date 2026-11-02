// lib/sigapMateri.ts  (murni; dipakai server dan klien)
//
// (2 Nov 2026) Tahap C: materi tab Instrumen -- video belajar (wajib ditonton sampai habis) dan tautan instrumen (wajib dibuka).
// Pelacakan video SEBAIK MUNGKIN: yang dihitung hanya detik yang benar-benar DIPUTAR (bagian yang dilompati tidak dihitung), kecepatan maks 1,25x, dan server
// membatasi laju penambahan detik terhadap waktu nyata. Selesai bila detik unik >= 95% durasi dan bagian akhir video tercapai. Cadangan: "Saya sudah menonton" (diberi tanda manual).
// Yang dibuktikan: video DIPUTAR, bukan benar-benar dilihat.

export type JenisMateri = "video" | "tautan";
export type Segmen = [number, number];

export const AMBANG_SELESAI = 0.95; // 95% detik unik
export const TOLERANSI_AKHIR = 3; // bagian akhir tercapai bila segmen berakhir dalam 3 detik dari durasi
export const LAJU_MAKS = 1.25; // kecepatan putar tertinggi yang dihitung
export const MARGIN_LAPOR = 8; // detik kelonggaran terhadap waktu nyata (jeda jaringan, pembulatan)
export const BATAS_PERTAMA = 30; // laporan pertama (belum ada pembanding waktu): paling banyak 30 detik
export const MAKS_SEGMEN_LAPORAN = 6;
export const MAKS_SEGMEN_SIMPAN = 200;
export const MAKS_JUDUL = 160;
export const MIN_JUDUL = 3;
export const MAKS_URL = 500;
export const DURASI_MIN = 5;
export const DURASI_MAKS = 14_400;

/** ID video YouTube (11 karakter) dari berbagai bentuk tautan: youtu.be, watch?v=, embed, shorts, live, m.youtube, youtube-nocookie. Selain itu null. */
export function idYoutube(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, "");
  const sah = (s: string | null | undefined) => (s && /^[A-Za-z0-9_-]{11}$/.test(s) ? s : null);
  if (host === "youtu.be") return sah(u.pathname.split("/")[1]);
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (u.pathname === "/watch") return sah(u.searchParams.get("v"));
    const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([^/?#]+)/);
    if (m) return sah(m[2]);
  }
  return null;
}

export type MasukanMateri = { id: number | null; jenis: JenisMateri; judul: string; url: string; youtube_id: string | null; durasi_detik: number | null; wajib: boolean; urutan: number };

/** Memeriksa isian pengelola. Video harus tautan YouTube (dilacak lewat pemutar YouTube); tautan boleh alamat web apa pun (http/https). */
export function periksaMateri(x: unknown): { ok: true; materi: MasukanMateri } | { ok: false; pesan: string } {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const jenis = o.jenis;
  if (jenis !== "video" && jenis !== "tautan") return { ok: false, pesan: "Pilih jenis: video atau tautan." };
  const judul = typeof o.judul === "string" ? o.judul.replace(/\s+/g, " ").trim() : "";
  if (judul.length < MIN_JUDUL) return { ok: false, pesan: `Judul minimal ${MIN_JUDUL} huruf.` };
  if (judul.length > MAKS_JUDUL) return { ok: false, pesan: `Judul maksimal ${MAKS_JUDUL} huruf.` };
  const url = typeof o.url === "string" ? o.url.trim() : "";
  if (!url) return { ok: false, pesan: "Tautan wajib diisi." };
  if (url.length > MAKS_URL) return { ok: false, pesan: `Tautan terlalu panjang (maksimal ${MAKS_URL} huruf).` };
  let aman = false;
  try {
    const u = new URL(url);
    aman = u.protocol === "https:" || u.protocol === "http:";
  } catch {
    aman = false;
  }
  if (!aman) return { ok: false, pesan: "Tautan harus diawali http:// atau https://." };
  let youtube: string | null = null;
  if (jenis === "video") {
    youtube = idYoutube(url);
    if (!youtube) return { ok: false, pesan: "Video harus berupa tautan YouTube (youtu.be/… atau youtube.com/watch?v=…)." };
  }
  let durasi: number | null = null;
  if (o.durasi_detik !== undefined && o.durasi_detik !== null && o.durasi_detik !== "") {
    const d = Number(o.durasi_detik);
    if (!Number.isFinite(d) || d < DURASI_MIN || d > DURASI_MAKS) return { ok: false, pesan: `Durasi harus antara ${DURASI_MIN} detik dan ${DURASI_MAKS / 3600} jam.` };
    durasi = Math.round(d);
  }
  const urutan = Number.isInteger(o.urutan) && (o.urutan as number) >= 0 && (o.urutan as number) <= 9999 ? (o.urutan as number) : 0;
  const id = Number.isInteger(o.id) && (o.id as number) > 0 ? (o.id as number) : null;
  return { ok: true, materi: { id, jenis, judul, url, youtube_id: youtube, durasi_detik: jenis === "video" ? durasi : null, wajib: o.wajib === true, urutan } };
}

// ---------- segmen ----------

const bulat = (n: number) => Math.round(n * 10) / 10;

/** Menggabungkan segmen yang bersentuhan / tumpang tindih (celah <= 1 detik dianggap menyambung). Hasil terurut. */
export function gabungSegmen(daftar: readonly Segmen[]): Segmen[] {
  const urut = daftar
    .filter((s) => Array.isArray(s) && Number.isFinite(s[0]) && Number.isFinite(s[1]) && s[1] > s[0])
    .map((s) => [Math.max(0, s[0]), s[1]] as Segmen)
    .sort((a, b) => a[0] - b[0]);
  const hasil: Segmen[] = [];
  for (const s of urut) {
    const akhir = hasil[hasil.length - 1];
    if (akhir && s[0] <= akhir[1] + 1) akhir[1] = Math.max(akhir[1], s[1]);
    else hasil.push([s[0], s[1]]);
  }
  return hasil.map((s) => [bulat(s[0]), bulat(s[1])] as Segmen);
}

export function detikUnik(segmen: readonly Segmen[]): number {
  return Math.floor(gabungSegmen(segmen).reduce((t, s) => t + (s[1] - s[0]), 0));
}

/** Membaca kolom jsonb `segmen` secara aman. */
export function bacaSegmen(x: unknown): Segmen[] {
  if (!Array.isArray(x)) return [];
  const hasil: Segmen[] = [];
  for (const s of x) if (Array.isArray(s) && s.length === 2 && typeof s[0] === "number" && typeof s[1] === "number") hasil.push([s[0], s[1]]);
  return gabungSegmen(hasil).slice(0, MAKS_SEGMEN_SIMPAN);
}

export type Progres = { segmen: Segmen[]; detik_unik: number; selesai_at: string | null; selesai_manual: boolean; putar_terakhir_at: string | null };
export const PROGRES_KOSONG = (): Progres => ({ segmen: [], detik_unik: 0, selesai_at: null, selesai_manual: false, putar_terakhir_at: null });

export type Laporan = { materi_id: number; segmen: Segmen[]; durasi: number | null };

/** Memeriksa isi laporan putar dari klien: paling banyak MAKS_SEGMEN_LAPORAN segmen, tiap segmen valid dan tidak lebih panjang dari BATAS_PERTAMA detik. */
export function periksaLaporan(x: unknown): { ok: true; laporan: Laporan } | { ok: false; pesan: string } {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const id = Number(o.materi_id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, pesan: "Materi tidak dikenal." };
  if (!Array.isArray(o.segmen) || o.segmen.length === 0) return { ok: false, pesan: "Tidak ada bagian yang dilaporkan." };
  if (o.segmen.length > MAKS_SEGMEN_LAPORAN) return { ok: false, pesan: "Laporan terlalu banyak bagian." };
  const segmen: Segmen[] = [];
  for (const s of o.segmen) {
    if (!Array.isArray(s) || s.length !== 2) return { ok: false, pesan: "Bagian laporan tidak valid." };
    const a = Number(s[0]);
    const b = Number(s[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b <= a || b > DURASI_MAKS) return { ok: false, pesan: "Bagian laporan tidak valid." };
    if (b - a > BATAS_PERTAMA) return { ok: false, pesan: "Bagian laporan terlalu panjang." };
    segmen.push([a, b]);
  }
  let durasi: number | null = null;
  if (o.durasi !== undefined && o.durasi !== null) {
    const d = Number(o.durasi);
    if (!Number.isFinite(d) || d < DURASI_MIN || d > DURASI_MAKS) return { ok: false, pesan: "Durasi video tidak valid." };
    durasi = Math.round(d);
  }
  return { ok: true, laporan: { materi_id: id, segmen, durasi } };
}

/** Video dianggap selesai bila detik unik >= 95% durasi DAN bagian akhir (3 detik terakhir) pernah diputar. */
export function videoSelesai(segmen: readonly Segmen[], durasi: number | null): boolean {
  if (!durasi || durasi < DURASI_MIN) return false;
  const g = gabungSegmen(segmen);
  if (g.length === 0) return false;
  return detikUnik(g) >= Math.ceil(durasi * AMBANG_SELESAI) && g[g.length - 1][1] >= durasi - TOLERANSI_AKHIR;
}

export type HasilLapor = { progres: Progres; ditambah: number; dipangkas: boolean; selesai_baru: boolean };

/**
 * Menerapkan laporan putar ke progres. Pengaman:
 *  - tiap bagian dipotong sampai durasi (bila durasi diketahui);
 *  - penambahan detik unik dibatasi LAJU_MAKS x waktu nyata sejak laporan terakhir (+ MARGIN_LAPOR); laporan pertama paling banyak BATAS_PERTAMA detik;
 *  - bagian yang melampaui batas dipangkas dari akhirnya (dipangkas = true).
 * Progres yang sudah selesai tidak berubah selain waktu laporan.
 */
export function terapkanLaporan(lama: Progres, lap: Laporan, durasi: number | null, sekarang: number): HasilLapor {
  if (lama.selesai_at) return { progres: lama, ditambah: 0, dipangkas: false, selesai_baru: false };
  const terakhir = lama.putar_terakhir_at ? new Date(lama.putar_terakhir_at).getTime() : NaN;
  const jatah = Number.isFinite(terakhir) ? Math.max(0, ((sekarang - terakhir) / 1000) * LAJU_MAKS) + MARGIN_LAPOR : BATAS_PERTAMA;
  let sisa = jatah;
  let segmen = gabungSegmen(lama.segmen);
  let dipangkas = false;
  let ditambah = 0;
  for (const s of lap.segmen) {
    let [a, b] = s;
    if (durasi) {
      if (a >= durasi) continue;
      b = Math.min(b, durasi);
    }
    if (b <= a) continue;
    const sebelum = detikUnik(segmen);
    let kandidat = gabungSegmen([...segmen, [a, b]]);
    const tambah = detikUnik(kandidat) - sebelum;
    if (tambah > sisa) {
      // pangkas bagian ini sampai tepat habis jatah
      const panjangBoleh = Math.max(0, (b - a) - (tambah - sisa));
      dipangkas = true;
      if (panjangBoleh < 1) continue;
      kandidat = gabungSegmen([...segmen, [a, a + panjangBoleh]]);
    }
    const baru = detikUnik(kandidat) - sebelum;
    sisa -= baru;
    ditambah += baru;
    segmen = kandidat;
  }
  if (segmen.length > MAKS_SEGMEN_SIMPAN) segmen = segmen.slice(0, MAKS_SEGMEN_SIMPAN);
  const tuntas = videoSelesai(segmen, durasi);
  const iso = new Date(sekarang).toISOString();
  return {
    progres: { segmen, detik_unik: detikUnik(segmen), selesai_at: tuntas ? iso : null, selesai_manual: false, putar_terakhir_at: ditambah > 0 || !lama.putar_terakhir_at ? iso : lama.putar_terakhir_at },
    ditambah,
    dipangkas,
    selesai_baru: tuntas,
  };
}

// ---------- ringkasan ----------

export type MateriRingkas = { id: number; jenis: JenisMateri; wajib: boolean; durasi_detik: number | null };

export function persenProgres(m: MateriRingkas, p: Progres | null | undefined): number {
  if (!p) return 0;
  if (p.selesai_at) return 100;
  if (m.jenis !== "video" || !m.durasi_detik) return 0;
  return Math.min(99, Math.floor((p.detik_unik / m.durasi_detik) * 100));
}

export type RingkasMateri = {
  wajib_total: number;
  wajib_selesai: number;
  /** jumlah materi wajib yang belum selesai (video belum tuntas + tautan belum dibuka) */
  belum: number;
  video_wajib_ada: boolean;
  video_wajib_tuntas: boolean;
  /** ada materi wajib yang diselesaikan dengan tombol manual */
  ada_manual: boolean;
};

export function ringkasMateri(materi: readonly MateriRingkas[], progres: ReadonlyMap<number, Progres> | Record<number, Progres | undefined>): RingkasMateri {
  const ambil = (id: number): Progres | undefined => (progres instanceof Map ? progres.get(id) : (progres as Record<number, Progres | undefined>)[id]);
  const wajib = materi.filter((m) => m.wajib);
  const selesai = wajib.filter((m) => !!ambil(m.id)?.selesai_at);
  const videoWajib = wajib.filter((m) => m.jenis === "video");
  return {
    wajib_total: wajib.length,
    wajib_selesai: selesai.length,
    belum: wajib.length - selesai.length,
    video_wajib_ada: videoWajib.length > 0,
    video_wajib_tuntas: videoWajib.every((m) => !!ambil(m.id)?.selesai_at),
    ada_manual: wajib.some((m) => !!ambil(m.id)?.selesai_manual),
  };
}

export const teksSelesaiManual = "Tandai manual: tidak terbukti ditonton penuh; diberi tanda di Monitoring.";
