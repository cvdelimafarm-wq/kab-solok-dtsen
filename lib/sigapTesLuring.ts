// lib/sigapTesLuring.ts
//
// (14 Nov 2026, luring langkah 3b; keputusan Iqbal 14 Nov) Pretest/posttest dikerjakan TANPA SINYAL:
//  * Soal (TANPA kunci jawaban) diunduh ke HP sejak H-1 saat peserta bersinyal, dalam keadaan TERSANDI.
//  * Instruktur menyebutkan SANDI A di kelas; peserta mengetiknya, HP membuka soal tanpa sinyal.
//  * Pembahasan TIDAK diunduh: tetap pola lama (terbuka dari server saat tes selesai; tanpa sinyal = menunggu sinyal).
//  * Jawaban dan cap waktu dikirim saat ada sinyal, paling lambat 24 jam sesudah batas waktu (BATAS_TERTAHAN_JAM).
// Sandi: kata-kata + angka, mudah diucapkan, sulit ditebak. Penyandian: PBKDF2-SHA256 (ITERASI) -> AES-256-GCM, memakai WebCrypto
// (sama di peramban dan Node 20). Berkas ini murni (tanpa basis data); dipakai server (menyandikan) dan HP (membuka).

export const ITERASI = 210_000;
export const BATAS_TERTAHAN_JAM = 24; // PENGATURAN (keputusan Iqbal 14 Nov): jawaban luring diterima s.d. 24 jam sesudah batas waktu
export const UNDUH_SEJAK_JAM = 24; // H-1: paket soal boleh diunduh sejak 24 jam sebelum tes dibuka

// Kata pendek yang mudah diucapkan di kelas. 64 kata -> 2 kata + 3 angka = 64 x 64 x 900 ≈ 3,7 juta kemungkinan; tiap tebakan memerlukan
// PBKDF2 210.000 putaran. Perkiraan jujur: laptop/HP biasa (puluhan tebakan per detik) butuh berhari-hari; komputer dengan kartu grafis khusus dan
// keahlian khusus bisa jauh lebih cepat (puluhan menit). Risiko yang diterima: paket hanya berguna sebelum tes dimulai (H-1 s.d. hari H) dan isinya
// soal TANPA kunci jawaban. Sandi baru dibuat per tes; mengganti sandi = paket lama tidak bisa dibuka lagi.
const KATA = [
  "SAWAH", "PADI", "JAGUNG", "KOPI", "TEH", "CABAI", "BAWANG", "TOMAT", "SAYUR", "BUAH", "PISANG", "MANGGA", "DURIAN", "MARKISA", "ALPUKAT", "JERUK",
  "GUNUNG", "DANAU", "SUNGAI", "BUKIT", "LEMBAH", "RIMBA", "TELAGA", "AWAN", "HUJAN", "PELANGI", "BINTANG", "BULAN", "SURYA", "ANGIN", "EMBUN", "KABUT",
  "RUMAH", "JEMBATAN", "PASAR", "SURAU", "LUMBUNG", "BENDUNG", "PEMATANG", "KEBUN", "LADANG", "KOLAM", "TAMAN", "BALAI", "LAPAU", "RANGKIANG", "TABUH", "GONJONG",
  "ELANG", "MERPATI", "KERBAU", "KUDA", "RUSA", "HARIMAU", "BELIBIS", "KENARI", "MERAK", "KIJANG", "BANGAU", "PUYUH", "KELINCI", "KUCING", "IKAN", "LEBAH",
];

/** Sandi baru, mis. "SAWAH-ELANG-475". `acak` disuntik di tes. */
export function buatSandi(acak: (n: number) => number = (n) => {
  const b = new Uint32Array(1);
  globalThis.crypto.getRandomValues(b);
  return b[0] % n;
}): string {
  return `${KATA[acak(KATA.length)]}-${KATA[acak(KATA.length)]}-${String(acak(900) + 100)}`;
}

/** Sandi yang diketik peserta: huruf besar, spasi/titik/garis bawah jadi "-", rangkap dirapikan. */
export function rapikanSandi(s: string): string {
  return s.toUpperCase().replace(/[\s._]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").trim();
}

const b64 = (u: Uint8Array): string => {
  let s = "";
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s);
};
const dariB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const teks = new TextEncoder();

async function kunciDari(sandi: string, garam: Uint8Array, iterasi: number): Promise<CryptoKey> {
  const dasar = await globalThis.crypto.subtle.importKey("raw", teks.encode(rapikanSandi(sandi)), "PBKDF2", false, ["deriveKey"]);
  return globalThis.crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: garam as BufferSource, iterations: iterasi }, dasar, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export type Tersandi = { v: 1; garam: string; iv: string; iterasi: number; data: string };

export async function sandikan(isi: unknown, sandi: string, iterasi = ITERASI): Promise<Tersandi> {
  const garam = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const k = await kunciDari(sandi, garam, iterasi);
  const c = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, teks.encode(JSON.stringify(isi))));
  return { v: 1, garam: b64(garam), iv: b64(iv), iterasi, data: b64(c) };
}

/** Buka paket dengan sandi. null = sandi salah (atau paket rusak). */
export async function bukaSandi<T>(t: Tersandi, sandi: string): Promise<T | null> {
  try {
    const k = await kunciDari(sandi, dariB64(t.garam), t.iterasi);
    const p = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv: dariB64(t.iv) as BufferSource }, k, dariB64(t.data) as BufferSource);
    return JSON.parse(new TextDecoder().decode(p)) as T;
  } catch {
    return null;
  }
}

/** Isi paket soal yang disandikan: soal TANPA kunci. */
export type IsiPaketSoal = { tes_id: number; versi: string; soal: { nomor: number; teks: string; opsi: { kode: string; teks: string }[] }[] };

/** Paket yang diunduh ke HP (bagian luar tidak tersandi: hanya keterangan jadwal, tanpa soal). */
export type PaketTes = {
  v: 1;
  tes_id: number;
  kegiatan_id: number;
  jenis: string;
  judul: string;
  durasi_menit: number;
  buka_at: string;
  tutup_at: string;
  dimulai_instruktur: boolean;
  jumlah_soal: number;
  versi: string;
  diunduh_at: string;
  tersandi: Tersandi;
};

/** Versi soal (berubah bila soal/opsi/urutan berubah) — HP mengunduh ulang bila versi berbeda. */
export async function versiSoal(soal: IsiPaketSoal["soal"]): Promise<string> {
  const h = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", teks.encode(JSON.stringify(soal))));
  return b64(h).slice(0, 16);
}

/** Paket boleh diunduh mulai H-1 (24 jam sebelum buka) sampai tes ditutup. Tes yang dimulai instruktur memakai jadwal tes. */
export function bolehUnduh(bukaAt: string, tutupAt: string, sekarangMs: number): boolean {
  const b = Date.parse(bukaAt);
  const t = Date.parse(tutupAt);
  if (!Number.isFinite(b) || !Number.isFinite(t)) return false;
  return sekarangMs >= b - UNDUH_SEJAK_JAM * 3_600_000 && sekarangMs < t;
}
