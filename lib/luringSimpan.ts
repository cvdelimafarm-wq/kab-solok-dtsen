// lib/luringSimpan.ts
//
// (14 Nov 2026, luring langkah 3; docs/luring-aturan.md L12) Simpanan kerja di HP untuk pekerjaan yang harus bisa diteruskan tanpa sinyal
// (mulai dari pretest/posttest). Aturan rancangan: sumber kebenaran sementara = simpanan di HP; tiap ketukan langsung ditulis; refresh memulihkan
// posisi terakhir; waktu mulai dan batas disimpan sekali (refresh tidak menambah waktu); yang belum terkirim bertanda `kotor` dan TIDAK dibuang saat
// keluar akun (dikirim ketika pemiliknya masuk lagi). Kunci jawaban tidak pernah disimpan di sini.
// Murni kecuali adaptor penyimpanan (localStorage di peramban; disuntik di tes).

export const AWALAN_LURING = "sigap_luring:";

export type Penyimpan = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; key(i: number): string | null; readonly length: number };

export type SimpananKerja<K, J> = {
  v: 1;
  pemilik: string;
  disimpanMs: number;
  /** jam server menurut jawaban terakhir (ISO) dan jam HP saat itu: untuk memulihkan selisih jam saat tanpa sinyal */
  jamServer: string | null;
  keadaan: K;
  jawaban: J;
  /** true = ada perubahan yang belum diterima server */
  kotor: boolean;
};

/** Tanda pemilik dari sesi masuk (bagian ekor token; bukan rahasia utuh). */
export const tandaPemilik = (sesi: string | null): string => (sesi ? sesi.slice(-12) : "");

export const kunciTes = (jenis: string, percobaan: number, mulaiAt: string | null | undefined): string => `${AWALAN_LURING}tes:${jenis}:${percobaan}:${mulaiAt ?? "-"}`;
export const kunciTesTerakhir = (jenis: string): string => `${AWALAN_LURING}tes:${jenis}:terakhir`;

export function tulis<K, J>(p: Penyimpan, kunci: string, isi: Omit<SimpananKerja<K, J>, "v" | "disimpanMs">, sekarangMs = Date.now()): void {
  try {
    p.setItem(kunci, JSON.stringify({ v: 1, disimpanMs: sekarangMs, ...isi }));
  } catch {
    /* penuh/tidak tersedia: kerja tetap berjalan, hanya tidak tahan refresh */
  }
}

export function baca<K, J>(p: Penyimpan, kunci: string, pemilik: string): SimpananKerja<K, J> | null {
  try {
    const t = p.getItem(kunci);
    if (!t) return null;
    const x = JSON.parse(t) as SimpananKerja<K, J>;
    if (!x || x.v !== 1 || x.pemilik !== pemilik) return null;
    return x;
  } catch {
    return null;
  }
}

/** Jam server perkiraan sekarang dari simpanan: jam server saat disimpan + lama berlalu menurut HP. */
export function jamServerSekarang(s: Pick<SimpananKerja<unknown, unknown>, "jamServer" | "disimpanMs">, sekarangMs = Date.now()): string | null {
  if (!s.jamServer) return null;
  const t = Date.parse(s.jamServer);
  if (!Number.isFinite(t)) return null;
  return new Date(t + Math.max(0, sekarangMs - s.disimpanMs)).toISOString();
}

/** Gabung jawaban server dengan simpanan HP: bila HP masih kotor, jawaban HP yang dipakai (server belum menerimanya). */
export function gabungJawaban<J extends Record<string, string>>(server: J | undefined, lokal: SimpananKerja<unknown, J> | null): { jawaban: J; kotor: boolean } {
  if (lokal && lokal.kotor) return { jawaban: lokal.jawaban, kotor: true };
  return { jawaban: (server ?? ({} as J)), kotor: false };
}

/** Keluar akun: buang simpanan kerja yang sudah terkirim; yang masih kotor DITAHAN (antrean tidak dibuang, L4/L12). */
export function bersihkanSaatKeluar(p: Penyimpan): number {
  const buang: string[] = [];
  for (let i = 0; i < p.length; i++) {
    const k = p.key(i);
    if (!k || !k.startsWith(AWALAN_LURING)) continue;
    try {
      const x = JSON.parse(p.getItem(k) ?? "null") as { kotor?: boolean } | null;
      if (!x || !x.kotor) buang.push(k);
    } catch {
      buang.push(k);
    }
  }
  for (const k of buang) p.removeItem(k);
  return buang.length;
}

/** Galat jaringan (bukan penolakan server): fetch melempar TypeError / pesan "Failed to fetch" / "NetworkError" / "Load failed". */
export function galatJaringan(e: unknown): boolean {
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /TypeError|Failed to fetch|NetworkError|Load failed|jaringan|sinyal|offline/i.test(m) && !/HTTP \d{3}/.test(m);
}
