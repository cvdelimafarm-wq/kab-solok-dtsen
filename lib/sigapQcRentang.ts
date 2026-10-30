// lib/sigapQcRentang.ts  (murni; dipakai server DAN klien)
//
// (30 Okt 2026) Filter tanggal QC Pemahaman (Kelola Pendataan > QC > Pemahaman · Hari ini):
//  - "Per tanggal": memilih satu hari (tanggal bebas, hari sebelumnya/berikutnya yang punya soal, kembali ke hari berlaku);
//  - "Rentang tanggal": dari-sampai, hasilnya matriks petugas x hari (nilai terbaik per hari) + ringkasan per hari dan per petugas.
// Berkas ini hanya berisi penyusunan data dan perhitungan tanggal; pengambilan data ada di lib/portal/qc.ts (rentangAdmin).

import type { PesertaMentah } from "@/lib/sigapQcMonitor";

/** Batas lebar rentang (hari kalender) supaya muatan dan tabel tetap wajar. */
export const MAKS_HARI_RENTANG = 62;

const TGL = /^\d{4}-\d{2}-\d{2}$/;

export function tanggalSahQc(t: unknown): t is string {
  if (typeof t !== "string" || !TGL.test(t)) return false;
  const d = new Date(`${t}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
}

/** Tambah (atau kurangi) hari pada tanggal "YYYY-MM-DD" tanpa terpengaruh zona waktu. */
export function geserTanggal(t: string, hari: number): string {
  const d = new Date(`${t}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}

/** Jumlah hari kalender dari `dari` sampai `sampai` (sama-sama ikut). */
export function jumlahHariKalender(dari: string, sampai: string): number {
  return Math.round((Date.parse(`${sampai}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`)) / 86_400_000) + 1;
}

export type RentangSah = { ok: true; dari: string; sampai: string } | { ok: false; pesan: string };

/** Memeriksa masukan rentang: keduanya sah, dari <= sampai, lebar <= MAKS_HARI_RENTANG. */
export function periksaRentang(dari: unknown, sampai: unknown): RentangSah {
  if (!tanggalSahQc(dari) || !tanggalSahQc(sampai)) return { ok: false, pesan: "Tanggal rentang tidak sah." };
  if (dari > sampai) return { ok: false, pesan: "Tanggal awal tidak boleh setelah tanggal akhir." };
  if (jumlahHariKalender(dari, sampai) > MAKS_HARI_RENTANG) return { ok: false, pesan: `Rentang terlalu lebar (maksimal ${MAKS_HARI_RENTANG} hari).` };
  return { ok: true, dari, sampai };
}

/** Hari (yang punya soal) sebelum/sesudah `hari` dalam daftar `ada` (urutan bebas); tidak ada = null. */
export function hariTetangga(ada: string[], hari: string | null, arah: -1 | 1): string | null {
  const urut = [...new Set(ada)].sort();
  if (urut.length === 0) return null;
  if (!hari) return arah === -1 ? urut[urut.length - 1] : urut[0];
  if (arah === -1) {
    for (let i = urut.length - 1; i >= 0; i--) if (urut[i] < hari) return urut[i];
    return null;
  }
  for (const t of urut) if (t > hari) return t;
  return null;
}

/** Pilihan cepat: N hari kalender terakhir sampai `akhir` (ikut). */
export function rentangTerakhir(akhir: string, n: number): { dari: string; sampai: string } {
  const lebar = Math.min(Math.max(Math.floor(n), 1), MAKS_HARI_RENTANG);
  return { dari: geserTanggal(akhir, -(lebar - 1)), sampai: akhir };
}

// ------------------------------------------------------------------ matriks petugas x hari
export type PercobaanRentang = { akun_id: number; tanggal: string; ke: number; skor: number; terlambat: boolean };

export type SelHari = {
  percobaan: number;
  awal: number;
  terbaik: number;
  lulus: boolean;
  terlambat: boolean;
};

export type BarisRentang = {
  akun_id: number;
  nama: string;
  peran: "PML" | "PPL";
  /** Nama PML timnya; untuk baris PML = null. */
  pml: string | null;
  /** Sejajar dengan `hari`: null = tidak mengisi pada hari itu. */
  sel: (SelHari | null)[];
  hari_terisi: number;
  hari_lulus: number;
  hari_kosong: number;
  total_percobaan: number;
  /** Rata-rata nilai terbaik pada hari yang diisi; null bila tidak pernah mengisi. */
  rata_terbaik: number | null;
  /** Ada hari yang terisi tetapi terlambat. */
  pernah_terlambat: boolean;
};

export type RingkasHari = { tanggal: string; peserta: number; sudah: number; lulus: number };

export type DataRentang = {
  dari: string;
  sampai: string;
  /** Hari yang punya soal di rentang, urut naik. */
  hari: string[];
  nilai_lulus: number;
  peserta: number;
  baris: BarisRentang[];
  per_hari: RingkasHari[];
  /** Persentase sel (petugas x hari) yang terisi; null bila tidak ada hari atau peserta. */
  kepatuhan_persen: number | null;
  /** Petugas yang tidak mengisi satu hari pun di rentang. */
  tidak_pernah: number;
};

const bulat1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Menyusun matriks. `hari` = hari yang punya soal (urutan bebas, duplikat dibuang, hanya yang berada dalam [dari, sampai]).
 * Percobaan di luar `hari` atau milik akun yang bukan peserta diabaikan. Nilai awal = percobaan ke-1 (ke terkecil), terbaik = skor tertinggi.
 */
export function susunRentang(input: { dari: string; sampai: string; hari: string[]; peserta: PesertaMentah[]; percobaan: PercobaanRentang[]; nilaiLulus: number }): DataRentang {
  const { dari, sampai, peserta, percobaan, nilaiLulus } = input;
  const hari = [...new Set(input.hari)].filter((t) => t >= dari && t <= sampai).sort();
  const indeksHari = new Map(hari.map((t, i) => [t, i]));

  const pesertaPetaNama = new Map(peserta.map((p) => [p.akun_id, p.nama]));
  const tumpuk = new Map<string, PercobaanRentang[]>(); // "akun|tanggal"
  for (const c of percobaan) {
    if (!indeksHari.has(c.tanggal) || !pesertaPetaNama.has(c.akun_id)) continue;
    const kunci = `${c.akun_id}|${c.tanggal}`;
    const a = tumpuk.get(kunci);
    if (a) a.push(c);
    else tumpuk.set(kunci, [c]);
  }

  const baris: BarisRentang[] = peserta
    .filter((p) => p.peran === "pml" || p.peran === "ppl")
    .map((p) => {
      const sel: (SelHari | null)[] = hari.map((t) => {
        const daftar = tumpuk.get(`${p.akun_id}|${t}`);
        if (!daftar || daftar.length === 0) return null;
        const urut = [...daftar].sort((a, b) => a.ke - b.ke);
        const terbaik = Math.max(...urut.map((x) => x.skor));
        return { percobaan: urut.length, awal: urut[0].skor, terbaik, lulus: terbaik >= nilaiLulus, terlambat: urut.some((x) => x.terlambat) };
      });
      const terisi = sel.filter((x): x is SelHari => x !== null);
      return {
        akun_id: p.akun_id,
        nama: p.nama,
        peran: p.peran === "pml" ? ("PML" as const) : ("PPL" as const),
        pml: p.peran === "pml" ? null : p.pml_nama,
        sel,
        hari_terisi: terisi.length,
        hari_lulus: terisi.filter((x) => x.lulus).length,
        hari_kosong: hari.length - terisi.length,
        total_percobaan: terisi.reduce((a, x) => a + x.percobaan, 0),
        rata_terbaik: terisi.length ? bulat1(terisi.reduce((a, x) => a + x.terbaik, 0) / terisi.length) : null,
        pernah_terlambat: terisi.some((x) => x.terlambat),
      };
    })
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));

  const per_hari: RingkasHari[] = hari.map((t, i) => ({
    tanggal: t,
    peserta: baris.length,
    sudah: baris.filter((b) => b.sel[i] !== null).length,
    lulus: baris.filter((b) => b.sel[i]?.lulus).length,
  }));
  const sel_total = baris.length * hari.length;
  const sel_isi = baris.reduce((a, b) => a + b.hari_terisi, 0);

  return {
    dari,
    sampai,
    hari,
    nilai_lulus: nilaiLulus,
    peserta: baris.length,
    baris,
    per_hari,
    kepatuhan_persen: sel_total > 0 ? Math.round((sel_isi / sel_total) * 100) : null,
    tidak_pernah: hari.length > 0 ? baris.filter((b) => b.hari_terisi === 0).length : 0,
  };
}

// ------------------------------------------------------------------ penyaringan dan pengurutan di klien
export type StatusRentang = "semua" | "tidak_lengkap" | "lengkap" | "tidak_pernah" | "terlambat";
export type UrutRentang = "nama" | "paling_sedikit" | "nilai_rendah" | "nilai_tinggi";

export const LABEL_STATUS_RENTANG: Record<StatusRentang, string> = {
  semua: "Semua",
  tidak_lengkap: "Ada hari kosong",
  lengkap: "Lengkap",
  tidak_pernah: "Tidak pernah mengisi",
  terlambat: "Pernah terlambat",
};
export const LABEL_URUT_RENTANG: Record<UrutRentang, string> = {
  nama: "Nama (A-Z)",
  paling_sedikit: "Paling jarang mengisi",
  nilai_rendah: "Nilai rata-rata terendah",
  nilai_tinggi: "Nilai rata-rata tertinggi",
};

export function hitungStatusRentang(baris: BarisRentang[], jumlahHari: number): Record<StatusRentang, number> {
  return {
    semua: baris.length,
    tidak_lengkap: baris.filter((b) => jumlahHari > 0 && b.hari_kosong > 0).length,
    lengkap: baris.filter((b) => jumlahHari > 0 && b.hari_kosong === 0).length,
    tidak_pernah: baris.filter((b) => jumlahHari > 0 && b.hari_terisi === 0).length,
    terlambat: baris.filter((b) => b.pernah_terlambat).length,
  };
}

export type SaringanRentang = { status: StatusRentang; peran: "semua" | "PML" | "PPL"; pml: string; cari: string };
export const SARINGAN_RENTANG_AWAL: SaringanRentang = { status: "semua", peran: "semua", pml: "", cari: "" };

/** Nama PML yang muncul (baris PML memakai namanya sendiri sebagai timnya), urut abjad. */
export function daftarTimRentang(baris: BarisRentang[]): string[] {
  const s = new Set<string>();
  for (const b of baris) {
    const t = b.peran === "PML" ? b.nama : b.pml;
    if (t) s.add(t);
  }
  return [...s].sort((a, b) => a.localeCompare(b, "id"));
}

export function saringBarisRentang(baris: BarisRentang[], s: SaringanRentang, jumlahHari: number): BarisRentang[] {
  const q = s.cari.trim().toLowerCase();
  return baris.filter((b) => {
    if (s.peran !== "semua" && b.peran !== s.peran) return false;
    if (s.pml && (b.peran === "PML" ? b.nama : b.pml) !== s.pml) return false;
    if (q && !b.nama.toLowerCase().includes(q) && !(b.pml ?? "").toLowerCase().includes(q)) return false;
    switch (s.status) {
      case "tidak_lengkap":
        return jumlahHari > 0 && b.hari_kosong > 0;
      case "lengkap":
        return jumlahHari > 0 && b.hari_kosong === 0;
      case "tidak_pernah":
        return jumlahHari > 0 && b.hari_terisi === 0;
      case "terlambat":
        return b.pernah_terlambat;
      default:
        return true;
    }
  });
}

export function urutkanRentang(baris: BarisRentang[], urut: UrutRentang): BarisRentang[] {
  const a = [...baris];
  const nama = (x: BarisRentang, y: BarisRentang) => x.nama.localeCompare(y.nama, "id");
  switch (urut) {
    case "paling_sedikit":
      return a.sort((x, y) => x.hari_terisi - y.hari_terisi || nama(x, y));
    case "nilai_rendah":
      // yang belum pernah mengisi (tanpa nilai) di paling atas: itulah yang paling perlu perhatian
      return a.sort((x, y) => (x.rata_terbaik ?? -1) - (y.rata_terbaik ?? -1) || nama(x, y));
    case "nilai_tinggi":
      return a.sort((x, y) => (y.rata_terbaik ?? -1) - (x.rata_terbaik ?? -1) || nama(x, y));
    default:
      return a.sort(nama);
  }
}
