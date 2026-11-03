// lib/sigapAbsen.ts
//
// (2 Nov 2026) Absen peserta (pelatihan, kelak rapat lapangan dan Cekatan): logika MURNI tanpa akses database, dipakai server dan layar.
// Aturan (rancangan-absen-kedatangan-jendela-30-menit-2nov): kedatangan hanya hari pertama; presensi SESI dibuka pengelola, habis otomatis
// setelah jendela (30 menit), kartu hanya berpindah saat pengelola menekan Mulai, sistem hanya MENYARANKAN sesi dari jam rencana terdekat.
// Metode sesi (satu per satu, tidak bersamaan): centang satu per satu, kode tetap selama sesi, radar GPS dari posisi pengelola (HP peserta melapor posisi otomatis).

import { jarakMeter, posisiValid } from "@/lib/sigapPresensi";

export type MetodeAbsen = "centang" | "kode" | "radar";
export const SEMUA_METODE: readonly MetodeAbsen[] = ["centang", "kode", "radar"];
export const NAMA_METODE: Record<MetodeAbsen, string> = { centang: "Centang satu per satu", kode: "Kode unik", radar: "Radar GPS" };

export type SesiRencana = { no: number; label: string; jam: string };
export const SESI_BAWAAN: readonly SesiRencana[] = [
  { no: 1, label: "Sesi 1", jam: "08:00" },
  { no: 2, label: "Sesi 2", jam: "10:00" },
  { no: 3, label: "Sesi 3", jam: "13:30" },
  { no: 4, label: "Sesi 4", jam: "16:30" },
];
export const JENDELA_MENIT_BAWAAN = 30;
export const RADIUS_RADAR_BAWAAN_M = 25;
export const AKURASI_RADAR_MAKS_M = 40;
/** Posisi pengelola dianggap basi (radar tidak lagi dipercaya) bila lebih lama dari ini. */
export const POSISI_BASI_DETIK = 45;
export const KODE_PANJANG = 6;
export const SALAH_KODE_MAKS = 5;
export const SALAH_KODE_TUNGGU_DETIK = 60;

// ---------- waktu ----------

/** "08:00" -> 480 (menit sejak tengah malam); null bila bukan jam sah. */
export function menitDariJam(jam: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(jam ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mn = Number(m[2]);
  return h >= 0 && h <= 23 && mn >= 0 && mn <= 59 ? h * 60 + mn : null;
}

/** Menit sejak tengah malam WIB dari cap waktu (ms). */
export function menitWib(ms: number): number {
  const d = new Date(ms + 7 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
export const tanggalWib = (ms: number): string => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);

/**
 * Sesi yang DISARANKAN: jam rencana dengan selisih mutlak terkecil dari jam sekarang. Yang belum pernah dimulai hari itu didahulukan;
 * bila semuanya sudah pernah dimulai, dipilih yang terdekat dari seluruhnya. Selisih sama -> sesi bernomor lebih kecil. Tanpa jam sah -> null.
 */
export function sarankanSesi(sesi: readonly SesiRencana[], menitSekarang: number, sudahDimulai: ReadonlySet<number> = new Set()): number | null {
  const pilih = (daftar: readonly SesiRencana[]): number | null => {
    let terbaik: { no: number; selisih: number } | null = null;
    for (const s of daftar) {
      const m = menitDariJam(s.jam);
      if (m === null) continue;
      const selisih = Math.abs(m - menitSekarang);
      if (!terbaik || selisih < terbaik.selisih || (selisih === terbaik.selisih && s.no < terbaik.no)) terbaik = { no: s.no, selisih };
    }
    return terbaik ? terbaik.no : null;
  };
  return pilih(sesi.filter((s) => !sudahDimulai.has(s.no))) ?? pilih(sesi);
}

export const tutupAtDari = (dibukaMs: number, jendelaMenit: number): number => dibukaMs + jendelaMenit * 60_000;

export type KeadaanSesi = "dibuka" | "habis" | "ditutup";
/** `ditutup` = pengelola menutup lebih awal; `habis` = jendela berakhir sendiri. */
export function keadaanSesi(s: { status: string; tutup_at: string | number }, nowMs: number): KeadaanSesi {
  if (s.status === "ditutup") return "ditutup";
  const t = typeof s.tutup_at === "number" ? s.tutup_at : Date.parse(s.tutup_at);
  return Number.isFinite(t) && nowMs < t ? "dibuka" : "habis";
}
export function sisaDetik(tutupAt: string | number, nowMs: number): number {
  const t = typeof tutupAt === "number" ? tutupAt : Date.parse(tutupAt);
  return Number.isFinite(t) ? Math.max(0, Math.ceil((t - nowMs) / 1000)) : 0;
}
export function teksSisa(detik: number): string {
  const d = Math.max(0, Math.floor(detik));
  return `${String(Math.floor(d / 60)).padStart(2, "0")}:${String(d % 60).padStart(2, "0")}`;
}

// ---------- hari kegiatan ----------

/** Kedatangan hanya pada hari pertama pelatihan. `hari` = daftar tanggal (YYYY-MM-DD) kegiatan; urutan tidak diandalkan. */
export function hariPertama(hari: readonly string[]): string | null {
  const urut = hari.filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h)).sort();
  return urut[0] ?? null;
}
export const kedatanganBerlaku = (hari: readonly string[], tanggal: string): boolean => hariPertama(hari) === tanggal;

/** Semua tanggal dari mulai s.d. selesai (maks 60 hari, pengaman). */
export function rentangHari(mulai: string | null | undefined, selesai: string | null | undefined): string[] {
  if (!mulai || !/^\d{4}-\d{2}-\d{2}$/.test(mulai)) return [];
  const akhir = selesai && /^\d{4}-\d{2}-\d{2}$/.test(selesai) && selesai >= mulai ? selesai : mulai;
  const hasil: string[] = [];
  const t = new Date(`${mulai}T00:00:00Z`);
  while (hasil.length < 60) {
    const s = t.toISOString().slice(0, 10);
    hasil.push(s);
    if (s >= akhir) break;
    t.setUTCDate(t.getUTCDate() + 1);
  }
  return hasil;
}

// ---------- pengaturan sesi ----------

/** Memulihkan daftar sesi dari jsonb: nomor 1..12 unik, label tak kosong, jam sah atau kosong. Kosong -> bawaan. */
export function rapikanSesi(x: unknown): SesiRencana[] {
  if (!Array.isArray(x)) return SESI_BAWAAN.map((s) => ({ ...s }));
  const lihat = new Set<number>();
  const hasil: SesiRencana[] = [];
  for (const r of x) {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const no = Number(o.no);
    if (!Number.isInteger(no) || no < 1 || no > 12 || lihat.has(no)) continue;
    lihat.add(no);
    const label = typeof o.label === "string" && o.label.trim() ? o.label.trim().slice(0, 40) : `Sesi ${no}`;
    const jam = typeof o.jam === "string" && menitDariJam(o.jam) !== null ? o.jam.trim().padStart(5, "0") : "";
    hasil.push({ no, label, jam });
  }
  return hasil.length ? hasil.sort((a, b) => a.no - b.no) : SESI_BAWAAN.map((s) => ({ ...s }));
}

/** Memeriksa metode yang dipilih: minimal satu, hanya yang dikenal, tanpa duplikat. */
export function periksaMetode(x: unknown): { ok: true; metode: MetodeAbsen[] } | { ok: false; pesan: string } {
  if (!Array.isArray(x) || x.length === 0) return { ok: false, pesan: "Pilih minimal satu metode absen." };
  const hasil: MetodeAbsen[] = [];
  for (const m of x) {
    if (!SEMUA_METODE.includes(m as MetodeAbsen)) return { ok: false, pesan: "Metode absen tidak dikenal." };
    if (!hasil.includes(m as MetodeAbsen)) hasil.push(m as MetodeAbsen);
  }
  return { ok: true, metode: hasil };
}

/**
 * (3 Nov 2026) Satu sesi memakai SATU metode pada satu waktu (radar dan kode tidak berjalan bersamaan). Menerima "radar" atau ["radar"].
 * Mengganti metode di tengah jalan memakai aksi "ganti"; berhenti memakai "tutup" lalu "mulai" lagi.
 */
export function periksaMetodeTunggal(x: unknown): { ok: true; metode: MetodeAbsen } | { ok: false; pesan: string } {
  const daftar = Array.isArray(x) ? x : x === undefined || x === null ? [] : [x];
  if (daftar.length === 0) return { ok: false, pesan: "Pilih satu metode absen." };
  if (daftar.length > 1) return { ok: false, pesan: "Pilih satu metode saja pada satu waktu." };
  return SEMUA_METODE.includes(daftar[0] as MetodeAbsen) ? { ok: true, metode: daftar[0] as MetodeAbsen } : { ok: false, pesan: "Metode absen tidak dikenal." };
}

/** Sesi lama bisa menyimpan lebih dari satu metode; pada ganti metode atau tampilan tunggal dipakai yang pertama menurut urutan prioritas radar > kode > centang. */
export function metodeUtama(metode: readonly MetodeAbsen[]): MetodeAbsen {
  return (["radar", "kode", "centang"] as const).find((m) => metode.includes(m)) ?? "centang";
}

/** Radar otomatis di HP peserta: jeda antar laporan posisi ke server selama sesi radar terbuka dan peserta belum tercatat hadir. */
export const JEDA_RADAR_OTOMATIS_MS = 8_000;

// ---------- kode ----------

/** Kode angka tetap `KODE_PANJANG` digit. `acak` menghasilkan bilangan [0,1) (server memberi sumber acak kuat). */
export function buatKode(acak: () => number): string {
  let k = "";
  for (let i = 0; i < KODE_PANJANG; i++) k += String(Math.min(9, Math.floor(acak() * 10)));
  return k;
}
export const kodeCocok = (masukan: unknown, kode: string | null | undefined): boolean => !!kode && typeof masukan === "string" && masukan.replace(/\s+/g, "") === kode;

/** Sisa detik menunggu setelah terlalu banyak salah ketik (0 = boleh mencoba). */
export function tungguKode(salah: number, terakhirMs: number | null, nowMs: number): number {
  if (salah < SALAH_KODE_MAKS || terakhirMs === null) return 0;
  return Math.max(0, Math.ceil((terakhirMs + SALAH_KODE_TUNGGU_DETIK * 1000 - nowMs) / 1000));
}

// ---------- radar ----------

export type Posisi = { lat: number; lng: number; akurasi: number };
export type KodeRadar = "masuk" | "luar" | "akurasi" | "basi" | "tanpa_pusat";
export type HasilRadar = { kode: KodeRadar; jarak_m: number | null };

/** Menilai satu laporan posisi peserta terhadap posisi pengelola (pusat radar). */
export function nilaiRadar(pusat: (Posisi & { at: number }) | null, peserta: unknown, radiusM: number, nowMs: number): HasilRadar {
  if (!pusat) return { kode: "tanpa_pusat", jarak_m: null };
  if (nowMs - pusat.at > POSISI_BASI_DETIK * 1000) return { kode: "basi", jarak_m: null };
  if (!posisiValid(peserta)) return { kode: "akurasi", jarak_m: null };
  const jarak = Math.round(jarakMeter(pusat.lat, pusat.lng, peserta.lat, peserta.lng));
  if (peserta.akurasi > AKURASI_RADAR_MAKS_M) return { kode: "akurasi", jarak_m: jarak };
  return { kode: jarak <= radiusM ? "masuk" : "luar", jarak_m: jarak };
}

export const PESAN_RADAR: Record<KodeRadar, string> = {
  masuk: "Lokasi terkonfirmasi. Anda tercatat hadir.",
  luar: "Anda berada di luar radius radar. Dekati posisi panitia atau instruktur, lalu coba lagi.",
  akurasi: "Akurasi GPS terlalu lemah. Pindah ke tempat terbuka sebentar lalu coba lagi.",
  basi: "Radar belum aktif dari sisi panitia atau instruktur. Tunggu sebentar lalu coba lagi.",
  tanpa_pusat: "Radar belum aktif dari sisi panitia atau instruktur. Tunggu sebentar lalu coba lagi.",
};

export type BarisRadar = { akun_id: number; nama: string; status: "hadir" | "luar" | "belum"; jarak_m: number | null };
/** Ringkasan untuk ikon radar: yang sudah masuk, yang di luar radar (dengan nama dan jarak), dan yang belum melapor posisi. */
export function ringkasRadar(baris: readonly BarisRadar[]): { masuk: number; luar: BarisRadar[]; belum: number } {
  const luar = baris.filter((b) => b.status === "luar").sort((a, b) => (a.jarak_m ?? 1e9) - (b.jarak_m ?? 1e9) || a.nama.localeCompare(b.nama, "id"));
  return { masuk: baris.filter((b) => b.status === "hadir").length, luar, belum: baris.filter((b) => b.status === "belum").length };
}

// ---------- tab per peran ----------

export type JenisPengelola = "panitia" | "instruktur" | "peserta";
/** Pengelola (panitia / instruktur) melihat "Absen peserta" menggantikan tab Pelatihan; peserta tetap Pelatihan. Ganda -> keduanya. */
export function tabPerPeran(jenis: JenisPengelola, adalahPeserta: boolean): { pelatihan: boolean; absen: boolean } {
  const pengelola = jenis === "panitia" || jenis === "instruktur";
  return { pelatihan: !pengelola || adalahPeserta, absen: pengelola };
}
