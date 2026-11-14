// lib/waktuJawaban.ts
//
// (14 Nov 2026) Waktu per soal (putusan Ketua Tim 14 Nov): tiap jawaban mencatat jam pertama dipilih (t), jam terakhir diubah (u), dan berapa kali
// diubah (n). Dipakai monitoring pemahaman untuk "sedang mengerjakan", "macet", dan lama per soal. Disimpan di kolom `jawaban_waktu`
// (sigap_tes_sesi dan sigap_qc_percobaan, SQL 20261114w). Berkas MURNI.

export type WaktuSoal = { t: string; u: string; n: number };
export type WaktuJawaban = Record<string, WaktuSoal>;

const ms = (s: string | undefined | null) => (s ? Date.parse(s) : NaN);

/** Satu pilihan baru pada satu soal. */
export function catatPilih(lama: WaktuSoal | undefined, sekarangIso: string): WaktuSoal {
  return lama ? { t: lama.t, u: sekarangIso, n: lama.n + 1 } : { t: sekarangIso, u: sekarangIso, n: 1 };
}

/**
 * Tes (autosave di server): bandingkan jawaban tersimpan dengan jawaban baru; soal yang baru dijawab atau berubah pilihannya dicatat pada jam
 * simpan ini. Ketelitian mengikuti seringnya autosave.
 */
export function perbaruiWaktu(waktu: unknown, jawabanLama: Record<string, string> | null | undefined, jawabanBaru: Record<string, string>, sekarangIso: string): WaktuJawaban {
  const hasil: WaktuJawaban = { ...(bacaWaktu(waktu) ?? {}) };
  const lama = jawabanLama ?? {};
  for (const [k, v] of Object.entries(jawabanBaru)) {
    if (lama[k] === v && hasil[k]) continue;
    if (lama[k] === v && !hasil[k]) {
      hasil[k] = { t: sekarangIso, u: sekarangIso, n: 1 };
      continue;
    }
    hasil[k] = catatPilih(hasil[k], sekarangIso);
  }
  return hasil;
}

/** Membaca isi kolom jawaban_waktu dengan aman (baris rusak dibuang). */
export function bacaWaktu(x: unknown): WaktuJawaban | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const out: WaktuJawaban = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const t = typeof o.t === "string" ? o.t : null;
    const u = typeof o.u === "string" ? o.u : t;
    const n = Number(o.n);
    if (!t || !u || !Number.isFinite(ms(t)) || !Number.isFinite(ms(u))) continue;
    out[k] = { t, u, n: Number.isInteger(n) && n > 0 ? Math.min(n, 999) : 1 };
  }
  return out;
}

/**
 * QC (dikirim HP sekali saat kirim): bersihkan kiriman { mulai_at, per_soal } dari peramban. Hanya soal yang sah, jam di antara
 * `batasBawahMs` dan sekarang (+2 menit toleransi jam HP), n 1..999. Kiriman tidak sah = null (jawaban tetap diterima tanpa waktu).
 */
export function bersihkanWaktuKiriman(x: unknown, idSah: ReadonlySet<string>, batasBawahMs: number, sekarangMs: number): { mulai_at: string | null; per_soal: WaktuJawaban } | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const atas = sekarangMs + 120_000;
  const sah = (s: unknown) => typeof s === "string" && Number.isFinite(ms(s)) && ms(s) >= batasBawahMs && ms(s) <= atas;
  const mulai = sah(o.mulai_at) ? new Date(ms(o.mulai_at as string)).toISOString() : null;
  const per = bacaWaktu(o.per_soal) ?? {};
  const bersih: WaktuJawaban = {};
  for (const [k, v] of Object.entries(per)) {
    if (!idSah.has(k) || !sah(v.t) || !sah(v.u) || ms(v.u) < ms(v.t)) continue;
    bersih[k] = { t: new Date(ms(v.t)).toISOString(), u: new Date(ms(v.u)).toISOString(), n: v.n };
  }
  if (!mulai && Object.keys(bersih).length === 0) return null;
  return { mulai_at: mulai, per_soal: bersih };
}

/**
 * Perkiraan lama per soal (detik): soal diurut menurut jam pertama dipilih; lama soal = jarak dari pilihan sebelumnya (atau dari mulai).
 * Soal tanpa catatan waktu tidak muncul.
 */
export function lamaPerSoal(w: WaktuJawaban, mulaiIso: string | null): Record<string, number> {
  const urut = Object.entries(w).sort((a, b) => ms(a[1].t) - ms(b[1].t));
  const out: Record<string, number> = {};
  let sebelum = mulaiIso && Number.isFinite(ms(mulaiIso)) ? ms(mulaiIso) : NaN;
  for (const [k, v] of urut) {
    const t = ms(v.t);
    if (Number.isFinite(sebelum)) out[k] = Math.max(0, Math.round((t - sebelum) / 1000));
    sebelum = t;
  }
  return out;
}

/** Menit sejak jawaban terakhir (untuk tanda "macet" saat sesi masih terbuka); null bila belum ada jawaban. */
export function menitSejakTerakhir(w: WaktuJawaban, sekarangMs: number): number | null {
  const akhir = Math.max(...Object.values(w).map((v) => ms(v.u)).filter(Number.isFinite));
  return Number.isFinite(akhir) ? Math.max(0, Math.floor((sekarangMs - akhir) / 60_000)) : null;
}
