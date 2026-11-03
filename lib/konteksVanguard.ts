// lib/konteksVanguard.ts  (murni; dipakai server dan klien)
//
// (2 Nov 2026) KONTEKS PELATIHAN untuk layar Vanguard peserta. Peserta aktif sebuah kegiatan berjenis pelatihan yang Vanguard-nya menyala melihat:
//   - kartu Panduan di paling atas (status, petak H1..HN, tenggat + sisa hari, langkah berikutnya, tombol utama, apa yang dihitung),
//   - label WAJIB / DIHITUNG / OPSIONAL pada kartu yang tersisa,
//   - kartu yang tidak ikut dihitung aturan disembunyikan (tombol "Tampilkan semua latihan" membukanya).
// Akun yang bukan peserta pelatihan tidak mendapat konteks (null) dan tampilannya tidak berubah.
//
// Yang DIHITUNG aturan (lib/runtutanVanguard.ts, JENIS_SESI_VANGUARD): sesi SELESAI berjenis harian, latihan (format sertifikasi), dan sertifikasi.
// Yang TIDAK dihitung: tantangan mingguan, kasus latihan satu per satu (84 kasus), Mode Kuesioner Penuh, dan usul kasus.

import type { ModeVanguard, Petak } from "@/lib/runtutanVanguard";
import { selisihHari } from "@/lib/runtutanVanguard";

export type RuntutanKonteks = {
  berturut: number;
  tuntas: boolean;
  hari_ini_sudah: boolean;
  terputus: boolean;
  sesi_hari_ini: number;
  petak: Petak[];
  /** true = masih mungkin tuntas sebelum tenggat; null = tenggat tidak diketahui. */
  mungkin: boolean | null;
  cadangan_hari: number | null;
  hari_terakhir_mulai: boolean;
};

export type KonteksPelatihan = {
  kegiatan_id: number;
  nama: string;
  mode: ModeVanguard;
  hari_berturut: number;
  sesi_min_per_hari: number;
  nilai_minimal: number;
  /** Hari TERAKHIR sesi masih dihitung (YYYY-MM-DD, WIB). Eksplisit (kolom vanguard_tenggat) atau sehari sebelum Pretest dibuka. */
  tenggat: string | null;
  tenggat_sumber: "atur" | "pretest" | null;
  /** Hari terakhir untuk MEMULAI agar masih sempat N hari berturut-turut. */
  mulai_paling_lambat: string | null;
  hari_ini: string;
  /** null bila mode tidak_ada. */
  runtutan: RuntutanKonteks | null;
  /** (3 Nov 2026) Status Sertifikasi wajib: sudah pernah menyelesaikan ujian sertifikasi? Tidak ada = belum diketahui (tidak ditampilkan). */
  sertifikasi?: { selesai: boolean; tingkat: number | null } | null;
};

export type StatusKonteks = "bebas" | "belum_mulai" | "berjalan" | "terputus" | "tuntas" | "lewat_batas";
export type Nada = "netral" | "kuning" | "merah" | "hijau";

const tglPanjang = (t: string): string => new Date(`${t}T00:00:00Z`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const tglPendek = (t: string): string => new Date(`${t}T00:00:00Z`).toLocaleDateString("id-ID", { day: "numeric", month: "long", timeZone: "UTC" });

/** Hari menuju tenggat: 0 = hari terakhir, negatif = terlambat. null bila tenggat tidak diketahui. */
export function sisaHari(k: Pick<KonteksPelatihan, "tenggat" | "hari_ini">): number | null {
  return k.tenggat ? selisihHari(k.tenggat, k.hari_ini) : null;
}

export function statusKonteks(k: KonteksPelatihan): StatusKonteks {
  const r = k.runtutan;
  if (k.mode === "tidak_ada" || !r) return "bebas";
  if (r.tuntas) return "tuntas";
  if (r.mungkin === false) return "lewat_batas";
  if (r.terputus) return "terputus";
  return r.berturut === 0 ? "belum_mulai" : "berjalan";
}

/** Netral; kuning bila sisa <= 2 hari (atau terputus); merah bila batas lewat pada mode wajib; hijau bila tuntas. */
/** (3 Nov 2026) Mode wajib, Latihan wajib sudah tuntas, tetapi Sertifikasi wajib belum selesai: Pretest masih terkunci. */
export function sertifikasiTertunda(k: Pick<KonteksPelatihan, "mode" | "runtutan" | "sertifikasi">): boolean {
  return k.mode === "wajib" && !!k.runtutan?.tuntas && k.sertifikasi?.selesai === false;
}

export function nadaKonteks(k: KonteksPelatihan): Nada {
  const s = statusKonteks(k);
  if (s === "bebas") return "netral";
  if (s === "tuntas") return sertifikasiTertunda(k) ? "kuning" : "hijau";
  if (s === "lewat_batas") return k.mode === "wajib" ? "merah" : "kuning";
  const sisa = sisaHari(k);
  if (s === "terputus" || (sisa !== null && sisa <= 2)) return "kuning";
  return "netral";
}

export function teksSisa(k: KonteksPelatihan): string | null {
  const sisa = sisaHari(k);
  if (sisa === null) return null;
  if (sisa < 0) return `Terlambat ${-sisa} hari`;
  if (sisa === 0) return "Hari terakhir";
  return `Sisa ${sisa} hari`;
}

export type TombolPanduan = { jenis: "latihan" | "sudah_hari_ini" | "selesai" | "hubungi" | "bebas"; teks: string };
export type Panduan = {
  status: StatusKonteks;
  nada: Nada;
  judul: string;
  /** Sapaan singkat di atas judul: nama kegiatan. */
  kegiatan: string;
  progres: { x: number; n: number } | null;
  petak: Petak[];
  ket: string;
  /** Satu kalimat langkah berikutnya. */
  langkah: string;
  tombol: TombolPanduan;
  tenggat: string | null;
  sisa: string | null;
  mulaiPalingLambat: string | null;
  /** Penjelasan apa yang dihitung dan apa yang tidak. */
  aturan: string[];
  wajib: boolean;
};

export function aturanDihitung(k: Pick<KonteksPelatihan, "mode" | "hari_berturut" | "sesi_min_per_hari" | "nilai_minimal">): string[] {
  const N = k.hari_berturut;
  const baris: string[] = [];
  if (k.mode === "tidak_ada") {
    baris.push("Belum ada kewajiban latihan untuk pelatihan ini. Berlatihlah kapan saja, sesering yang Anda mau.");
    baris.push("Latihan harian (3 butir, ±5 menit) adalah cara tercepat untuk membiasakan diri.");
    return baris;
  }
  const sesi = k.sesi_min_per_hari > 1 ? `${k.sesi_min_per_hari} sesi` : "satu sesi";
  baris.push(`Dihitung: ${sesi} yang SELESAI per hari dari Latihan harian (paling singkat), Latihan format sertifikasi, atau Ujian Sertifikasi.`);
  if (k.nilai_minimal > 0) baris.push(`Skor tiap sesi minimal ${k.nilai_minimal}.`);
  baris.push(`Perlu ${N} hari kalender berturut-turut. Sabtu dan Minggu ikut dihitung; satu hari terlewat memutus runtutan dan Anda mulai lagi dari hari 1.`);
  if (k.mode === "wajib") baris.push("Sertifikasi wajib: ikut ujian sertifikasi sampai selesai satu kali (tidak harus lulus). Pretest baru terbuka setelah Latihan wajib dan Sertifikasi wajib selesai.");
  baris.push("Nilai dan kesalahan di Menu wajib dicatat dan diperhitungkan.");
  baris.push("Tidak dihitung: Latihan bank soal, Tantangan mingguan, dan Usul kasus. Semuanya boleh dicoba sebanyak-banyaknya dan tidak memengaruhi pelatihan Anda.");
  return baris;
}

export function panduanKonteks(k: KonteksPelatihan): Panduan {
  const status = statusKonteks(k);
  const r = k.runtutan;
  const N = k.hari_berturut;
  const wajib = k.mode === "wajib";
  const sisa = teksSisa(k);
  const tenggat = k.tenggat ? tglPanjang(k.tenggat) : null;
  const mulaiPL = k.mulai_paling_lambat ? tglPanjang(k.mulai_paling_lambat) : null;
  const dasar = { status, nada: nadaKonteks(k), kegiatan: k.nama, petak: r?.petak ?? [], tenggat, sisa, mulaiPalingLambat: mulaiPL, aturan: aturanDihitung(k), wajib };
  const kunciPretest = wajib ? " Pretest terkunci sampai selesai." : "";

  switch (status) {
    case "bebas":
      return { ...dasar, judul: "Latihan harian: 3 butir, sekitar 5 menit", progres: null, ket: "Tidak diwajibkan untuk pelatihan ini, tetapi sangat dianjurkan.", langkah: "Mulai dari Latihan harian.", tombol: { jenis: "bebas", teks: "Mulai latihan harian" } };
    case "tuntas":
      if (sertifikasiTertunda(k)) return { ...dasar, judul: `Latihan wajib ${N} dari ${N} hari selesai`, progres: { x: N, n: N }, ket: "Pretest masih terkunci sampai Sertifikasi wajib selesai.", langkah: "Kerjakan Sertifikasi wajib di bawah (sekitar 15 menit).", tombol: { jenis: "selesai", teks: "Latihan wajib selesai ✓" } };
      return { ...dasar, judul: `Latihan ${N} dari ${N} hari berturut-turut`, progres: { x: N, n: N }, ket: wajib ? "Selesai. Pretest tidak lagi terkunci oleh Vanguard." : "Selesai. Terima kasih sudah berlatih.", langkah: "Tidak ada yang perlu dilakukan lagi. Tetap berlatih bila ingin makin mahir.", tombol: { jenis: "selesai", teks: "Selesai ✓" } };
    case "lewat_batas":
      return {
        ...dasar, judul: `Latihan ${Math.min(r?.berturut ?? 0, N)} dari ${N} hari berturut-turut`, progres: { x: Math.min(r?.berturut ?? 0, N), n: N },
        ket: wajib ? `Tenggat${tenggat ? ` (${tglPendek(k.tenggat as string)})` : ""} sudah tidak memungkinkan ${N} hari berturut-turut.${kunciPretest}` : "Tenggat latihan sudah lewat. Latihan tetap boleh dilakukan.",
        langkah: wajib ? "Hubungi panitia atau instruktur untuk membuka kunci." : "Lanjutkan berlatih kapan saja.",
        tombol: wajib ? { jenis: "hubungi", teks: "Hubungi panitia" } : { jenis: "latihan", teks: "Latihan hari ini" },
      };
    case "terputus":
      return {
        ...dasar, judul: `Latihan ${r?.berturut ?? 0} dari ${N} hari berturut-turut`, progres: { x: r?.berturut ?? 0, n: N },
        ket: `Runtutan terputus. Mulai lagi dari hari 1${r?.hari_ini_sudah ? "" : " hari ini"}.${kunciPretest}`,
        langkah: mulaiPL ? `Mulai lagi hari ini; batas mulai paling lambat ${mulaiPL}.` : "Mulai lagi hari ini dengan Latihan harian.",
        tombol: r?.hari_ini_sudah ? { jenis: "sudah_hari_ini", teks: "Hari ini sudah terhitung ✓" } : { jenis: "latihan", teks: "Latihan hari ini" },
      };
    case "belum_mulai":
      return {
        ...dasar, judul: `Latihan 0 dari ${N} hari berturut-turut`, progres: { x: 0, n: N },
        ket: `Selesaikan latihan ${N} hari berturut-turut${tenggat ? ` sebelum tenggat ${tglPendek(k.tenggat as string)}` : " sebelum Pretest"}.${kunciPretest}`,
        langkah: r?.hari_terakhir_mulai ? "Hari ini hari terakhir untuk mulai. Latihan sekarang." : mulaiPL ? `Mulai hari ini dengan Latihan harian; batas mulai paling lambat ${mulaiPL}.` : "Mulai hari ini dengan Latihan harian (3 butir, ±5 menit).",
        tombol: r?.hari_ini_sudah ? { jenis: "sudah_hari_ini", teks: "Hari ini sudah terhitung ✓" } : { jenis: "latihan", teks: "Latihan hari ini" },
      };
    default: {
      const x = r?.berturut ?? 0;
      return {
        ...dasar, judul: `Latihan ${Math.min(x, N)} dari ${N} hari berturut-turut`, progres: { x: Math.min(x, N), n: N },
        ket: r?.hari_ini_sudah ? `Hari ini sudah terhitung. Lanjutkan besok agar tidak terputus.${kunciPretest}` : `Belum ada latihan hari ini. Latihan sekarang agar runtutan tidak terputus.${kunciPretest}`,
        langkah: r?.hari_ini_sudah ? `Kembali besok untuk hari ke-${x + 1}.` : `Selesaikan hari ke-${x + 1} dengan Latihan harian.`,
        tombol: r?.hari_ini_sudah ? { jenis: "sudah_hari_ini", teks: "Hari ini sudah terhitung ✓" } : { jenis: "latihan", teks: "Latihan hari ini" },
      };
    }
  }
}

// ---------- label dan kartu ----------

export type KartuVg = "cara_main" | "ringkasan" | "kasus" | "saran" | "kuesioner" | "sertifikasi" | "latihan_format" | "harian" | "tantangan" | "usul" | "tingkat";
/** Jenis sesi yang dihitung aturan. */
const DIHITUNG: readonly KartuVg[] = ["sertifikasi", "latihan_format", "harian"];
export type LabelKartu = { teks: string; jenis: "wajib" | "dihitung" | "opsional" };

export function dihitungAturan(kartu: KartuVg): boolean {
  return DIHITUNG.includes(kartu);
}

export function labelKartu(mode: ModeVanguard, kartu: KartuVg): LabelKartu {
  if (!dihitungAturan(kartu)) return { teks: mode === "tidak_ada" ? "OPSIONAL" : "LATIHAN BEBAS", jenis: "opsional" };
  if (mode === "wajib") return { teks: "WAJIB", jenis: "wajib" };
  if (mode === "opsional") return { teks: "DIHITUNG", jenis: "dihitung" };
  return { teks: "OPSIONAL", jenis: "opsional" };
}

/** Kartu yang tampil di layar peserta pelatihan. `semua` = tombol "Tampilkan semua latihan". Akun tanpa konteks selalu melihat semua kartu. */
export function kartuTampil(konteks: KonteksPelatihan | null, kartu: KartuVg, semua: boolean): boolean {
  if (!konteks || semua) return true;
  // ringkas: hanya sesi yang dihitung aturan (harian, format sertifikasi, ujian sertifikasi) dan kartu Cara main dalam bentuk tautan
  return dihitungAturan(kartu) || kartu === "cara_main";
}

// ---------- Menu wajib dan Latihan bank soal (3 Nov 2026) ----------
// Peserta pelatihan melihat dua pintu terpisah:
//   1. MENU WAJIB: Latihan wajib (runtutan N hari, lihat panduanKonteks) dan Sertifikasi wajib (ujian sertifikasi).
//   2. LATIHAN BANK SOAL: berlatih sebanyak-banyaknya dengan petunjuk dan kunci jawaban; tidak memengaruhi pelatihan.

export const TEKS_BANK_SOAL = {
  judul: "Latihan bank soal",
  isi: "Berlatih sepuasnya di sini. Soal boleh dicoba berkali-kali, tanpa batas, dan hasilnya tidak memengaruhi pelatihan Anda. Petunjuk dan kunci jawaban tersedia.",
} as const;

export type SertifikasiWajib = { judul: string; ket: string; tombol: string; selesai: boolean };

/** Kartu "Sertifikasi wajib" di Menu wajib. Judul mengikuti mode: wajib = "Sertifikasi wajib", selain itu "Sertifikasi kemampuan". */
export function teksSertifikasiWajib(k: Pick<KonteksPelatihan, "mode" | "sertifikasi">): SertifikasiWajib {
  const judul = k.mode === "wajib" ? "Sertifikasi wajib" : "Sertifikasi kemampuan";
  const s = k.sertifikasi;
  if (s?.selesai) {
    const syarat = k.mode === "wajib" ? " Syarat Pretest terpenuhi." : "";
    return { judul, selesai: true, ket: (s.tingkat ? `Sudah ikut ujian sertifikasi. Tingkat Anda: ${"★".repeat(Math.max(1, Math.min(5, s.tingkat)))} (${s.tingkat} dari 5).` : "Sudah ikut ujian sertifikasi.") + syarat, tombol: "Lihat sertifikat saya" };
  }
  const wajibTeks = k.mode === "wajib" ? " Wajib diselesaikan agar Pretest terbuka. Nilai dan kesalahan Anda dicatat dan diperhitungkan." : "";
  return { judul, selesai: false, ket: `Ujian 15 butir (sekitar 15 menit). Hasilnya tingkat 1 sampai 5 bintang.${wajibTeks}`, tombol: "Ikut ujian sertifikasi" };
}

/** Soal pertama yang belum dijawab benar (urut seperti daftar); bila semua sudah benar, soal pertama. -1 bila tidak ada soal. */
export function soalLatihanBerikutnya(daftar: readonly { kode: string; bebas?: boolean; level: string }[], benar: Readonly<Record<string, unknown>>, levelAktif: ReadonlySet<string>): number {
  const layak = daftar.map((c, i) => ({ c, i })).filter((x) => !x.c.bebas && levelAktif.has(x.c.level));
  if (layak.length === 0) return -1;
  return (layak.find((x) => benar[x.c.kode] == null) ?? layak[0]).i;
}
