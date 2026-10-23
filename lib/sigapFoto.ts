// lib/sigapFoto.ts  (logika murni, tanpa database/crypto -- aman diimpor klien dan server)
//
// (19 Okt 2026) Kamera SIGAP: aturan waktu resmi, tingkat kepercayaan (hijau/kuning/merah), kode verifikasi,
// masa simpan, dan penentuan mode (kamera/unggah). Keputusan user: masa simpan 3 tahun; foto TIDAK dihapus
// otomatis; tag di luar tim boleh menjadi bukti kegiatan penerima; saklar kamera/unggah per kegiatan + bawaan global.

/** Masa simpan foto kamera (tahun). Keputusan user 19 Okt 2026. Dihitung dari tanggal selesai kegiatan (atau tanggal foto). */
export const MASA_SIMPAN_TAHUN = 3;
/** Foto yang tidak pernah diterima sebagai nomor foto mana pun ditandai kedaluwarsa setelah sekian hari (hanya TANDA, bukan hapus). */
export const HARI_KEDALUWARSA_TANPA_TAG = 90;
export const MAKS_TAG = 8;
export const JUMLAH_NOMOR_FOTO = 5;

// (20 Okt 2026) 100 m -> 300 m: akurasi sampai 300 m dianggap wajar (tanpa penanda, tanpa menunggu); di atas ini foto diterima sebagai dispensasi berpenanda "perlu diperiksa" (kuning), lihat di bawah
export const MAKS_AKURASI_M = 300;
/** Dispensasi akurasi: 300-5000 m diterima tetapi ditandai kuning "akurasi_kasar" untuk diperiksa PML/admin; di atas 5000 m ditolak (lokasi tak bermakna). */
export const MAKS_AKURASI_DISPENSASI_M = 5000;
/** Petugas menunggu sekian detik (sambil mengikuti panduan) sebelum tombol potret dispensasi aktif. */
export const TUNGGU_AKURASI_KASAR_DTK = 30;
export const UMUR_TOKEN_MS = 30 * 60_000; // token potret berlaku 30 menit sejak diminta
export const UMUR_POSISI_KUNING_MS = 2 * 60_000; // posisi GPS lebih tua dari ini saat potret = kuning
export const BEDA_JAM_KUNING_DETIK = 120;
export const BEDA_JAM_MERAH_DETIK = 3600;
export const BEDA_MONO_WALL_KUNING_DETIK = 120;
export const KECEPATAN_MERAH_KMJAM = 120;
// (20 Okt 2026) 2 km -> 5 km: wilayah tugas luas (KK tersebar 6-8 km dari rumah); jarak diukur ke titik terdekat dari KK ATAU rumah petugas (jarakEfektifM)
export const WILAYAH_KUNING_M = 5000;
// Batas pembeda alasan "luar_wilayah_dekat" (5-10 km) dan "jauh_dari_wilayah" (> 10 km); sejak 23 Okt 2026 keduanya kuning, bukan merah.
export const WILAYAH_MERAH_M = 10_000;
export const AMBANG_MIRIP_BIT = 10; // jarak Hamming dHash 64-bit yang dianggap "mirip"
export const SLOT_BERLOKASI = [2, 3, 4] as const; // nomor foto yang diwajibkan berada di wilayah tugas

export type ModeFoto = "kamera" | "unggah";
export type ModeKegiatan = "ikuti" | ModeFoto;
export type Kepercayaan = "hijau" | "kuning" | "merah";
export type StatusTag = "diajukan" | "diterima" | "ditolak" | "ditahan" | "dilepas";
export type PeranTag = "pemotret" | "tim" | "luar_tim";
export type StatusPeriksa = "belum" | "diperiksa" | "dipertanyakan";

/** Mode efektif sebuah kegiatan: pengaturan kegiatan bila bukan "ikuti", selain itu bawaan global. */
export function modeEfektif(bawaan: ModeFoto | null | undefined, kegiatan: ModeKegiatan | null | undefined): ModeFoto {
  if (kegiatan === "kamera" || kegiatan === "unggah") return kegiatan;
  return bawaan === "kamera" ? "kamera" : "unggah";
}

// ------------------------------------------------------------------ kode verifikasi
const ABJAD_HEX = /^[0-9A-F]{12}$/;

/** Dari 6 byte acak -> SGP-XXXX-XXXX-XXXX. */
export function kodeDariByte(b: Uint8Array): string {
  if (b.length < 6) throw new Error("Butuh 6 byte.");
  const hex = Array.from(b.slice(0, 6), (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `SGP-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

/** Merapikan kode ketikan/pindaian (huruf kecil, spasi, tanpa strip, "O"->"0") -> bentuk baku atau null. */
export function normalisasiKode(s: unknown): string | null {
  if (typeof s !== "string") return null;
  let x = s.toUpperCase().replace(/[\s-]/g, "");
  if (x.startsWith("SGP")) x = x.slice(3);
  x = x.replace(/O/g, "0");
  if (!ABJAD_HEX.test(x)) return null;
  return `SGP-${x.slice(0, 4)}-${x.slice(4, 8)}-${x.slice(8, 12)}`;
}

/** Alamat halaman verifikasi untuk QR (dipakai di cap). */
export function urlVerifikasi(kode: string, asal: string): string {
  return `${asal.replace(/\/+$/, "")}/verifikasi?k=${encodeURIComponent(kode)}`;
}

// ------------------------------------------------------------------ waktu resmi
export type MasukanWaktu = {
  /** Waktu server (ms epoch) saat token potret diterbitkan; null = tanpa token. */
  tokenT: number | null;
  /** Jam monotonik HP (performance.now) sejak token diterima sampai tombol potret ditekan. */
  elapsedMonoMs: number | null;
  /** Jam dinding HP (Date.now) selisih pada rentang yang sama. */
  elapsedWallMs: number | null;
  /** Date.now() HP saat tombol potret ditekan. */
  waktuHpMs: number | null;
  /** Waktu server saat berkas diterima. */
  terimaMs: number;
};
export type HasilWaktu = { diambilMs: number; terverifikasi: boolean; selisihHpDetik: number | null; bendera: string[] };

/**
 * Waktu resmi foto = waktu server saat token terbit + jam monotonik HP. Jam monotonik tidak ikut berubah bila
 * pengguna memajukan/memundurkan jam HP. Tanpa token (mis. foto antre lama) -> waktu terima server, bendera kuning.
 * Waktu resmi tidak pernah lebih akhir daripada waktu terima.
 */
export function waktuResmi(m: MasukanWaktu): HasilWaktu {
  const bendera: string[] = [];
  const adaToken = m.tokenT !== null && m.elapsedMonoMs !== null && m.elapsedMonoMs >= 0 && Number.isFinite(m.elapsedMonoMs) && m.elapsedMonoMs <= UMUR_TOKEN_MS;
  let diambilMs = m.terimaMs;
  let terverifikasi = false;
  if (adaToken) {
    const t = (m.tokenT as number) + (m.elapsedMonoMs as number);
    if (t <= m.terimaMs + 5000) {
      diambilMs = Math.min(t, m.terimaMs);
      terverifikasi = true;
    } else {
      bendera.push("waktu_tidak_wajar");
    }
  }
  if (!terverifikasi) bendera.push("waktu_belum_terverifikasi");
  let selisihHpDetik: number | null = null;
  if (m.waktuHpMs !== null && Number.isFinite(m.waktuHpMs)) selisihHpDetik = Math.round((m.waktuHpMs - diambilMs) / 1000);
  if (terverifikasi && m.elapsedWallMs !== null && m.elapsedMonoMs !== null) {
    if (Math.abs(m.elapsedWallMs - m.elapsedMonoMs) / 1000 > BEDA_MONO_WALL_KUNING_DETIK) bendera.push("jam_hp_berubah_atau_tidur");
  }
  return { diambilMs, terverifikasi, selisihHpDetik, bendera };
}

// ------------------------------------------------------------------ jarak & kecepatan
/**
 * Jarak efektif ke "wilayah" untuk penilaian: titik terdekat dari KK wilayah tugas ATAU rumah petugas (petugas umumnya tinggal di dalam/dekat wilayahnya).
 * Wilayah tidak dikenal (jarakKkM null) = tidak dinilai (null). 99999 = tidak ada KK dalam ~11 km. Rumah tak diketahui = hanya KK.
 */
export function jarakEfektifM(jarakKkM: number | null, jarakRumahM: number | null): number | null {
  if (jarakKkM === null) return null;
  if (jarakRumahM === null || !Number.isFinite(jarakRumahM)) return jarakKkM;
  return Math.min(jarakKkM, Math.round(jarakRumahM));
}
export function jarakM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Kecepatan (km/jam) antara dua foto berurutan; null bila selisih waktu < 1 detik atau data kurang. */
export function kecepatanKmJam(a: { lat: number; lng: number; ms: number }, b: { lat: number; lng: number; ms: number }): number | null {
  const dt = Math.abs(b.ms - a.ms) / 1000;
  if (dt < 1) return null;
  return (jarakM(a.lat, a.lng, b.lat, b.lng) / dt) * 3.6;
}

/** Jarak Hamming dua sidik gambar heksa (64 bit = 16 karakter). Null bila bentuk tidak sama. */
export function jarakHamming(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b || a.length !== b.length || !/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return null;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      n += x & 1;
      x >>= 1;
    }
  }
  return n;
}

// ------------------------------------------------------------------ tingkat kepercayaan
export type MasukanKepercayaan = {
  akurasiM: number;
  waktu: HasilWaktu;
  /** umur pembacaan GPS saat potret (ms); null = tidak diketahui */
  umurPosisiMs: number | null;
  /** jarak ke wilayah tugas (m) bila slot berlokasi dan wilayah dikenal; null = tidak dinilai */
  jarakWilayahM: number | null;
  /** kecepatan dari foto sebelumnya pemotret yang sama (km/jam); null = tidak ada pembanding */
  kecepatanKmJam: number | null;
  /** koordinat identik (6 desimal) dengan foto lain pemotret di hari berbeda pada slot berlokasi */
  koordinatIdentik: boolean;
  /** jarak Hamming terkecil ke foto lain (semua pemotret); null = tidak ada */
  hammingTerdekat: number | null;
};
export type HasilKepercayaan = { tingkat: Kepercayaan; alasan: string[] };

export const LABEL_ALASAN: Record<string, string> = {
  waktu_belum_terverifikasi: "Waktu memakai jam server saat berkas diterima (tanpa token potret)",
  waktu_tidak_wajar: "Waktu dari token tidak wajar",
  jam_hp_berubah_atau_tidur: "Jam HP berubah atau HP tidur saat potret",
  jam_hp_beda_kecil: "Jam HP berbeda dari jam resmi lebih dari 2 menit",
  jam_hp_beda_besar: "Jam HP berbeda dari jam resmi lebih dari 1 jam",
  akurasi_sedang: "Akurasi GPS 30-100 m", // kode lama (sebelum 20 Okt 2026); tidak lagi diberikan
  akurasi_kasar: "Akurasi GPS lebih dari 300 m (dispensasi, perlu diperiksa)",
  posisi_basi: "Pembacaan GPS sudah lama sebelum potret",
  luar_wilayah_dekat: "Titik 5-10 km dari KK wilayah tugas dan dari rumah petugas",
  jauh_dari_wilayah: "Titik lebih dari 10 km dari KK wilayah tugas dan dari rumah petugas",
  kecepatan_tak_wajar: "Perpindahan dari foto sebelumnya lebih cepat dari 120 km/jam",
  koordinat_identik: "Koordinat sama persis dengan foto di hari lain",
  mirip_foto_lain: "Gambar mirip foto lain yang sudah tersimpan",
};

/** Menggabungkan semua pemeriksaan menjadi hijau/kuning/merah beserta alasannya. Penolakan keras (akurasi > 5000 m, duplikat) dilakukan di luar fungsi ini. */
export function nilaiKepercayaan(m: MasukanKepercayaan): HasilKepercayaan {
  const merah: string[] = [];
  const kuning: string[] = [];
  for (const b of m.waktu.bendera) (b === "waktu_tidak_wajar" ? merah : kuning).push(b);
  const s = m.waktu.selisihHpDetik;
  if (s !== null) {
    if (Math.abs(s) > BEDA_JAM_MERAH_DETIK) merah.push("jam_hp_beda_besar");
    else if (Math.abs(s) > BEDA_JAM_KUNING_DETIK) kuning.push("jam_hp_beda_kecil");
  }
  if (m.akurasiM > MAKS_AKURASI_M) kuning.push("akurasi_kasar");
  if (m.umurPosisiMs !== null && m.umurPosisiMs > UMUR_POSISI_KUNING_MS) kuning.push("posisi_basi");
  if (m.jarakWilayahM !== null) {
    // (23 Okt 2026) > 10 km TIDAK lagi merah/ditahan: foto tetap masuk nomor, hanya ditandai kuning untuk diperiksa PML/admin.
    if (m.jarakWilayahM > WILAYAH_MERAH_M) kuning.push("jauh_dari_wilayah");
    else if (m.jarakWilayahM > WILAYAH_KUNING_M) kuning.push("luar_wilayah_dekat");
  }
  if (m.kecepatanKmJam !== null && m.kecepatanKmJam > KECEPATAN_MERAH_KMJAM) merah.push("kecepatan_tak_wajar");
  if (m.koordinatIdentik) kuning.push("koordinat_identik");
  if (m.hammingTerdekat !== null && m.hammingTerdekat <= AMBANG_MIRIP_BIT) kuning.push("mirip_foto_lain");
  const alasan = [...merah, ...kuning];
  return { tingkat: merah.length ? "merah" : kuning.length ? "kuning" : "hijau", alasan };
}

// ------------------------------------------------------------------ masa simpan
function tambahTahun(iso: string, tahun: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y + tahun, m - 1, d));
  if (t.getUTCMonth() !== m - 1) t.setUTCDate(0); // 29 Feb -> 28 Feb
  return t.toISOString().slice(0, 10);
}

/** Tanggal "simpan sampai" = (tanggal selesai kegiatan, atau tanggal foto bila kosong) + MASA_SIMPAN_TAHUN. Hanya TANDA; tidak ada hapus otomatis. */
export function simpanSampai(tanggalSelesaiKegiatan: string | null | undefined, tanggalFoto: string): string {
  const dasar = tanggalSelesaiKegiatan && tanggalSelesaiKegiatan > tanggalFoto ? tanggalSelesaiKegiatan : tanggalFoto;
  return tambahTahun(dasar, MASA_SIMPAN_TAHUN);
}

/** Tanggal kedaluwarsa untuk foto tanpa tag diterima: tanggal foto + 90 hari (hanya tanda untuk daftar usulan hapus). */
export function kedaluwarsaTanpaTag(tanggalFoto: string): string {
  const t = new Date(`${tanggalFoto}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + HARI_KEDALUWARSA_TANPA_TAG);
  return t.toISOString().slice(0, 10);
}

// ------------------------------------------------------------------ cap (teks yang dicetak)
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** "Senin, 19 Okt 2026 · 14.32.07 WIB" dari ms epoch. */
export function teksWaktuWib(ms: number): string {
  const d = new Date(ms + 7 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${p(d.getUTCHours())}.${p(d.getUTCMinutes())}.${p(d.getUTCSeconds())} WIB`;
}

/** "-0.7893, 100.6512 (±12 m)". */
export function teksKoordinat(lat: number, lng: number, akurasiM: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)} (±${Math.round(akurasiM)} m)`;
}

export const WARNA_KEPERCAYAAN: Record<Kepercayaan, string> = { hijau: "#1E8E4E", kuning: "#B7791F", merah: "#C0392B" };
export const LABEL_KEPERCAYAAN: Record<Kepercayaan, string> = { hijau: "Wajar", kuning: "Perlu perhatian", merah: "Ditahan, perlu diperiksa" };

// (23 Okt 2026) Status yang dilihat PETUGAS: mengikuti hasil pemeriksaan PML/admin, bukan hanya tingkat kepercayaan sistem.
// Sebelumnya foto merah yang sudah ditandai "Diperiksa" tetap berlabel "Ditahan, perlu diperiksa" di Foto saya.
export type NadaPeriksa = "hijau" | "biru" | "kuning" | "merah";
export type TampilPeriksa = { label: string; nada: NadaPeriksa; /** true = masih menunggu keputusan PML/admin (alasan perlu ditampilkan) */ perhatian: boolean };
export const WARNA_NADA_PERIKSA: Record<NadaPeriksa, string> = { hijau: "#1E8E4E", biru: "#1F5FA8", kuning: "#B7791F", merah: "#C0392B" };
export function statusPemeriksaan(kepercayaan: Kepercayaan, statusPeriksa: string | null | undefined): TampilPeriksa {
  if (statusPeriksa === "diperiksa") return { label: "Sudah diperiksa", nada: "biru", perhatian: false };
  if (statusPeriksa === "dipertanyakan") return { label: "Dipertanyakan PML/admin", nada: "kuning", perhatian: true };
  if (kepercayaan === "merah") return { label: "Ditahan, menunggu diperiksa", nada: "merah", perhatian: true };
  if (kepercayaan === "kuning") return { label: "Menunggu diperiksa", nada: "kuning", perhatian: true };
  return { label: "Wajar", nada: "hijau", perhatian: false };
}

// ------------------------------------------------------------------ validasi masukan
export function posisiMasukanValid(p: unknown): p is { lat: number; lng: number; akurasi: number } {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.lat === "number" && typeof o.lng === "number" && typeof o.akurasi === "number" &&
    Number.isFinite(o.lat) && Number.isFinite(o.lng) && Number.isFinite(o.akurasi) &&
    Math.abs(o.lat) <= 90 && Math.abs(o.lng) <= 180 && o.akurasi >= 0 &&
    // Indonesia kasar: menolak titik (0,0) dan nilai asal-asalan
    o.lat >= -12 && o.lat <= 7 && o.lng >= 94 && o.lng <= 142
  );
}

export function slotValid(n: unknown): n is 1 | 2 | 3 | 4 | 5 {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= JUMLAH_NOMOR_FOTO;
}

export function slotBerlokasi(n: number): boolean {
  return (SLOT_BERLOKASI as readonly number[]).includes(n);
}

/** Aturan siapa boleh dipilih sebagai penerima tag. Mengembalikan pesan galat atau null bila boleh. */
export function cekJumlahTag(jumlahSudah: number, jumlahBaru: number): string | null {
  if (jumlahSudah + jumlahBaru > MAKS_TAG) return `Maksimal ${MAKS_TAG} orang per foto.`;
  return null;
}
