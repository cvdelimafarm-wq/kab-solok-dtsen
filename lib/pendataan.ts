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
export type BarisKk = {
  idsubsls: string;
  nama_kk: string;
  anggota_lain: string | null;
  patokan: string | null;
  lat: number | null;
  lng: number | null;
  /** hanya dari ekspor FASIH-SM: ID penugasan (kunci unggah ulang), nomor urut DTSEN, kode keberadaan awal */
  sumber_id?: string | null;
  no_urut?: number | null;
  keberadaan_awal?: number | null;
};

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
  const s = String(x ?? "").trim().replace(/^'/, ""); // ekspor FASIH-SM memberi apostrof di depan agar Excel tidak mengubahnya jadi angka
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
  const baris: BarisKk = { idsubsls: sub, nama_kk: nama, anggota_lain: anggota || null, patokan: patokan || null, lat, lng };
  if (!kosong(raw.sumber_id)) {
    const sid = String(raw.sumber_id).trim();
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(sid)) return { ok: false, pesan: "ID penugasan tidak sah." };
    baris.sumber_id = sid;
  }
  if (!kosong(raw.no_urut)) {
    const n = Number(raw.no_urut);
    if (Number.isInteger(n) && n >= 0 && n < 100000) baris.no_urut = n;
  }
  if (!kosong(raw.keberadaan_awal)) {
    const n = Number(raw.keberadaan_awal);
    if (Number.isInteger(n) && n >= 0 && n <= 9) baris.keberadaan_awal = n;
  }
  return { ok: true, baris };
}

/** Koordinat di dalam kotak Kabupaten Solok? */
export const dalamKotak = (lat: number, lng: number): boolean => lat <= LAT_MAX && lat >= LAT_MIN && lng >= LNG_MIN && lng <= LNG_MAX;

/** Kunci pencegah unggah ganda (berkas yang sama diunggah dua kali). */
export function kunciBaris(b: Pick<BarisKk, "idsubsls" | "nama_kk" | "anggota_lain" | "lat" | "lng">): string {
  const n = (s: string | null) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const k = (x: number | null) => (x === null ? "" : x.toFixed(6));
  return [b.idsubsls, n(b.nama_kk), n(b.anggota_lain), k(b.lat), k(b.lng)].join("|");
}

const normKolom = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");
const ALIAS: Record<"idsubsls" | "nama_kk" | "anggota_lain" | "patokan" | "lat" | "lng", string[]> = {
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

// ------------------------------------------------------------------ ekspor FASIH-SM (CSV/Excel "1303 - Pendataan")
// Keputusan user (11 Okt 2026): sistem menyaring otomatis -- hanya Sub SLS sampel (daftar awal) dan Keberadaan_Keluarga 1 (Ditemukan), 2 (Baru),
// 5 (Tidak dapat ditemui sampai akhir pendataan), 6 (Keluarga Khusus). Kolom yang dipakai HANYA yang dibutuhkan lembar; NIK, Nomor KK, tanggal lahir,
// pendapatan, dan kondisi rumah tidak pernah dibaca ke dalam hasil (dibuang di peramban sebelum dikirim).
export const KEBERADAAN_DIAMBIL = [1, 2, 5, 6] as const;
export const LABEL_KEBERADAAN: Record<number, string> = {
  0: "Tidak ditemukan (STOP)",
  1: "Ditemukan",
  2: "Baru",
  3: "Status 3",
  4: "Status 4",
  5: "Tidak dapat ditemui sampai akhir pendataan",
  6: "Keluarga khusus",
};

/** Parser CSV baku (RFC 4180): tanda kutip ganda, koma, dan baris baru di dalam kolom. */
export function parseCsv(teksCsv: string): string[][] {
  const t = teksCsv.replace(/^\uFEFF/, "");
  const out: string[][] = [];
  let baris: string[] = [];
  let sel = "";
  let kutip = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (kutip) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          sel += '"';
          i++;
        } else kutip = false;
      } else sel += c;
    } else if (c === '"' && sel === "") kutip = true;
    else if (c === ",") {
      baris.push(sel);
      sel = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      baris.push(sel);
      sel = "";
      if (baris.length > 1 || baris[0] !== "") out.push(baris);
      baris = [];
    } else sel += c;
  }
  if (sel !== "" || baris.length > 0) {
    baris.push(sel);
    out.push(baris);
  }
  return out;
}

/**
 * Baca CSV ekspor FASIH-SM menjadi daftar baris berjudul. Ekspor ini tidak selalu CSV baku: baris yang kolom catatannya memakai tanda kutip dibungkus
 * satu kali lagi (seluruh baris di dalam "..." dan tanda kutip dalamnya digandakan), sehingga pembaca CSV biasa melihatnya sebagai satu kolom.
 * Urutan: coba baku dulu; bila jumlah kolom tidak seragam, buka bungkus baris yang diawali tanda kutip lalu baca ulang.
 */
export function bacaCsvFasih(teksCsv: string): { judul: string[]; baris: Record<string, string>[] } {
  const t = teksCsv.replace(/^\uFEFF/, "");
  const baku = parseCsv(t);
  if (baku.length === 0) return { judul: [], baris: [] };
  const judul = baku[0].map((h) => h.trim());
  let rekaman: string[][] = baku.slice(1);
  if (rekaman.some((r) => r.length !== judul.length)) {
    // rekaman baru dimulai pada baris yang diawali nomor urut (opsional bertanda kutip pembungkus); baris lain = lanjutan kolom bergaris baru
    const fisik = t.split(/\r\n|\n|\r/);
    const mulai = /^"?\d+,'?\d{16},/;
    const grup: string[] = [];
    for (const ln of fisik.slice(1)) {
      if (ln.trim() === "") continue;
      if (mulai.test(ln) || grup.length === 0) grup.push(ln);
      else grup[grup.length - 1] += "\n" + ln;
    }
    rekaman = grup.map((ln) => {
      let x = ln;
      if (x.startsWith('"')) {
        x = x.slice(1);
        if (x.endsWith('"')) x = x.slice(0, -1);
        x = x.replace(/""/g, '"');
      }
      return parseCsv(x)[0] ?? [];
    });
  }
  const baris = rekaman.filter((r) => r.length === judul.length).map((r) => Object.fromEntries(judul.map((h, i) => [h, r[i]])));
  return { judul, baris };
}

/** Berkas ini ekspor FASIH-SM? (judul kolom khasnya) */
export const adalahFasih = (judul: string[]): boolean => {
  const h = new Set(judul.map((x) => x.trim().toUpperCase()));
  return h.has("IDSUBSLS") && h.has("ASSIGNMENT_ID");
};

/** Kode Keberadaan_Keluarga dari teks seperti "1. Ditemukan" / "0. Tidak Ditemukan (STOP)"; null bila tak terbaca. Awalan angka didahulukan karena "Tidak Ditemukan" memuat kata "Ditemukan". */
export function kodeKeberadaan(x: unknown): number | null {
  const s = String(x ?? "").trim();
  const m = s.match(/^(\d+)\s*[.)-]/);
  if (m) return Number(m[1]);
  const n = s.toLowerCase().replace(/\s+/g, " ");
  if (n === "ditemukan") return 1;
  if (n === "baru") return 2;
  if (n === "tidak dapat ditemui sampai akhir pendataan") return 5;
  if (n === "keluarga khusus") return 6;
  if (n.startsWith("tidak ditemukan")) return 0;
  return null;
}

/** Geotag seperti `'-1.3011193,100.9893264` -> {lat,lng}; null bila kosong; "salah" bila bukan dua angka. */
export function bacaGeotag(x: unknown): { lat: number; lng: number } | null | "salah" {
  const s = String(x ?? "").replace(/['"\s]/g, "");
  if (!s) return null;
  const p = s.split(/[,;]/);
  if (p.length !== 2) return "salah";
  const lat = Number(p[0]);
  const lng = Number(p[1]);
  return Number.isFinite(lat) && Number.isFinite(lng) && p[0] !== "" && p[1] !== "" ? { lat, lng } : "salah";
}

export type HasilFasih =
  | { jenis: "terima"; mentah: Record<string, unknown>; peringatan: string | null; keberadaan: number }
  | { jenis: "lewati"; keberadaan: number | null }
  | { jenis: "salah"; pesan: string };

const ambil = (r: Record<string, unknown>, k: string): unknown => {
  const kunci = Object.keys(r).find((x) => x.trim().toUpperCase() === k.toUpperCase());
  return kunci === undefined ? undefined : r[kunci];
};

/**
 * Satu baris ekspor FASIH-SM -> isian siap `periksaBarisKk`. Status keberadaan disaring DULU (baris STOP tidak dihitung sebagai salah).
 * Koordinat rusak / di luar Kab. Solok tidak menggugurkan KK: KK tetap masuk tanpa titik, dengan peringatan.
 */
export function petakanBarisFasih(r: Record<string, unknown>): HasilFasih {
  const kode = kodeKeberadaan(ambil(r, "Keberadaan_Keluarga"));
  if (kode === null) return { jenis: "salah", pesan: "Keberadaan_Keluarga tidak terbaca." };
  if (!(KEBERADAAN_DIAMBIL as readonly number[]).includes(kode)) return { jenis: "lewati", keberadaan: kode };

  const sumber = teks(ambil(r, "ASSIGNMENT_ID"));
  if (!sumber) return { jenis: "salah", pesan: "ASSIGNMENT_ID kosong." };

  // nama: "KK / PASANGAN / ..." di Nama_Keluarga_FasihSM; Nama_Kepala_Keluarga dipakai sebagai nama KK bila ada
  const bagian = teks(ambil(r, "Nama_Keluarga_FasihSM"))
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean);
  const kk = teks(ambil(r, "Nama_Kepala_Keluarga")) || bagian[0] || "";
  const lain = bagian.filter((x) => x.toLowerCase() !== kk.toLowerCase());

  let peringatan: string | null = null;
  let lat: number | null = null;
  let lng: number | null = null;
  const g = bacaGeotag(ambil(r, "Geotag"));
  if (g === "salah") peringatan = "koordinat tidak terbaca";
  else if (g) {
    if (dalamKotak(g.lat, g.lng)) {
      lat = g.lat;
      lng = g.lng;
    } else peringatan = "koordinat di luar Kab. Solok";
  }

  const noUrut = teks(ambil(r, "Kode_Identitas")).match(/-\s*(\d+)\s*$/);
  return {
    jenis: "terima",
    keberadaan: kode,
    peringatan,
    mentah: {
      idsubsls: ambil(r, "IDSUBSLS"),
      nama_kk: kk,
      anggota_lain: lain.join("; "),
      patokan: ambil(r, "Alamat_Domisili"),
      lat,
      lng,
      sumber_id: sumber,
      no_urut: noUrut ? Number(noUrut[1]) : null,
      keberadaan_awal: kode,
    },
  };
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
  no_urut: number | null;
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
