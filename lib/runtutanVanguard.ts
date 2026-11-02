// lib/runtutanVanguard.ts  (murni; dipakai server dan klien)
//
// (2 Nov 2026) ATURAN VANGUARD DI PELATIHAN: petugas berlatih N hari berturut-turut (bawaan 3), minimal 1 sesi per hari. Rancangan: claude/rancangan-vanguard-di-pelatihan-2nov.md
//   - Sesi = satu ujian Vanguard yang SELESAI (jenis latihan, harian, atau sertifikasi) pada sigap_vanguard_ujian; yang dibatalkan / belum selesai tidak dihitung.
//   - Hari = hari kalender WIB. Satu hari terlewat memutus runtutan (akhir pekan juga memutus; aturan streak pembinaan yang melonggarkan akhir pekan TIDAK dipakai di sini).
//   - Tuntas = pernah ada N hari bersambung yang masing-masing memenuhi (sesi >= minimal DAN skor >= nilai minimal). Setelah tuntas tetap tuntas.
//   - Mengunci Pretest hanya bila mode "wajib" (lihat sigapTahapanDb.muatTahapanBatch). Batas mulai = tanggal buka Pretest dikurangi N hari.

export type ModeVanguard = "tidak_ada" | "opsional" | "wajib";
export const MODE_VANGUARD: readonly ModeVanguard[] = ["tidak_ada", "opsional", "wajib"];
export const LABEL_MODE_VANGUARD: Record<ModeVanguard, string> = { tidak_ada: "Tidak ada", opsional: "Opsional (tidak mengunci)", wajib: "Wajib (mengunci Pretest)" };

export type AturanVanguard = {
  mode: ModeVanguard;
  hari_berturut: number;
  sesi_min_per_hari: number;
  /** 0 = berapa pun nilainya. */
  nilai_minimal: number;
};
export const ATURAN_VANGUARD_BAWAAN: AturanVanguard = { mode: "tidak_ada", hari_berturut: 3, sesi_min_per_hari: 1, nilai_minimal: 0 };
export const JENIS_SESI_VANGUARD: readonly string[] = ["latihan", "harian", "sertifikasi"];

const bulatDalam = (v: unknown, min: number, maks: number, bawaan: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(maks, Math.max(min, Math.round(n))) : bawaan;
};

/** Baris sigap_pelatihan_aturan (kolom vanguard_*) -> aturan sah. Kolom kosong / belum ada = bawaan (tidak ada, tidak mengunci). */
export function rapikanAturanVanguard(baris: Record<string, unknown> | null | undefined): AturanVanguard {
  if (!baris) return { ...ATURAN_VANGUARD_BAWAAN };
  const mode = MODE_VANGUARD.includes(baris.vanguard_mode as ModeVanguard) ? (baris.vanguard_mode as ModeVanguard) : ATURAN_VANGUARD_BAWAAN.mode;
  return {
    mode,
    hari_berturut: bulatDalam(baris.vanguard_hari_berturut, 1, 14, ATURAN_VANGUARD_BAWAAN.hari_berturut),
    sesi_min_per_hari: bulatDalam(baris.vanguard_sesi_min_per_hari, 1, 10, ATURAN_VANGUARD_BAWAAN.sesi_min_per_hari),
    nilai_minimal: bulatDalam(baris.vanguard_nilai_minimal, 0, 100, ATURAN_VANGUARD_BAWAAN.nilai_minimal),
  };
}

export function periksaAturanVanguard(x: unknown): { ok: true; aturan: AturanVanguard } | { ok: false; pesan: string } {
  const o = (x ?? {}) as Record<string, unknown>;
  if (!MODE_VANGUARD.includes(o.mode as ModeVanguard)) return { ok: false, pesan: "Mode Vanguard harus tidak ada, opsional, atau wajib." };
  const bulat = (v: unknown, min: number, maks: number, nama: string): number | string => {
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > maks) return `${nama} harus bilangan bulat ${min}–${maks}.`;
    return v;
  };
  const h = bulat(o.hari_berturut, 1, 14, "Jumlah hari berturut-turut");
  if (typeof h === "string") return { ok: false, pesan: h };
  const s = bulat(o.sesi_min_per_hari, 1, 10, "Sesi minimal per hari");
  if (typeof s === "string") return { ok: false, pesan: s };
  const n = bulat(o.nilai_minimal, 0, 100, "Nilai minimal");
  if (typeof n === "string") return { ok: false, pesan: n };
  return { ok: true, aturan: { mode: o.mode as ModeVanguard, hari_berturut: h, sesi_min_per_hari: s, nilai_minimal: n } };
}

// ---------- tanggal WIB ----------

const WIB_MS = 7 * 3600_000;
const HARI_MS = 86_400_000;
const POLA_TGL = /^\d{4}-\d{2}-\d{2}$/;

/** Tanggal kalender WIB (YYYY-MM-DD) dari waktu ISO / ms. Tidak sah -> null. */
export function hariWib(waktu: string | number | null | undefined): string | null {
  if (waktu === null || waktu === undefined || waktu === "") return null;
  const t = typeof waktu === "number" ? waktu : new Date(waktu).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + WIB_MS).toISOString().slice(0, 10);
}

const keMs = (tgl: string): number => Date.parse(`${tgl}T00:00:00Z`);
export const tambahHari = (tgl: string, n: number): string => new Date(keMs(tgl) + n * HARI_MS).toISOString().slice(0, 10);
export const selisihHari = (a: string, b: string): number => Math.round((keMs(a) - keMs(b)) / HARI_MS);

// ---------- runtutan ----------

export type SesiVanguard = { selesai_at: string | null; skor?: number | string | null };
export type StatusPetak = "selesai" | "hari_ini" | "belum";
export type Petak = { status: StatusPetak; tanggal: string | null };

export type HasilRuntutan = {
  hari_berturut: number;
  /** Panjang runtutan yang sedang berjalan (berakhir hari ini bila hari ini sudah memenuhi, atau kemarin). */
  berturut: number;
  tuntas: boolean;
  hari_ini_sudah: boolean;
  sesi_hari_ini: number;
  /** Pernah ada hari yang memenuhi, tetapi runtutan sekarang kosong dan belum tuntas. */
  terputus: boolean;
  petak: Petak[];
};

/** Hari-hari (WIB) yang memenuhi: sesi selesai >= minimal dan skor >= nilai minimal. */
export function hariMemenuhi(sesi: readonly SesiVanguard[], aturan: AturanVanguard): Set<string> {
  const hitung = new Map<string, number>();
  for (const s of sesi) {
    const hari = hariWib(s.selesai_at);
    if (!hari) continue;
    const skor = s.skor === null || s.skor === undefined || s.skor === "" ? 0 : Number(s.skor);
    if (!(skor >= aturan.nilai_minimal)) continue;
    hitung.set(hari, (hitung.get(hari) ?? 0) + 1);
  }
  const hasil = new Set<string>();
  for (const [h, n] of hitung) if (n >= aturan.sesi_min_per_hari) hasil.add(h);
  return hasil;
}

export function hitungRuntutanVanguard(sesi: readonly SesiVanguard[], hariIni: string, aturan: AturanVanguard): HasilRuntutan {
  const N = aturan.hari_berturut;
  const ok = hariMemenuhi(sesi, aturan);
  const hariIniSudah = ok.has(hariIni);
  // runtutan terpanjang di mana pun (tuntas bersifat tetap)
  const urut = [...ok].sort();
  let terpanjang = 0;
  let jalan = 0;
  let sebelum: string | null = null;
  for (const h of urut) {
    jalan = sebelum !== null && selisihHari(h, sebelum) === 1 ? jalan + 1 : 1;
    terpanjang = Math.max(terpanjang, jalan);
    sebelum = h;
  }
  const tuntas = terpanjang >= N;
  // runtutan yang sedang berjalan: berakhir hari ini bila sudah memenuhi, selain itu berakhir kemarin
  let ujung = hariIniSudah ? hariIni : tambahHari(hariIni, -1);
  let berturut = 0;
  while (ok.has(ujung)) {
    berturut++;
    ujung = tambahHari(ujung, -1);
  }
  const pernah = urut.length > 0;
  const terputus = !tuntas && berturut === 0 && pernah;
  const petak: Petak[] = [];
  for (let i = 0; i < N; i++) {
    if (tuntas || i < berturut) {
      // awal runtutan berjalan = (ujung terakhir hari yang memenuhi) - berturut + 1 ; untuk tuntas tanpa runtutan berjalan, tanggal tidak ditampilkan
      const awal = berturut > 0 ? tambahHari(hariIniSudah ? hariIni : tambahHari(hariIni, -1), -(berturut - 1)) : null;
      petak.push({ status: "selesai", tanggal: awal && i < berturut ? tambahHari(awal, i) : null });
    } else if (i === berturut && !hariIniSudah) petak.push({ status: "hari_ini", tanggal: hariIni });
    else petak.push({ status: "belum", tanggal: null });
  }
  return { hari_berturut: N, berturut: tuntas ? Math.max(berturut, N) : berturut, tuntas, hari_ini_sudah: hariIniSudah, sesi_hari_ini: sesi.filter((s) => hariWib(s.selesai_at) === hariIni).length, terputus, petak };
}

// ---------- batas mulai ----------

export type KelayakanRuntutan = {
  /** Tanggal terakhir untuk memulai agar tuntas sebelum Pretest dibuka (null bila tanggal buka Pretest tidak diketahui). */
  batas_mulai: string | null;
  /** true bila masih mungkin tuntas sebelum Pretest dibuka (atau sudah tuntas). null = tidak diketahui. */
  mungkin: boolean | null;
  /** Hari yang masih boleh terlewat tanpa mengorbankan kemungkinan tuntas (null bila tidak diketahui / tidak mungkin). */
  cadangan_hari: number | null;
  /** Hari ini adalah hari terakhir untuk memulai. */
  hari_terakhir_mulai: boolean;
};

/**
 * `tanggalBukaPretest` = tanggal (WIB) Pretest mulai dibuka. Runtutan harus tuntas pada hari-hari SEBELUM tanggal itu:
 * hari yang tersedia = dari hari ini (bila hari ini belum memenuhi) atau besok, sampai sehari sebelum tanggal buka.
 */
export function periksaKelayakan(r: HasilRuntutan, hariIni: string, tanggalBukaPretest: string | null | undefined): KelayakanRuntutan {
  const N = r.hari_berturut;
  if (!tanggalBukaPretest || !POLA_TGL.test(tanggalBukaPretest)) return { batas_mulai: null, mungkin: r.tuntas ? true : null, cadangan_hari: null, hari_terakhir_mulai: false };
  const batas = tambahHari(tanggalBukaPretest, -N);
  if (r.tuntas) return { batas_mulai: batas, mungkin: true, cadangan_hari: null, hari_terakhir_mulai: false };
  const hariTerakhir = tambahHari(tanggalBukaPretest, -1);
  const mulaiTersedia = r.hari_ini_sudah ? tambahHari(hariIni, 1) : hariIni;
  const tersedia = Math.max(0, selisihHari(hariTerakhir, mulaiTersedia) + 1);
  const sisa = N - r.berturut;
  const mungkin = tersedia >= sisa;
  return { batas_mulai: batas, mungkin, cadangan_hari: mungkin ? tersedia - sisa : null, hari_terakhir_mulai: r.berturut === 0 && !r.hari_ini_sudah && hariIni === batas };
}
