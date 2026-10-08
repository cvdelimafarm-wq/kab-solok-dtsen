// lib/sigapPresensi.ts
//
// (7 Okt 2026) SIGAP > Pelatihan -- presensi di lokasi pelatihan (radius dari Mami Hotel Solok) & label foto Transport Lokal.
// Logika murni (tanpa akses database) -- dipakai server (penilaian akhir) dan klien (tampilan jarak sebelum menekan tombol).
// Keputusan user: radius 300 m, presensi dibuka 06.00 s.d. 18.00 WIB di hari kegiatan, presensi sekali saja,
// bila lokasi gagal terbaca panitia dapat mencatat presensi manual (dengan alasan).
// (8 Okt 2026) Presensi per hari bisa 1-3 sesi (mis. pagi & sore), jam tiap sesi diatur panitia; bawaan 1 sesi 06.00-18.00.
// Peringatan lokasi hanya tampil untuk sesi yang sedang dibuka dan belum tercatat; semua sesi hari itu lengkap -> padam.

/** Satu titik lokasi presensi (mis. Mami Hotel, Ully Hotel) beserta radiusnya. */
export type TitikPresensi = { nama: string; lat: number; lng: number; radius_m: number };

export type PengaturanPresensi = {
  /** Presensi diterima bila berada dalam radius SALAH SATU titik. */
  titik: TitikPresensi[];
  /** Sesi pertama hari pertama (kompatibilitas; yang dipakai penilaian = jadwal sesi). */
  buka_at: string; // ISO
  tutup_at: string; // ISO
  akurasi_maks_m: number;
  tempat: string | null;
  /** (8 Okt 2026) Aturan sesi per hari (jam WIB) -- berlaku di setiap hari kegiatan. */
  sesi: AturanSesi[];
  /** Hari kegiatan (YYYY-MM-DD, WIB) -- tempat aturan sesi berlaku. */
  hari: string[];
  /** Jadwal konkret = aturan sesi x hari kegiatan. */
  jadwal: SesiPresensi[];
  /** (9 Okt 2026) Batas presensi SUSULAN (ISO): sesi yang sudah ditutup boleh disusul dari mana saja sampai waktu ini, tercatat TERLAMBAT. null = tidak ada. */
  susulan_sampai?: string | null;
};

export type PosisiPeserta = { lat: number; lng: number; akurasi: number };

/** Label 5 foto Transport Lokal (urut slot 1..5) utk tampilan ringkas. */
export const LABEL_SLOT_FOTO = ["Berangkat", "Tiba di lokasi pelatihan", "Saat pelatihan", "Saat akan pulang", "Tiba di kediaman"] as const;

/** (8 Okt 2026) Foto Transport Lokal dibagi dua langkah: slot 1-3 diunggah SEBELUM posttest, sisanya (4-5) SESUDAH posttest; boleh dicicil satu per satu. */
export const FOTO_SEBELUM_POSTTEST = 3;
export function bagiFoto(total: number): { awal: number[]; akhir: number[] } {
  const semua = Array.from({ length: total }, (_, i) => i + 1);
  return { awal: semua.filter((s) => s <= FOTO_SEBELUM_POSTTEST), akhir: semua.filter((s) => s > FOTO_SEBELUM_POSTTEST) };
}

/** Jarak dua titik (meter), rumus haversine. */
export function jarakMeter(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type KodeNilaiPresensi = "ok" | "belum_buka" | "sudah_tutup" | "akurasi" | "luar";
export type HasilNilaiPresensi = { kode: KodeNilaiPresensi; jarak_m: number; titik_nama: string | null; pesan: string };

export function posisiValid(p: unknown): p is PosisiPeserta {
  if (!p || typeof p !== "object") return false;
  const { lat, lng, akurasi } = p as Record<string, unknown>;
  return (
    typeof lat === "number" && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lng === "number" && Number.isFinite(lng) && lng >= -180 && lng <= 180 &&
    typeof akurasi === "number" && Number.isFinite(akurasi) && akurasi >= 0
  );
}

const bulatkan = (n: number) => Math.round(n);
const teksJarak = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1).replace(".", ",")} km` : `${bulatkan(m)} m`);
export { teksJarak };

/** Titik terdekat dari posisi peserta + jaraknya (meter) + apakah di dalam radius titik itu. */
export function titikTerdekat(pos: { lat: number; lng: number }, titik: TitikPresensi[]): { titik: TitikPresensi; jarak_m: number; dalam: boolean } | null {
  let terbaik: { titik: TitikPresensi; jarak_m: number; dalam: boolean } | null = null;
  for (const t of titik) {
    const j = jarakMeter(pos.lat, pos.lng, t.lat, t.lng);
    const dalam = j <= t.radius_m;
    // prioritas: titik yang melingkupi posisi (jarak terdekat); jika tidak ada, titik terdekat
    if (!terbaik || (dalam && !terbaik.dalam) || (dalam === terbaik.dalam && j < terbaik.jarak_m)) terbaik = { titik: t, jarak_m: j, dalam };
  }
  return terbaik;
}

/** Ringkasan titik utk teks: "Mami Hotel Solok atau Ully Hotel Solok". */
export const namaTitik = (titik: TitikPresensi[]) => titik.map((t) => t.nama).join(" atau ");

/** Nilai satu percobaan presensi. Urutan cek: jam -> akurasi GPS -> jarak ke titik terdekat. */
export function nilaiPresensi(pos: PosisiPeserta, p: PengaturanPresensi, sekarang: Date): HasilNilaiPresensi {
  const t = sekarang.getTime();
  const dekat = titikTerdekat(pos, p.titik);
  const jarak = dekat?.jarak_m ?? Infinity;
  const nama = dekat?.titik.nama ?? null;
  if (!dekat) return { kode: "luar", jarak_m: jarak, titik_nama: null, pesan: "Titik lokasi presensi belum diatur panitia." };
  if (t < new Date(p.buka_at).getTime()) return { kode: "belum_buka", jarak_m: jarak, titik_nama: nama, pesan: "Presensi belum dibuka." };
  if (t >= new Date(p.tutup_at).getTime()) return { kode: "sudah_tutup", jarak_m: jarak, titik_nama: nama, pesan: "Presensi sudah ditutup. Hubungi panitia." };
  if (pos.akurasi > p.akurasi_maks_m)
    return { kode: "akurasi", jarak_m: jarak, titik_nama: nama, pesan: `Sinyal lokasi (GPS) lemah: akurasi ±${bulatkan(pos.akurasi)} m, maksimal ±${p.akurasi_maks_m} m. Pindah ke area terbuka lalu segarkan lokasi.` };
  if (!dekat.dalam) return { kode: "luar", jarak_m: jarak, titik_nama: nama, pesan: `Anda berada ${teksJarak(jarak)} dari ${nama} (titik terdekat), di luar radius ${dekat.titik.radius_m} m.` };
  return { kode: "ok", jarak_m: jarak, titik_nama: nama, pesan: `Anda berada ${teksJarak(jarak)} dari ${nama} (dalam radius ${dekat.titik.radius_m} m).` };
}

// ----------------------------------------------------------------------------------------------
// (8 Okt 2026) Sesi presensi per hari
// ----------------------------------------------------------------------------------------------
/** Aturan satu sesi presensi per hari. Jam "HH:MM" WIB. */
export type AturanSesi = { nama: string; buka: string; tutup: string };
export const MAKS_SESI = 3;
export const SESI_BAWAAN: AturanSesi[] = [{ nama: "Presensi", buka: "06:00", tutup: "18:00" }];

/** Isian awal saat panitia mengubah jumlah sesi per hari (jam masih bisa disesuaikan). */
export function sesiBawaan(jumlah: number): AturanSesi[] {
  if (jumlah >= 3)
    return [
      { nama: "Pagi", buka: "06:00", tutup: "10:00" },
      { nama: "Siang", buka: "10:00", tutup: "14:00" },
      { nama: "Sore", buka: "14:00", tutup: "18:00" },
    ];
  if (jumlah === 2)
    return [
      { nama: "Pagi", buka: "06:00", tutup: "12:00" },
      { nama: "Sore", buka: "12:00", tutup: "18:00" },
    ];
  return SESI_BAWAAN.map((x) => ({ ...x }));
}

const POLA_JAM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Periksa & rapikan aturan sesi dari input mentah. Sesi harus berurutan dan tidak saling tumpang-tindih. */
export function validasiSesi(x: unknown): { ok: true; sesi: AturanSesi[] } | { ok: false; error: string } {
  if (!Array.isArray(x) || x.length < 1 || x.length > MAKS_SESI) return { ok: false, error: `Jumlah presensi per hari harus 1 sampai ${MAKS_SESI}.` };
  const hasil: AturanSesi[] = [];
  for (let i = 0; i < x.length; i++) {
    const o = (x[i] ?? {}) as Record<string, unknown>;
    const nama = String(o.nama ?? "").trim().slice(0, 30) || (x.length === 1 ? "Presensi" : "");
    const buka = String(o.buka ?? "").trim();
    const tutup = String(o.tutup ?? "").trim();
    const no = x.length === 1 ? "Presensi" : `Sesi ${i + 1}`;
    if (!nama) return { ok: false, error: `${no}: nama sesi wajib diisi (mis. Pagi).` };
    if (!POLA_JAM.test(buka) || !POLA_JAM.test(tutup)) return { ok: false, error: `${no}: jam buka/tutup harus berformat JJ:MM.` };
    if (tutup <= buka) return { ok: false, error: `${no}: jam tutup harus setelah jam buka.` };
    if (hasil.length && buka < hasil[hasil.length - 1].tutup) return { ok: false, error: `${no}: jam buka tidak boleh sebelum sesi sebelumnya tutup (${hasil[hasil.length - 1].tutup}).` };
    hasil.push({ nama, buka, tutup });
  }
  return { ok: true, sesi: hasil };
}

export type SesiPresensi = { kunci: string; tanggal: string; no: number; nama: string; buka_at: string; tutup_at: string };
export const kunciSesi = (tanggal: string, no: number) => `${tanggal}#${no}`;

/** Tanggal WIB (YYYY-MM-DD) dari waktu epoch (ms). */
export const tanggalWib = (ms: number) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);

/** Hari kegiatan (YYYY-MM-DD, urut, maks. 31 hari); tanpa tanggal kegiatan -> hari `cadangan`. */
export function hariKegiatan(mulai: string | null | undefined, selesai: string | null | undefined, cadangan: string): string[] {
  const m = (mulai ?? "").slice(0, 10);
  const s = (selesai ?? "").slice(0, 10) || m;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m) || !/^\d{4}-\d{2}-\d{2}$/.test(s) || s < m) return [cadangan];
  const hasil: string[] = [];
  for (let t = Date.parse(`${m}T00:00:00Z`); hasil.length < 31; t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (d > s) break;
    hasil.push(d);
  }
  return hasil.length ? hasil : [cadangan];
}

/** Aturan sesi x hari kegiatan -> jadwal konkret (ISO). */
export function jadwalSesi(aturan: AturanSesi[], hari: string[]): SesiPresensi[] {
  const hasil: SesiPresensi[] = [];
  for (const tanggal of hari)
    aturan.forEach((a, i) => hasil.push({ kunci: kunciSesi(tanggal, i + 1), tanggal, no: i + 1, nama: a.nama, buka_at: new Date(`${tanggal}T${a.buka}:00+07:00`).toISOString(), tutup_at: new Date(`${tanggal}T${a.tutup}:00+07:00`).toISOString() }));
  return hasil;
}

/** Ubah "HH:MM" dari ISO -> jam WIB. */
export const jamDariIso = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(11, 16);

/** Aturan bawaan dari jam buka/tutup lama (satu sesi) -- untuk pengaturan yang dibuat sebelum fitur sesi. */
export function aturanDariJamLama(bukaIso: string, tutupIso: string): AturanSesi[] {
  if (Number.isNaN(new Date(bukaIso).getTime()) || Number.isNaN(new Date(tutupIso).getTime())) return SESI_BAWAAN.map((x) => ({ ...x }));
  const buka = jamDariIso(bukaIso);
  const tutup = jamDariIso(tutupIso);
  return tutup > buka ? [{ nama: "Presensi", buka, tutup }] : SESI_BAWAAN.map((x) => ({ ...x }));
}

/** Hari yang dipakai untuk tampilan "hari ini": hari ini bila termasuk hari kegiatan, selain itu hari terdekat. */
export function hariFokus(hari: string[], sekarangMs: number): string {
  const t = tanggalWib(sekarangMs);
  if (hari.includes(t)) return t;
  return t < hari[0] ? hari[0] : hari[hari.length - 1];
}

/** Rekam presensi diterima (satu per sesi per hari). */
export type RekamPresensi = { tanggal: string; sesi_no: number; at: string; jarak_m: number | null; manual: boolean; titik_nama: string | null; terlambat?: boolean };
export type StatusSesi = "selesai" | "terbuka" | "menunggu" | "terlewat";
/** Satu sesi hari ini beserta catatan presensi peserta (at != null = sudah tercatat). */
export type SesiHari = SesiPresensi & { at: string | null; jarak_m: number | null; manual: boolean; titik_nama: string | null; terlambat?: boolean };
export type RingkasHari = { tanggal: string; sesi_hari: SesiHari[] };

export function susunHari(jadwal: SesiPresensi[], rekam: RekamPresensi[], sekarangMs: number): RingkasHari {
  const tanggal = hariFokus([...new Set(jadwal.map((s) => s.tanggal))].sort(), sekarangMs);
  const per = new Map(rekam.map((r) => [kunciSesi(r.tanggal, r.sesi_no), r]));
  return {
    tanggal,
    sesi_hari: jadwal
      .filter((s) => s.tanggal === tanggal)
      .map((s) => {
        const r = per.get(s.kunci);
        return { ...s, at: r?.at ?? null, jarak_m: r?.jarak_m ?? null, manual: !!r?.manual, titik_nama: r?.titik_nama ?? null, terlambat: !!r?.terlambat };
      }),
  };
}

export const statusSesi = (s: { at: string | null; buka_at: string; tutup_at: string }, ms: number): StatusSesi =>
  s.at ? "selesai" : ms >= new Date(s.tutup_at).getTime() ? "terlewat" : ms >= new Date(s.buka_at).getTime() ? "terbuka" : "menunggu";

/** (9 Okt 2026) Presensi susulan masih dibuka pada waktu `ms`? */
export const susulanTerbuka = (susulanSampai: string | null | undefined, ms: number) => !!susulanSampai && ms < new Date(susulanSampai).getTime();

export type KeadaanHari = {
  sesi: (SesiHari & { status: StatusSesi })[];
  selesai: number;
  total: number;
  /** Semua sesi hari ini sudah tercatat -> peringatan lokasi padam. */
  lengkap: boolean;
  /** Sesi yang sedang dibuka dan belum tercatat (null bila tidak ada). */
  aktif: (SesiHari & { status: StatusSesi }) | null;
  /** Sesi berikutnya yang belum dibuka (hanya bila tidak ada sesi aktif). */
  berikutnya: (SesiHari & { status: StatusSesi }) | null;
  /** Ada sesi yang tidak tercatat dan waktunya sudah lewat. */
  ada_terlewat: boolean;
  /** (9 Okt 2026) Sesi terlewat yang masih bisa disusul (presensi terlambat, bebas lokasi) -- kosong bila susulan tidak dibuka. */
  susulan: (SesiHari & { status: StatusSesi })[];
};

/** Keadaan presensi hari ini pada waktu `ms` (dihitung ulang di browser tiap detik). */
export function keadaanHari(h: RingkasHari, ms: number, susulanSampai?: string | null): KeadaanHari {
  const sesi = h.sesi_hari.map((s) => ({ ...s, status: statusSesi(s, ms) }));
  const selesai = sesi.filter((s) => s.status === "selesai").length;
  const aktif = sesi.find((s) => s.status === "terbuka") ?? null;
  return {
    sesi,
    selesai,
    total: sesi.length,
    lengkap: sesi.length > 0 && selesai === sesi.length,
    aktif,
    berikutnya: aktif ? null : sesi.find((s) => s.status === "menunggu") ?? null,
    ada_terlewat: sesi.some((s) => s.status === "terlewat"),
    susulan: susulanTerbuka(susulanSampai, ms) && !aktif ? sesi.filter((s) => s.status === "terlewat") : [],
  };
}
