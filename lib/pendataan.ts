// lib/pendataan.ts  (murni; dipakai server DAN klien)
//
// (11 Okt 2026) Pendataan keroyokan PPL/PML -- permintaan user. Rancangan: claude/rancangan-pendataan-keroyokan.md di Project.
// Isi: jenis hasil, palet warna PPL, validasi penandaan hasil (POST /api/portal/pendataan), validasi baris unggahan daftar KK,
// proyeksi titik ke kanvas peta (tanpa basemap), dan penghitung ringkasan monitoring.
// Aturan inti (keputusan user): HASIL TERAKHIR YANG BERLAKU menurut waktu kejadian di HP; tanpa klaim lunak "sedang didata".

export const HASIL_KK = ["terdampak", "tidak_terdampak", "tidak_ditemukan"] as const;
export type HasilKk = (typeof HASIL_KK)[number];
/** 'belum' = Urungkan (kembali ke belum didata); hanya ada di log. */
export type HasilCatat = HasilKk | "belum";

export const LABEL_HASIL: Record<HasilKk, string> = {
  terdampak: "Didata, terdampak",
  tidak_terdampak: "Didata, tidak terdampak",
  tidak_ditemukan: "Tidak ditemukan",
};
export const LABEL_PENDEK: Record<HasilKk, string> = { terdampak: "Terdampak", tidak_terdampak: "Tidak terdampak", tidak_ditemukan: "Tidak ditemukan" };

/** Warna PPL (hasil uji palet: 6 warna pertama sama dengan mockup; cadangan untuk tim lebih besar). Hanya mode terang. */
export const PPL_WARNA = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6", "#008300", "#e34948"] as const;
export const WARNA_PML = "#5b6b82";
export const WARNA_BELUM = "#aab4c3";
export const warnaIndeks = (i: number): string => PPL_WARNA[((i % PPL_WARNA.length) + PPL_WARNA.length) % PPL_WARNA.length];

export const KEGIATAN_PENDATAAN_ID = 1;
export const MAKS_BARIS_UNGGAH = 500;

// ------------------------------------------------------------------ penandaan hasil
export type IsiCatat = {
  kk_id: number;
  hasil: HasilCatat;
  alasan: string | null;
  /** waktu kejadian di HP (ISO UTC) */
  waktu: string;
  kunci: string;
  pos: { lat: number; lng: number; akurasi: number | null } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const adaHasil = (h: unknown): h is HasilCatat => h === "belum" || (HASIL_KK as readonly string[]).includes(h as string);
const angkaHingga = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

export function periksaCatat(b: unknown): { ok: true; isi: IsiCatat } | { ok: false; pesan: string } {
  if (!b || typeof b !== "object") return { ok: false, pesan: "Isian tidak terbaca." };
  const r = b as Record<string, unknown>;
  const kk = Number(r.kk_id);
  if (!Number.isInteger(kk) || kk <= 0) return { ok: false, pesan: "KK tidak dikenal." };
  if (!adaHasil(r.hasil)) return { ok: false, pesan: "Hasil pendataan tidak dikenal." };
  const kunci = typeof r.kunci === "string" ? r.kunci : "";
  if (!UUID.test(kunci)) return { ok: false, pesan: "Kunci catatan tidak sah." };
  const t = typeof r.waktu === "string" ? Date.parse(r.waktu) : NaN;
  if (!Number.isFinite(t)) return { ok: false, pesan: "Waktu kejadian tidak sah." };
  const alasanMentah = typeof r.alasan === "string" ? r.alasan.trim().replace(/\s+/g, " ") : "";
  if (alasanMentah.length > 200) return { ok: false, pesan: "Alasan terlalu panjang (maksimal 200 huruf)." };
  let pos: IsiCatat["pos"] = null;
  if (r.pos && typeof r.pos === "object") {
    const p = r.pos as Record<string, unknown>;
    const lat = angkaHingga(p.lat);
    const lng = angkaHingga(p.lng);
    if (lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) pos = { lat, lng, akurasi: angkaHingga(p.akurasi) };
  }
  return { ok: true, isi: { kk_id: kk, hasil: r.hasil, alasan: alasanMentah || null, waktu: new Date(t).toISOString(), kunci, pos } };
}

// ------------------------------------------------------------------ unggahan daftar KK
export type BarisKk = { idsubsls: string; nama_kk: string; anggota_lain: string | null; patokan: string | null; lat: number | null; lng: number | null };

// Kabupaten Solok (kab. 1303) + sedikit selisih: lintang -1,6..-0,2; bujur 100,0..101,5. Di luar itu hampir pasti salah ketik / tertukar.
const LAT_MIN = -1.6;
const LAT_MAX = -0.2;
const LNG_MIN = 100.0;
const LNG_MAX = 101.5;

const kosong = (x: unknown) => x === null || x === undefined || String(x).trim() === "";

/** Koordinat desimal; koma dianggap titik desimal. null = tidak diisi. */
function bacaKoordinat(x: unknown): number | null | "salah" {
  if (kosong(x)) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : "salah";
  const s = String(x).trim().replace(/\s+/g, "").replace(",", ".");
  if (!/^[-+]?\d{1,3}(\.\d+)?$/.test(s)) return "salah";
  const n = Number(s);
  return Number.isFinite(n) ? n : "salah";
}

const teks = (x: unknown): string => String(x ?? "").trim().replace(/\s+/g, " ");

/**
 * Kode Sub SLS: 16 digit TEKS. Sel berformat angka di Excel hanya menyimpan 15 angka bermakna (digit ke-16 jadi 0) atau berubah jadi
 * notasi ilmiah, sehingga angka ditolak -- kode bisa diam-diam bergeser ke Sub SLS lain.
 */
export function bacaKodeSub(x: unknown): string | null {
  if (typeof x === "number") return null;
  const s = String(x ?? "").trim();
  return /^\d{16}$/.test(s) ? s : null;
}

export function periksaBarisKk(raw: Record<string, unknown>): { ok: true; baris: BarisKk } | { ok: false; pesan: string } {
  const sub = bacaKodeSub(raw.idsubsls);
  if (!sub) {
    const mentah = String(raw.idsubsls ?? "").trim();
    return { ok: false, pesan: typeof raw.idsubsls === "number" || /e\+?\d/i.test(mentah) ? "Kode Sub SLS terbaca sebagai angka (rusak/dibulatkan Excel). Format kolom harus Teks, 16 digit." : "Kode Sub SLS harus 16 digit angka." };
  }
  const nama = teks(raw.nama_kk);
  if (!nama) return { ok: false, pesan: "Nama KK kosong." };
  if (nama.length > 150) return { ok: false, pesan: "Nama KK terlalu panjang (maksimal 150 huruf)." };
  const anggota = teks(raw.anggota_lain);
  if (anggota.length > 300) return { ok: false, pesan: "Nama anggota keluarga terlalu panjang (maksimal 300 huruf)." };
  const patokan = teks(raw.patokan);
  if (patokan.length > 150) return { ok: false, pesan: "Patokan alamat terlalu panjang (maksimal 150 huruf)." };
  const lat = bacaKoordinat(raw.lat);
  const lng = bacaKoordinat(raw.lng);
  if (lat === "salah" || lng === "salah") return { ok: false, pesan: "Koordinat bukan angka desimal (contoh -0.7896 dan 100.6512)." };
  if ((lat === null) !== (lng === null)) return { ok: false, pesan: "Koordinat harus lengkap: lintang dan bujur diisi bersama." };
  if (lat !== null && lng !== null) {
    if (lat > LAT_MAX || lat < LAT_MIN || lng < LNG_MIN || lng > LNG_MAX) {
      const tertukar = lng >= LAT_MIN && lng <= LAT_MAX && lat >= LNG_MIN && lat <= LNG_MAX;
      return { ok: false, pesan: tertukar ? "Koordinat di luar Kabupaten Solok: lintang dan bujur mungkin tertukar." : "Koordinat di luar Kabupaten Solok." };
    }
  }
  return { ok: true, baris: { idsubsls: sub, nama_kk: nama, anggota_lain: anggota || null, patokan: patokan || null, lat, lng } };
}

/** Kunci pencegah unggah ganda (berkas yang sama diunggah dua kali). */
export function kunciBaris(b: Pick<BarisKk, "idsubsls" | "nama_kk" | "anggota_lain" | "lat" | "lng">): string {
  const n = (s: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const k = (x: number | null) => (x === null ? "" : x.toFixed(6));
  return [b.idsubsls, n(b.nama_kk), n(b.anggota_lain), k(b.lat), k(b.lng)].join("|");
}

const normKolom = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
const ALIAS: Record<keyof Omit<BarisKk, never>, string[]> = {
  idsubsls: ["kodesubsls", "idsubsls", "kode", "kodesubsl"],
  nama_kk: ["namakk", "namakepalakeluarga", "kepalakeluarga", "nama"],
  anggota_lain: ["namaanggotakeluargalain", "anggotakeluargalain", "anggotalain", "anggota"],
  patokan: ["patokanalamat", "patokan", "alamat"],
  lat: ["latitude", "lintang", "lat"],
  lng: ["longitude", "bujur", "lng", "long"],
};

/** Petakan satu baris Excel (kunci = judul kolom apa adanya) ke kolom baku. Judul boleh bervariasi ("Nama KK (WAJIB)"). */
export function petakanBarisExcel(row: Record<string, unknown>): Record<string, unknown> {
  const per = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) per.set(normKolom(k), v);
  const hasil: Record<string, unknown> = {};
  for (const [kol, daftar] of Object.entries(ALIAS)) {
    for (const a of daftar) {
      if (per.has(a)) {
        hasil[kol] = per.get(a);
        break;
      }
    }
  }
  return hasil;
}

// ------------------------------------------------------------------ proyeksi peta (tanpa basemap)
export type Titik = { lat: number; lng: number };
export type Proyeksi = { x: (lng: number) => number; y: (lat: number) => number; lebar: number; tinggi: number; /** meter di dunia nyata per 1 satuan kanvas (untuk skala peta) */ meterPerSatuan: number };

/** Equirectangular dengan koreksi cos(lintang): titik terluar pas di kanvas lebar x tinggi dengan bantalan `pad`. */
export function buatProyeksi(titik: Titik[], lebar: number, tinggi: number, pad = 24): Proyeksi | null {
  if (titik.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const t of titik) {
    if (t.lat < minLat) minLat = t.lat;
    if (t.lat > maxLat) maxLat = t.lat;
    if (t.lng < minLng) minLng = t.lng;
    if (t.lng > maxLng) maxLng = t.lng;
  }
  const kos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180) || 1;
  // bentang minimum ~ 60 m supaya satu titik / titik berhimpit tidak membagi dengan nol
  const bentangX = Math.max((maxLng - minLng) * kos, 0.0006);
  const bentangY = Math.max(maxLat - minLat, 0.0006);
  const skala = Math.min((lebar - 2 * pad) / bentangX, (tinggi - 2 * pad) / bentangY);
  const offX = (lebar - bentangX * skala) / 2;
  const offY = (tinggi - bentangY * skala) / 2;
  return {
    lebar,
    tinggi,
    meterPerSatuan: 111320 / skala,
    x: (lng) => offX + (lng - minLng) * kos * skala,
    y: (lat) => offY + (maxLat - lat) * skala,
  };
}

/** Jarak garis lurus (meter), cukup untuk mengurutkan "terdekat dari saya". */
export function jarakMeter(a: Titik, b: Titik): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ------------------------------------------------------------------ ringkasan monitoring
/** Baris dari fungsi bencana_pendataan_ringkas: hasil null = belum didata. */
export type BarisRingkas = { idsubsls: string; ppl_akun_id: number | null; hasil: HasilKk | null; jumlah: number; hari_ini: number };

// ------------------------------------------------------------------ bentuk data API (dipakai server & klien)
export const API_PENDATAAN = "/api/portal/pendataan";
export const pathKkSub = (idsubsls: string) => `${API_PENDATAAN}?sub=${idsubsls}`;

export type Anggota = { akun_id: number; nama: string; peran: "pml" | "ppl"; indeks: number };
export type SubTim = { idsubsls: string; kecamatan: string; nagari: string; sls: string; sub_sls: string };
export type KkLembar = {
  id: number;
  nama_kk: string;
  anggota_lain: string | null;
  patokan: string | null;
  lat: number | null;
  lng: number | null;
  hasil: HasilKk | null;
  alasan: string | null;
  ppl_akun_id: number | null;
  status_at: string | null;
};
export type DataTimPendataan = { sekarang: string; saya: { akun_id: number; peran: "pml" | "ppl" }; pml: { id: number; nama: string }; anggota: Anggota[]; sub: SubTim[]; ringkas: BarisRingkas[] };
export type DataKkSub = { sekarang: string; idsubsls: string; kk: KkLembar[] };


export type Hitung = { terdampak: number; tidak_terdampak: number; tidak_ditemukan: number };
export type RingkasSub = { total: number; belum: number; didata: number; total_hasil: Hitung; hari_ini: Hitung };
export type RingkasPpl = { akun_id: number; total: Hitung; hari_ini: Hitung; didata: number; didata_hari_ini: number; per_sub: Record<string, { total: Hitung; hari_ini: Hitung; didata: number }> };

const nol = (): Hitung => ({ terdampak: 0, tidak_terdampak: 0, tidak_ditemukan: 0 });
export const jumlahHitung = (h: Hitung) => h.terdampak + h.tidak_terdampak + h.tidak_ditemukan;

export function ringkasPerSub(baris: BarisRingkas[]): Record<string, RingkasSub> {
  const out: Record<string, RingkasSub> = {};
  for (const b of baris) {
    const s = (out[b.idsubsls] ??= { total: 0, belum: 0, didata: 0, total_hasil: nol(), hari_ini: nol() });
    s.total += b.jumlah;
    if (b.hasil === null) {
      s.belum += b.jumlah;
    } else {
      s.total_hasil[b.hasil] += b.jumlah;
      s.hari_ini[b.hasil] += b.hari_ini;
      s.didata += b.jumlah;
    }
  }
  return out;
}

export function ringkasPerPpl(baris: BarisRingkas[]): Record<number, RingkasPpl> {
  const out: Record<number, RingkasPpl> = {};
  for (const b of baris) {
    if (b.hasil === null || b.ppl_akun_id === null) continue;
    const p = (out[b.ppl_akun_id] ??= { akun_id: b.ppl_akun_id, total: nol(), hari_ini: nol(), didata: 0, didata_hari_ini: 0, per_sub: {} });
    p.total[b.hasil] += b.jumlah;
    p.hari_ini[b.hasil] += b.hari_ini;
    p.didata += b.jumlah;
    p.didata_hari_ini += b.hari_ini;
    const s = (p.per_sub[b.idsubsls] ??= { total: nol(), hari_ini: nol(), didata: 0 });
    s.total[b.hasil] += b.jumlah;
    s.hari_ini[b.hasil] += b.hari_ini;
    s.didata += b.jumlah;
  }
  return out;
}
