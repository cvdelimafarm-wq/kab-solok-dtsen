// lib/ketentuanPelatihan.ts  (murni, tanpa basis data)
//
// (2 Nov 2026) Pelatihan 5 tab, tahap B: ketentuan pelatihan (diatur PJ) dan respons undangan (terima / tolak). Undangan hanya mencatat KESEDIAAN.
// Terima wajib disertai centang setuju; tolak wajib beralasan singkat. Ketentuan yang diperbarui setelah diterima hanya MEMBERI TAHU (tanpa setuju ulang).

export const MAKS_BUTIR = 20;
export const MAKS_PANJANG_BUTIR = 300;
export const MIN_ALASAN = 3;
export const MAKS_ALASAN = 200;

export type Ketentuan = {
  /**
   * Pengaturan tampilan lima tab per kegiatan. null = OTOMATIS (bawaan): tampilan baru selama pelatihan belum selesai, pelatihan yang sudah selesai (mis. PSP) tetap
   * tampilan Langkah lama. true / false = ditetapkan manual oleh PJ.
   */
  tab_pengaturan: boolean | null;
  /** Butir ketentuan tambahan dari PJ (waktu dan tempat diambil dari data undangan yang sudah ada). */
  butir: string[];
  versi: number;
  /** true bila kegiatan ini sudah punya baris ketentuan (pernah disimpan). */
  ada: boolean;
};

export const KETENTUAN_BAWAAN: Ketentuan = { tab_pengaturan: null, butir: [], versi: 1, ada: false };

/** Hari ini menurut WIB, "YYYY-MM-DD". */
export function hariIniWib(sekarangMs: number = Date.now()): string {
  return new Date(sekarangMs + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Pelatihan sudah selesai bila tanggal selesai (atau mulai) lebih awal daripada hari ini. Tanpa tanggal -> belum selesai. */
export function kegiatanSudahSelesai(tanggalSelesai: string | null | undefined, tanggalMulai: string | null | undefined, hariIni: string): boolean {
  const akhir = tanggalSelesai ?? tanggalMulai ?? null;
  return !!akhir && akhir < hariIni;
}

/** Tampilan lima tab yang berlaku: pengaturan manual menang; otomatis = baru bila pelatihan belum selesai. */
export function tampilanBaruAktif(pengaturan: boolean | null, selesai: boolean): boolean {
  return pengaturan ?? !selesai;
}

/** Ketentuan sudah diubah dari bawaan (ada butir atau versi pernah naik)? */
export function ketentuanDiubah(k: Ketentuan): boolean {
  return k.butir.length > 0 || k.versi > 1;
}

export type ResponsUndangan = { respons: "terima" | "tolak"; alasan: string | null; versi_ketentuan: number; dijawab_at: string } | null;

export type StatusUndangan = "belum" | "diterima" | "ditolak";

/** Membersihkan daftar butir: teks saja, dipangkas, tanpa baris kosong, paling banyak MAKS_BUTIR. */
export function bersihkanButir(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  const hasil: string[] = [];
  for (const b of x) {
    if (typeof b !== "string") continue;
    const t = b.replace(/\s+/g, " ").trim().slice(0, MAKS_PANJANG_BUTIR);
    if (t) hasil.push(t);
    if (hasil.length >= MAKS_BUTIR) break;
  }
  return hasil;
}

/** Baris tabel ketentuan -> bentuk aman. Baris kosong / rusak -> bawaan (otomatis, tanpa butir). */
export function bacaKetentuan(baris: unknown): Ketentuan {
  if (!baris || typeof baris !== "object") return { ...KETENTUAN_BAWAAN };
  const r = baris as Record<string, unknown>;
  const versi = typeof r.versi === "number" && Number.isInteger(r.versi) && r.versi >= 1 ? r.versi : 1;
  return { tab_pengaturan: r.tab_baru === true ? true : r.tab_baru === false ? false : null, butir: bersihkanButir(r.butir), versi, ada: true };
}

export function statusUndangan(r: ResponsUndangan): StatusUndangan {
  if (!r) return "belum";
  return r.respons === "terima" ? "diterima" : "ditolak";
}

/** Petugas sudah menerima versi ketentuan yang lebih lama daripada yang berlaku sekarang -> hanya pemberitahuan. */
export function ketentuanBerubah(r: ResponsUndangan, k: Ketentuan): boolean {
  return !!r && r.respons === "terima" && r.versi_ketentuan < k.versi;
}

export type HasilPeriksaRespons = { ok: true; respons: "terima" | "tolak"; alasan: string | null } | { ok: false; pesan: string };

/** Memeriksa isi permintaan POST respons undangan. */
export function periksaRespons(masukan: unknown): HasilPeriksaRespons {
  const m = (masukan && typeof masukan === "object" ? masukan : {}) as Record<string, unknown>;
  if (m.respons === "terima") {
    if (m.setuju !== true) return { ok: false, pesan: "Centang persetujuan ketentuan pelatihan dahulu." };
    return { ok: true, respons: "terima", alasan: null };
  }
  if (m.respons === "tolak") {
    const alasan = typeof m.alasan === "string" ? m.alasan.replace(/\s+/g, " ").trim() : "";
    if (alasan.length < MIN_ALASAN) return { ok: false, pesan: "Tulis alasan singkat penolakan." };
    return { ok: true, respons: "tolak", alasan: alasan.slice(0, MAKS_ALASAN) };
  }
  return { ok: false, pesan: "Pilihan harus terima atau tolak." };
}

export type TeksKartuUndangan = { judul: string; ket: string; tombol: string; nada: "emas" | "hijau" | "merah" };

/** Teks kartu undangan di tab Hari ini. */
export function teksKartuUndangan(status: StatusUndangan, berubah: boolean): TeksKartuUndangan {
  if (status === "belum") return { judul: "Belum direspons", ket: "Baca ketentuan pelatihan, lalu pilih terima atau tolak undangan.", tombol: "Buka undangan", nada: "emas" };
  if (status === "ditolak") return { judul: "Ditolak", ket: "Anda menolak undangan ini. Panitia akan mencari pengganti.", tombol: "Baca ketentuan", nada: "merah" };
  return berubah
    ? { judul: "Diterima · ketentuan diperbarui", ket: "PJ memperbarui ketentuan pelatihan. Silakan baca kembali; tidak perlu menyetujui ulang.", tombol: "Baca ketentuan", nada: "emas" }
    : { judul: "Diterima", ket: "Terima kasih. Ketentuan dapat dibaca kembali kapan saja.", tombol: "Baca ketentuan", nada: "hijau" };
}

// ------------------------------------------------------------------ gaya teks pada butir (tebal, miring, garis bawah, sorot)
// Butir tetap TEKS dengan penanda sederhana yang sama dengan pengumuman (lib/sigapPengumuman.ts): **tebal**  __miring__  ++garis bawah++  ==sorot==.
// Penanda tidak bersarang: satu potongan teks hanya satu gaya.

export type GayaTeks = "tebal" | "miring" | "garis" | "sorot";
export const PENANDA_GAYA: Record<GayaTeks, string> = { tebal: "**", miring: "__", garis: "++", sorot: "==" };
export const LABEL_GAYA: Record<GayaTeks, string> = { tebal: "Tebal", miring: "Miring", garis: "Garis bawah", sorot: "Sorot" };

/** Butir memuat penanda gaya? (untuk menampilkan pratinjau). */
export const butirBergaya = (t: string): boolean => /\*\*.+?\*\*|==.+?==|__.+?__|\+\+.+?\+\+/.test(t);

export type HasilGaya = { teks: string; awal: number; akhir: number; pesan?: string };

/**
 * Menerapkan atau mencabut satu gaya pada pilihan [awal, akhir) di `teks`.
 *  - tanpa pilihan: menyisipkan penanda di sekitar kata contoh "teks" yang terpilih;
 *  - pilihan yang sudah berpenanda gaya itu (di dalam atau tepat di luar pilihan): penanda DICABUT;
 *  - pilihan yang memuat penanda gaya LAIN: ditolak (tidak bersarang);
 *  - hasil melebihi `maks` huruf: ditolak.
 * Hasil `awal`/`akhir` = teks di dalam penanda, siap dipilih kembali.
 */
export function terapkanGaya(teks: string, awal: number, akhir: number, gaya: GayaTeks, maks: number = MAKS_PANJANG_BUTIR): HasilGaya {
  const p = PENANDA_GAYA[gaya];
  let a = Math.max(0, Math.min(awal, akhir, teks.length));
  let b = Math.max(0, Math.min(Math.max(awal, akhir), teks.length));
  // rapatkan pilihan ke teks (spasi di tepi tidak ikut bergaya)
  while (a < b && /\s/.test(teks[a])) a++;
  while (b > a && /\s/.test(teks[b - 1])) b--;
  const tolak = (pesan: string): HasilGaya => ({ teks, awal, akhir, pesan });

  if (a === b) {
    const baru = teks.slice(0, a) + p + "teks" + p + teks.slice(b);
    if (baru.length > maks) return tolak("Butir sudah terlalu panjang untuk ditambah gaya.");
    return { teks: baru, awal: a + p.length, akhir: a + p.length + 4 };
  }
  const isi = teks.slice(a, b);
  // 1) pilihan sudah memuat penanda di kedua ujungnya: cabut
  if (isi.length > 2 * p.length && isi.startsWith(p) && isi.endsWith(p)) {
    const dalam = isi.slice(p.length, isi.length - p.length);
    return { teks: teks.slice(0, a) + dalam + teks.slice(b), awal: a, akhir: a + dalam.length };
  }
  // 2) penanda tepat di luar pilihan: cabut
  if (a >= p.length && teks.slice(a - p.length, a) === p && teks.slice(b, b + p.length) === p) {
    return { teks: teks.slice(0, a - p.length) + isi + teks.slice(b + p.length), awal: a - p.length, akhir: a - p.length + isi.length };
  }
  // 3) gaya lain di dalam pilihan: tidak bersarang
  const lain = (Object.keys(PENANDA_GAYA) as GayaTeks[]).filter((g) => g !== gaya).map((g) => PENANDA_GAYA[g]);
  if (isi.includes(p) || lain.some((x) => isi.includes(x))) return tolak("Satu kata hanya boleh satu gaya (tidak bisa digabung). Pilih bagian yang belum bergaya.");
  const baru = teks.slice(0, a) + p + isi + p + teks.slice(b);
  if (baru.length > maks) return tolak("Butir sudah terlalu panjang untuk ditambah gaya.");
  return { teks: baru, awal: a + p.length, akhir: a + p.length + isi.length };
}
