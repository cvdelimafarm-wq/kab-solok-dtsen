// lib/pushPengaturan.ts  (logika murni; aman diimpor klien dan server)
//
// (31 Okt 2026) PENGATURAN NOTIFIKASI OTOMATIS PER KEGIATAN (tab "3 · Notifikasi" di Kelola Pendataan). Satu baris di sigap_push_pengaturan
// = (kegiatan, kunci) -> aktif + nilai (jsonb). BARIS TIDAK ADA = BAWAAN (aturan umum di berkas ini), jadi kegiatan baru langsung berjalan tanpa
// seseorang menyentuh pengaturan. Berkas ini memuat: kunci, bawaan, pembacaan aman, validasi simpan, penentuan tahap yang jatuh tempo,
// penggabungan riwayat, dan status denyut cron. Pelaksana: lib/portal/pushTerkelola.ts dan app/api/sigap/pengingat-push (slot=auto).
//
// KUNCI
//   translok      pengingat Translok tiga tahap (13.00 / 17.00 / 21.00): hanya petugas yang HARI INI hari Translok-nya (itu aturan kode, bukan pengaturan).
//   umum          batas total push per petugas per hari (dipakai pesan penyemangat dan penutup; tahap berikutnya)
//   fasih_*       enam notifikasi alur FASIH (khusus Pendataan Pascabencana): bawaan MENYALA
//
// ATURAN TRANSLOK (permintaan user 31 Okt 2026):
//   tahap 1 (bawaan 13.00)  dikirim bila petugas BELUM punya `foto1` foto (bawaan 1)
//   tahap 2 (bawaan 17.00)  dikirim bila petugas BELUM punya `foto2` foto (bawaan 4)
//   tahap 3 (bawaan 21.00)  dikirim bila hari ini MASIH BELUM LENGKAP (terakhir; tidak ada pengingat sesudahnya)
//   jarak antar tahap minimal `jarak_jam` (bawaan 4 jam: 13.00 -> 17.00 -> 21.00). Foto yang disyaratkan tidak melebihi jumlah foto kegiatan itu (mis. kegiatan 3 foto).

export type TahapTranslok = 1 | 2 | 3;

export type KunciFasih = "fasih_minta" | "fasih_kolam" | "fasih_batal" | "fasih_keluar" | "fasih_tolak" | "fasih_tugas";
export type KunciPush = "translok" | "umum" | KunciFasih;

export const KUNCI_FASIH: { kunci: KunciFasih; label: string; ket: string }[] = [
  { kunci: "fasih_minta", label: "PML meminta daftar KK ke FASIH", ket: "Ke admin pendataan, saat PML mengajukan permintaan daftar." },
  { kunci: "fasih_kolam", label: "PML mengambil dari kolam wilayah", ket: "Ke admin pendataan, saat PML mengambil Sub SLS dari kolam." },
  { kunci: "fasih_batal", label: "PML membatalkan permintaan", ket: "Ke admin dan PPL terkait." },
  { kunci: "fasih_keluar", label: "Daftar KK sudah keluar di FASIH", ket: "Ke PML dan PPL, saat admin menandai sudah keluar." },
  { kunci: "fasih_tolak", label: "Permintaan ditolak admin", ket: "Ke PML, berikut alasan penolakan." },
  { kunci: "fasih_tugas", label: "Penugasan Sub SLS dari admin", ket: "Ke PML dan PPL (dan PML lama bila Sub SLS dipindah)." },
];

export const KUNCI_SAH: KunciPush[] = ["translok", "umum", ...KUNCI_FASIH.map((x) => x.kunci)];
export const adalahKunciPush = (x: unknown): x is KunciPush => typeof x === "string" && (KUNCI_SAH as string[]).includes(x);
export const adalahKunciFasih = (x: unknown): x is KunciFasih => typeof x === "string" && KUNCI_FASIH.some((f) => f.kunci === x);

/** Jenis baris di sigap_push_log untuk notifikasi alur FASIH: `alur_fasih_minta`, dst. */
export const jenisLogFasih = (k: KunciFasih): string => `alur_${k}`;

// ---------------------------------------------------------------------------------------------------------------- bawaan + pembacaan
export type SetelanTranslok = { aktif: boolean; jam1: string; jam2: string; jam3: string; foto1: number; foto2: number; jarak_jam: number };
export const BAWAAN_TRANSLOK: SetelanTranslok = { aktif: true, jam1: "13:00", jam2: "17:00", jam3: "21:00", foto1: 1, foto2: 4, jarak_jam: 4 };

export type SetelanUmum = { maks_harian: number };
export const BAWAAN_UMUM: SetelanUmum = { maks_harian: 5 };

/** Baris tabel sigap_push_pengaturan (tanpa kegiatan_id; pemanggil sudah menyaring per kegiatan). */
export type BarisPengaturan = { kunci: string; aktif: boolean; nilai?: unknown };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** "HH:MM" kelipatan 5 menit -> menit sejak 00.00; selain itu null. */
export function menitDariJam(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s.trim());
  if (!m) return null;
  const mnt = Number(m[2]);
  if (mnt % 5 !== 0) return null;
  return Number(m[1]) * 60 + mnt;
}
export const jamDariMenit = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const bulat = (v: unknown, min: number, maks: number, awal: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= min && n <= maks ? n : awal;
};

/** Batas jam: tidak sebelum 06.00 dan tahap terakhir paling lambat 22.45 (jam senyap 23.00-05.59 WIB; cron memberi toleransi 15 menit). */
export const MENIT_PALING_AWAL = 6 * 60;
export const MENIT_PALING_AKHIR = 22 * 60 + 45;
export const TOLERANSI_MENIT = 15;

/** Pengaturan Translok efektif: baris ada -> nilainya (yang rusak diganti bawaan per bidang); tidak ada -> bawaan penuh. */
export function bacaTranslok(baris: BarisPengaturan[]): SetelanTranslok {
  const b = baris.find((x) => x.kunci === "translok");
  if (!b) return { ...BAWAAN_TRANSLOK };
  const n = obj(b.nilai);
  const jam = (k: "jam1" | "jam2" | "jam3") => (menitDariJam(n[k]) !== null ? (n[k] as string).trim() : BAWAAN_TRANSLOK[k]);
  const s: SetelanTranslok = {
    aktif: b.aktif,
    jam1: jam("jam1"),
    jam2: jam("jam2"),
    jam3: jam("jam3"),
    foto1: bulat(n.foto1, 1, 10, BAWAAN_TRANSLOK.foto1),
    foto2: bulat(n.foto2, 1, 10, BAWAAN_TRANSLOK.foto2),
    jarak_jam: bulat(n.jarak_jam, 1, 12, BAWAAN_TRANSLOK.jarak_jam),
  };
  // kombinasi tersimpan yang tidak masuk akal (urutan/jarak) -> kembali ke bawaan jam, supaya cron tidak mengirim kacau
  return cekUrutan(s) === null ? s : { ...s, jam1: BAWAAN_TRANSLOK.jam1, jam2: BAWAAN_TRANSLOK.jam2, jam3: BAWAAN_TRANSLOK.jam3, jarak_jam: BAWAAN_TRANSLOK.jarak_jam };
}

export function bacaUmum(baris: BarisPengaturan[]): SetelanUmum {
  const b = baris.find((x) => x.kunci === "umum");
  return { maks_harian: bulat(obj(b?.nilai).maks_harian, 1, 20, BAWAAN_UMUM.maks_harian) };
}

/** Notifikasi FASIH menyala? Tidak ada baris = menyala (perilaku sebelum ada pengaturan). */
export function fasihAktif(baris: BarisPengaturan[], kunci: KunciFasih): boolean {
  const b = baris.find((x) => x.kunci === kunci);
  return b ? b.aktif : true;
}

/** Pesan galat bila urutan/jarak tahap tidak sah; null = sah. */
export function cekUrutan(s: Pick<SetelanTranslok, "jam1" | "jam2" | "jam3" | "jarak_jam" | "foto1" | "foto2">): string | null {
  const a = menitDariJam(s.jam1);
  const b = menitDariJam(s.jam2);
  const c = menitDariJam(s.jam3);
  if (a === null || b === null || c === null) return "Jam harus berformat JJ:MM dengan menit kelipatan 5.";
  if (a < MENIT_PALING_AWAL) return "Pengingat pertama tidak boleh sebelum 06.00.";
  if (c > MENIT_PALING_AKHIR) return "Pengingat terakhir paling lambat 22.45 (23.00-05.59 WIB jam senyap).";
  if (!(a < b && b < c)) return "Urutan jam harus pertama < kedua < terakhir.";
  const jarak = s.jarak_jam * 60;
  if (b - a < jarak || c - b < jarak) return `Jarak antar pengingat minimal ${s.jarak_jam} jam.`;
  if (s.foto2 < s.foto1) return "Syarat foto pengingat kedua tidak boleh lebih kecil dari yang pertama.";
  return null;
}

// ---------------------------------------------------------------------------------------------------------------- waktu + tahap jatuh tempo
const WIB_MS = 7 * 3_600_000;
export const menitWib = (nowMs: number): number => {
  const d = new Date(nowMs + WIB_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
export const tanggalWib = (nowMs: number): string => new Date(nowMs + WIB_MS).toISOString().slice(0, 10);

/**
 * Tahap Translok yang jatuh tempo SEKARANG: sekarang berada dalam [jam, jam + 15 menit). Cron berjalan tiap 5 menit sehingga jendela itu terlewati 3 kali;
 * pengiriman ganda dicegah klaim (sigap_push_klaim). Null = tidak ada tahap atau pengaturan nonaktif.
 */
export function tahapJatuhTempo(s: SetelanTranslok, nowMs: number): TahapTranslok | null {
  if (!s.aktif) return null;
  const m = menitWib(nowMs);
  const tahap: [TahapTranslok, string][] = [[1, s.jam1], [2, s.jam2], [3, s.jam3]];
  for (const [t, jam] of tahap) {
    const j = menitDariJam(jam);
    if (j !== null && m >= j && m < j + TOLERANSI_MENIT) return t;
  }
  return null;
}

export const kunciKlaimTranslok = (t: TahapTranslok): string => `translok_${t}`;

// ---------------------------------------------------------------------------------------------------------------- validasi simpan
export type NilaiSimpan = { kegiatan: number; kunci: KunciPush; aktif: boolean; nilai: Record<string, unknown> };

/** Isi POST simpan dari Kelola. Mengembalikan nilai yang sudah dibersihkan, atau pesan galat. */
export function validasiSimpan(body: unknown, sekarang?: BarisPengaturan[]): { ok: true; nilai: NilaiSimpan } | { ok: false; pesan: string } {
  const b = obj(body);
  const kegiatan = Number(b.kegiatan);
  if (!Number.isInteger(kegiatan) || kegiatan <= 0) return { ok: false, pesan: "Kegiatan tidak sah." };
  if (!adalahKunciPush(b.kunci)) return { ok: false, pesan: "Jenis notifikasi tidak dikenal." };
  if (typeof b.aktif !== "boolean") return { ok: false, pesan: "Status nyala/mati harus ya atau tidak." };
  const kunci = b.kunci;
  if (kunci === "translok") {
    const dasar = bacaTranslok(sekarang ?? []);
    const n = obj(b.nilai);
    const gabung = {
      jam1: typeof n.jam1 === "string" ? n.jam1.trim() : dasar.jam1,
      jam2: typeof n.jam2 === "string" ? n.jam2.trim() : dasar.jam2,
      jam3: typeof n.jam3 === "string" ? n.jam3.trim() : dasar.jam3,
      foto1: n.foto1 === undefined ? dasar.foto1 : Number(n.foto1),
      foto2: n.foto2 === undefined ? dasar.foto2 : Number(n.foto2),
      jarak_jam: n.jarak_jam === undefined ? dasar.jarak_jam : Number(n.jarak_jam),
    };
    if (![gabung.foto1, gabung.foto2, gabung.jarak_jam].every((x) => Number.isInteger(x))) return { ok: false, pesan: "Jumlah foto dan jarak jam harus bilangan bulat." };
    if (gabung.foto1 < 1 || gabung.foto2 > 10) return { ok: false, pesan: "Syarat foto antara 1 dan 10." };
    if (gabung.jarak_jam < 1 || gabung.jarak_jam > 12) return { ok: false, pesan: "Jarak antar pengingat antara 1 dan 12 jam." };
    const salah = cekUrutan(gabung);
    if (salah) return { ok: false, pesan: salah };
    return { ok: true, nilai: { kegiatan, kunci, aktif: b.aktif, nilai: gabung } };
  }
  if (kunci === "umum") {
    const m = Number(obj(b.nilai).maks_harian ?? BAWAAN_UMUM.maks_harian);
    if (!Number.isInteger(m) || m < 1 || m > 20) return { ok: false, pesan: "Batas harian antara 1 dan 20." };
    return { ok: true, nilai: { kegiatan, kunci, aktif: b.aktif, nilai: { maks_harian: m } } };
  }
  return { ok: true, nilai: { kegiatan, kunci, aktif: b.aktif, nilai: {} } };
}

// ---------------------------------------------------------------------------------------------------------------- riwayat gabungan
export type BarisLog = { dibuat_at: string; jenis: string; judul: string | null; oleh_akun_id: number | null; jumlah_akun: number | null; jumlah_perangkat: number | null; terkirim: number | null; gagal: number | null };
export type EntriRiwayat = { waktu: string; jenis: string; label: string; judul: string; akun: number; perangkat: number; terkirim: number; gagal: number };

const LABEL_JENIS: Record<string, string> = {
  siaran_pendataan: "Siaran (manual)",
  siaran_pendataan_satu: "Kirim ke satu petugas (manual)",
  perbaikan_siaran: "Siaran perbaikan",
  pengingat_terjadwal: "Pengingat Translok",
  alur_fasih_minta: "FASIH · permintaan daftar",
  alur_fasih_kolam: "FASIH · kolam wilayah",
  alur_fasih_batal: "FASIH · pembatalan",
  alur_fasih_keluar: "FASIH · sudah keluar",
  alur_fasih_tolak: "FASIH · ditolak",
  alur_fasih_tugas: "FASIH · penugasan",
};
export const labelJenisPush = (j: string): string => LABEL_JENIS[j] ?? j;

/**
 * Menggabungkan baris log menjadi entri yang enak dibaca. Pengingat terjadwal ditulis SATU BARIS PER PENERIMA, jadi digabung per jam
 * (satu entri per jam kirim: "n petugas"); jenis lain digabung bila judul sama dan dikirim pada menit yang sama. Terbaru di atas.
 */
export function gabungRiwayat(baris: BarisLog[], maks = 60): EntriRiwayat[] {
  const peta = new Map<string, EntriRiwayat>();
  for (const r of baris) {
    const t = Date.parse(r.dibuat_at);
    if (!Number.isFinite(t)) continue;
    const perJam = r.jenis === "pengingat_terjadwal";
    const kunciWaktu = perJam ? Math.floor(t / 3_600_000) : Math.floor(t / 60_000);
    const judul = perJam ? "Pengingat Translok" : (r.judul ?? "").trim() || labelJenisPush(r.jenis);
    const kunci = `${r.jenis}|${perJam ? "" : judul}|${kunciWaktu}`;
    const akun = r.jumlah_akun ?? (r.oleh_akun_id != null ? 1 : 0);
    const e = peta.get(kunci);
    if (e) {
      e.akun += akun;
      e.perangkat += r.jumlah_perangkat ?? 0;
      e.terkirim += r.terkirim ?? 0;
      e.gagal += r.gagal ?? 0;
      if (r.dibuat_at > e.waktu) e.waktu = r.dibuat_at;
    } else {
      peta.set(kunci, { waktu: r.dibuat_at, jenis: r.jenis, label: labelJenisPush(r.jenis), judul, akun, perangkat: r.jumlah_perangkat ?? 0, terkirim: r.terkirim ?? 0, gagal: r.gagal ?? 0 });
    }
  }
  return [...peta.values()].sort((a, b) => (a.waktu < b.waktu ? 1 : a.waktu > b.waktu ? -1 : 0)).slice(0, maks);
}

// ---------------------------------------------------------------------------------------------------------------- denyut cron
export type StatusDenyut = "hidup" | "terlambat" | "mati" | "belum";
/** Cron tiap 5 menit: < 15 menit = hidup; < 2 jam = terlambat; lebih = mati; tidak pernah = belum. */
export function statusDenyut(terakhirIso: string | null | undefined, nowMs: number): StatusDenyut {
  if (!terakhirIso) return "belum";
  const t = Date.parse(terakhirIso);
  if (!Number.isFinite(t)) return "belum";
  const menit = (nowMs - t) / 60_000;
  if (menit < 15) return "hidup";
  if (menit < 120) return "terlambat";
  return "mati";
}
