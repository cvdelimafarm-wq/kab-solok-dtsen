// lib/sigapKuisPra.ts
//
// (31 Okt 2026) Kuis PRA pelatihan -- logika MURNI (tanpa React/DB): memilih soal per petugas menurut riwayat anomali, menilai jawaban, dan menentukan status percobaan.
// Bank soal = sigap_qc_soal dengan kode "KT-<KODE TEMUAN TANPA TANDA HUBUNG>-<urut>" (mis. KT-KP02-1 untuk temuan KP-02). Keputusan Iqbal 31 Okt: soal baku per kode temuan, disusun Claude.
// Tes: lib/__tests__/sigapKuisPra.test.ts.

/** "KP-02" / "m 01" -> "KP02" / "M01" (dasar pencocokan kode temuan dengan id soal). */
export const rapatKode = (kode: string): string => kode.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Kode temuan (dirapatkan) dari id soal berpola KT-<KODE>-<urut>; null bila bukan soal bank temuan. */
export function kodeDariIdSoal(id: string): string | null {
  const m = /^KT-([A-Z0-9]+)-\d+$/.exec(id.toUpperCase());
  return m ? m[1] : null;
}

/** Pengacak deterministik (mulberry32) dari benih teks, agar pilihan soal petugas stabil untuk percobaan yang sama. */
export function pengacak(benih: string): () => number {
  let h = 1779033703 ^ benih.length;
  for (let i = 0; i < benih.length; i++) {
    h = Math.imul(h ^ benih.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function kocok<T>(arr: readonly T[], acak: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(acak() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type SoalBank = { id: string };
export type RiwayatKode = { kode: string; jumlah: number };

/**
 * Memilih `jumlahSoal` soal untuk satu petugas.
 * 1) Kode temuan petugas diurutkan dari yang paling sering; tiap kode dibuatkan satu soal (bila bank punya soal untuk kode itu; bila ada beberapa soal, dipilih acak deterministik).
 * 2) Bila kode kurang dari jumlah soal, kekurangan diisi soal bank lain (kode yang belum dipakai, lalu soal sisa dari kode yang sama) secara acak deterministik.
 * 3) Petugas tanpa riwayat anomali mendapat soal acak dari seluruh bank bertanda KT-.
 * Hasil tidak memuat soal ganda dan urutannya diacak.
 */
export function pilihSoalKuisPra(bank: readonly SoalBank[], riwayat: readonly RiwayatKode[], jumlahSoal: number, benih: string): { soalIds: string[]; dariRiwayat: number; kodeTanpaSoal: string[] } {
  const acak = pengacak(benih);
  const perKode = new Map<string, string[]>();
  for (const s of bank) {
    const k = kodeDariIdSoal(s.id);
    if (!k) continue;
    perKode.set(k, [...(perKode.get(k) ?? []), s.id]);
  }
  const urut = [...riwayat].map((r) => ({ kode: rapatKode(r.kode), jumlah: r.jumlah })).sort((a, b) => b.jumlah - a.jumlah || a.kode.localeCompare(b.kode));
  const terpilih: string[] = [];
  const kodeTanpaSoal: string[] = [];
  const dipakaiKode = new Set<string>();
  for (const r of urut) {
    if (dipakaiKode.has(r.kode)) continue;
    dipakaiKode.add(r.kode);
    const kandidat = perKode.get(r.kode);
    if (!kandidat || kandidat.length === 0) {
      kodeTanpaSoal.push(r.kode);
      continue;
    }
    if (terpilih.length < jumlahSoal) terpilih.push(kocok(kandidat, acak)[0]);
  }
  const dariRiwayat = terpilih.length;
  if (terpilih.length < jumlahSoal) {
    const pakai = new Set(terpilih);
    const sisaKodeBaru = kocok([...perKode.keys()].filter((k) => !dipakaiKode.has(k)), acak).flatMap((k) => kocok(perKode.get(k) ?? [], acak).slice(0, 1));
    const sisaLain = kocok([...perKode.values()].flat().filter((id) => !pakai.has(id) && !sisaKodeBaru.includes(id)), acak);
    for (const id of [...sisaKodeBaru, ...sisaLain]) {
      if (terpilih.length >= jumlahSoal) break;
      if (!pakai.has(id)) {
        pakai.add(id);
        terpilih.push(id);
      }
    }
  }
  return { soalIds: kocok(terpilih, acak), dariRiwayat, kodeTanpaSoal };
}

export type HasilNilai = { benar: number; jumlah: number; skor: number };
/** Menilai jawaban (huruf A-D per id soal) terhadap kunci. Soal tak dijawab dihitung salah; skor = benar/jumlah x 100, dibulatkan 2 desimal. */
export function nilaiJawaban(kunci: Readonly<Record<string, string>>, jawaban: Readonly<Record<string, unknown>>): HasilNilai {
  const ids = Object.keys(kunci);
  let benar = 0;
  for (const id of ids) if (String(jawaban[id] ?? "").trim().toUpperCase() === kunci[id].toUpperCase()) benar++;
  const jumlah = ids.length;
  return { benar, jumlah, skor: jumlah === 0 ? 0 : Math.round((benar / jumlah) * 10000) / 100 };
}

export type PengaturanKuisPra = { aktif: boolean; jumlah_soal: number; maks_percobaan: number; nilai_lulus: number; wajib_lulus: boolean; buka_at: string | null; tutup_at: string | null };
export type PercobaanRingkas = { ke: number; skor: number | null; selesai: boolean };

export type StatusKuisPra = {
  /** "belum_buka" | "ditutup" | "nonaktif" | "lulus" | "habis" | "lanjut" (ada percobaan berjalan) | "bisa_mulai" */
  status: "nonaktif" | "belum_buka" | "ditutup" | "lulus" | "habis" | "lanjut" | "bisa_mulai";
  terbaik: number | null;
  lulus: boolean;
  sisa: number;
  keBerikut: number;
};

/** Status kuis pra untuk satu petugas pada saat `sekarangMs`. Setelah lulus, kuis tidak bisa diulang. */
export function statusKuisPra(p: PengaturanKuisPra, percobaan: readonly PercobaanRingkas[], sekarangMs: number): StatusKuisPra {
  const selesai = percobaan.filter((x) => x.selesai && x.skor !== null);
  const terbaik = selesai.length ? Math.max(...selesai.map((x) => x.skor as number)) : null;
  const lulus = terbaik !== null && terbaik >= p.nilai_lulus;
  const sisa = Math.max(0, p.maks_percobaan - percobaan.length);
  const keBerikut = percobaan.reduce((a, x) => Math.max(a, x.ke), 0) + 1;
  const dasar = { terbaik, lulus, sisa, keBerikut };
  if (!p.aktif) return { status: "nonaktif", ...dasar };
  if (p.buka_at && sekarangMs < Date.parse(p.buka_at)) return { status: "belum_buka", ...dasar };
  if (percobaan.some((x) => !x.selesai)) return { status: "lanjut", ...dasar };
  if (lulus) return { status: "lulus", ...dasar };
  if (p.tutup_at && sekarangMs > Date.parse(p.tutup_at)) return { status: "ditutup", ...dasar };
  if (sisa <= 0) return { status: "habis", ...dasar };
  return { status: "bisa_mulai", ...dasar };
}

export function validasiPengaturanKuisPra(x: unknown): { ok: true; data: PengaturanKuisPra & { kegiatan_anomali_id: number | null; kegiatan_bank_id: number | null } } | { ok: false; error: string } {
  const o = (x ?? {}) as Record<string, unknown>;
  const bulat = (v: unknown, min: number, max: number, nama: string): number | string => {
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : `${nama} harus bilangan bulat ${min}–${max}.`;
  };
  const js = bulat(o.jumlah_soal, 1, 30, "Jumlah soal");
  const mp = bulat(o.maks_percobaan, 1, 10, "Percobaan maksimal");
  const nl = bulat(o.nilai_lulus, 0, 100, "Nilai lulus");
  for (const v of [js, mp, nl]) if (typeof v === "string") return { ok: false, error: v };
  const waktu = (v: unknown, nama: string): string | null | "galat" => {
    if (v === null || v === undefined || v === "") return null;
    const t = Date.parse(String(v));
    return Number.isNaN(t) ? "galat" : new Date(t).toISOString();
  };
  const buka = waktu(o.buka_at, "buka");
  const tutup = waktu(o.tutup_at, "tutup");
  if (buka === "galat" || tutup === "galat") return { ok: false, error: "Waktu buka/tutup tidak sah." };
  if (buka && tutup && Date.parse(tutup) <= Date.parse(buka)) return { ok: false, error: "Waktu tutup harus sesudah waktu buka." };
  const id = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  return { ok: true, data: { aktif: o.aktif === true, jumlah_soal: js as number, maks_percobaan: mp as number, nilai_lulus: nl as number, wajib_lulus: o.wajib_lulus === true, buka_at: buka, tutup_at: tutup, kegiatan_anomali_id: id(o.kegiatan_anomali_id), kegiatan_bank_id: id(o.kegiatan_bank_id) } };
}
