// lib/sigapMasukNama.ts
//
// (8 Okt 2026) Login SIGAP/Portal: pencarian & pencocokan nama yang longgar, PIN awal 1303, dan pesan galat yang jelas.
// Fungsi MURNI (tanpa database/React) dipakai bersama server & klien.

/** PIN awal bersama yang dulu dipasang untuk akun pegawai organik. Wajib diganti. */
export const PIN_AWAL = "1303";
export const MIN_HURUF_CARI = 3;
export const MAKS_SARAN = 8;

export type AkunNama = { id: number; nama: string; jenis?: string | null };
export type Saran = { id: number; nama: string; ket: string };

/** Sama dengan normNama di lib/undangan (diulang agar modul ini murni): huruf kecil, tanpa tanda baca, spasi tunggal. */
export function normNamaCari(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nama tanpa gelar sesudah koma, ternormalisasi. */
export function intiNama(s: string): string {
  return normNamaCari(String(s ?? "").split(",")[0]);
}

export function ketAkun(a: { jenis?: string | null }): string {
  return a.jenis === "organik" ? "Pegawai" : "Mitra";
}

function skor(inti: string, k: string, tokenK: string[]): number | null {
  if (inti === k) return 0;
  if (inti.startsWith(k)) return 1;
  const kataNama = inti.split(" ");
  if (kataNama.some((w) => w.startsWith(k))) return 2;
  if (inti.includes(k)) return 3;
  // semua kata yang diketik muncul (urutan bebas), mis. "hestaria riva"
  if (tokenK.length > 1 && tokenK.every((t) => inti.includes(t))) return 4;
  return null;
}

/** Semua akun yang cocok dengan teks (tanpa batas jumlah), terurut dari yang paling mirip. */
export function cariSemua(daftar: AkunNama[], q: string): AkunNama[] {
  const k = intiNama(q);
  if (k.length < MIN_HURUF_CARI) return [];
  const tokenK = k.split(" ").filter(Boolean);
  const hasil: { a: AkunNama; s: number }[] = [];
  for (const a of daftar) {
    const s = skor(intiNama(a.nama), k, tokenK);
    if (s !== null) hasil.push({ a, s });
  }
  hasil.sort((x, y) => x.s - y.s || x.a.nama.localeCompare(y.a.nama, "id"));
  return hasil.map((h) => h.a);
}

/** Saran untuk kolom nama (maks 8). */
export function cariNama(daftar: AkunNama[], q: string, maks = MAKS_SARAN): Saran[] {
  return cariSemua(daftar, q)
    .slice(0, maks)
    .map((a) => ({ id: a.id, nama: a.nama, ket: ketAkun(a) }));
}

export type HasilCocok =
  | { jenis: "tepat" | "unik"; akun: AkunNama }
  | { jenis: "ambigu"; kandidat: AkunNama[] }
  | { jenis: "kosong" };

/**
 * Cocokkan teks nama yang diketik ke tepat satu akun:
 * 1. nama lengkap sama persis (tanpa tanda baca/huruf besar) -> tepat
 * 2. sama dengan nama tanpa gelar                            -> tepat
 * 3. bagian nama saja (min 3 huruf) yang hanya cocok dengan satu akun -> unik
 * Lebih dari satu akun cocok -> ambigu (pegawai diminta memilih dari saran).
 */
export function cocokkanNama(daftar: AkunNama[], teks: string): HasilCocok {
  const penuh = normNamaCari(teks);
  const inti = intiNama(teks);
  if (!penuh && !inti) return { jenis: "kosong" };
  const t1 = daftar.filter((a) => normNamaCari(a.nama) === penuh);
  if (t1.length === 1) return { jenis: "tepat", akun: t1[0] };
  if (t1.length > 1) return { jenis: "ambigu", kandidat: t1 };
  const t2 = daftar.filter((a) => intiNama(a.nama) === inti);
  if (t2.length === 1) return { jenis: "tepat", akun: t2[0] };
  if (t2.length > 1) return { jenis: "ambigu", kandidat: t2 };
  const sebagian = cariSemua(daftar, teks);
  if (sebagian.length === 1) return { jenis: "unik", akun: sebagian[0] };
  if (sebagian.length > 1) return { jenis: "ambigu", kandidat: sebagian };
  return { jenis: "kosong" };
}

// ======================================================================
// PIN mudah ditebak
// ======================================================================
/** 0000, 1111, 1234, 4321, 2345, 1212, dst. -- terlalu mudah ditebak. */
export function pinMudahTebak(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) return false;
  const d = pin.split("").map(Number);
  const sama = d.every((x) => x === d[0]);
  const naik = d.every((x, j) => j === 0 || x === d[j - 1] + 1);
  const turun = d.every((x, j) => j === 0 || x === d[j - 1] - 1);
  const ulangDua = d[0] === d[2] && d[1] === d[3];
  return sama || naik || turun || ulangDua;
}

/** Alasan PIN baru ditolak, atau null bila boleh dipakai. */
export function alasanPinDitolak(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return "PIN harus 4 digit angka.";
  if (pin === PIN_AWAL) return `PIN baru tidak boleh sama dengan PIN awal (${PIN_AWAL}).`;
  if (pinMudahTebak(pin)) return "PIN terlalu mudah ditebak (misalnya 1111, 1234, 1212). Pilih angka lain yang mudah Anda ingat.";
  return null;
}

// ======================================================================
// Pesan galat login
// ======================================================================
export type KodeGalatMasuk =
  | "nama_kosong"
  | "pin_format"
  | "nama_tidak_ditemukan"
  | "nama_ambigu"
  | "pin_belum_dibuat"
  | "pin_salah"
  | "terkunci"
  | "sementara_kedaluwarsa"
  | "belum_ditugaskan";

/** Jam & menit WIB (UTC+7) dari ISO, mis. "14.35 WIB". */
export function jamWib(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const d = new Date(t + 7 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}.${p(d.getUTCMinutes())} WIB`;
}

export function pesanGalatMasuk(
  kode: KodeGalatMasuk,
  o: { nama?: string; sisa?: number; maks?: number; sampai?: string | null; jumlah?: number } = {}
): string {
  const nama = o.nama ? `"${o.nama}"` : "ini";
  switch (kode) {
    case "nama_kosong":
      return "Nama belum diisi. Ketik minimal 3 huruf nama Anda, lalu pilih dari saran yang muncul.";
    case "pin_format":
      return "PIN harus 4 digit angka.";
    case "nama_tidak_ditemukan":
      return "Nama tidak ditemukan di daftar. Periksa ejaan, atau ketik sebagian nama (mis. 3 huruf pertama) lalu pilih dari saran. Bila nama Anda memang belum terdaftar, hubungi admin anggaran.";
    case "nama_ambigu":
      return `Ada ${o.jumlah ?? "beberapa"} nama yang mirip. Pilih nama Anda dari daftar saran di bawah kolom nama.`;
    case "pin_belum_dibuat":
      return `Akun ${nama} belum punya PIN. Pilih "Belum punya PIN? Buat PIN" di bawah tombol Masuk.`;
    case "pin_salah": {
      const sisa = typeof o.sisa === "number" ? ` Sisa percobaan ${o.sisa} dari ${o.maks ?? 5}; setelah itu akun terkunci 30 menit.` : "";
      return `PIN salah untuk ${nama}.${sisa} Lupa PIN? Pilih "Lupa PIN?" di bawah tombol Masuk.`;
    }
    case "terkunci": {
      const jam = jamWib(o.sampai);
      return `Akun ${nama} terkunci karena 5 kali salah memasukkan PIN.${jam ? ` Coba lagi setelah pukul ${jam}, atau` : ""} minta admin mereset PIN, atau gunakan "Lupa PIN?".`;
    }
    case "sementara_kedaluwarsa":
      return 'PIN sementara dari admin sudah kedaluwarsa (berlaku 24 jam). Pakai "Lupa PIN?" untuk membuat PIN baru, atau minta admin mereset ulang.';
    case "belum_ditugaskan":
      return "PIN benar, tetapi akun Anda belum punya tugas atau peran aktif di aplikasi mana pun. Hubungi admin anggaran / PJ kegiatan.";
  }
}
