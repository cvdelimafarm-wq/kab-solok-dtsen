// lib/arsip/nomor.ts  (logika murni, tanpa akses basis data)
//
// (7 Nov 2026) Penomoran surat. Dasar: Peraturan BPS Nomor 1 Tahun 2023 tentang Pedoman Tata Naskah Dinas BPS, Pasal 63 sampai 65:
//   penugasan dan surat dinas ke luar : [derajat keamanan]-[nomor]/[unit kerja]/[kode klasifikasi arsip]/[tahun]
//   korespondensi internal            : [nomor]/[unit kerja]/[kode klasifikasi arsip]/[tahun]
//   naskah khusus (SPK, BAST, dst.)   : [nomor]/[tahun]
// Pola nomor disimpan di basis data (arsip_jenis.format) dan dapat diubah admin. Penyusunan nomor di sini HARUS sama dengan fungsi SQL
// `arsip_susun_nomor` (diuji dengan contoh yang sama).

export type KategoriArsip = "penugasan" | "korespondensi_eksternal" | "korespondensi_internal" | "naskah_khusus";

export const KATEGORI: Record<KategoriArsip, { nama: string; dasar: string; formatBawaan: string }> = {
  penugasan: { nama: "Penugasan (surat tugas, surat perintah)", dasar: "Peraturan BPS 1/2023 Pasal 63 ayat (2)", formatBawaan: "{keamanan}-{urut}/{unit}/{kka}/{tahun}" },
  korespondensi_eksternal: { nama: "Surat dinas ke luar", dasar: "Peraturan BPS 1/2023 Pasal 64 ayat (2)", formatBawaan: "{keamanan}-{urut}/{unit}/{kka}/{tahun}" },
  korespondensi_internal: { nama: "Korespondensi internal (nota dinas, undangan internal)", dasar: "Peraturan BPS 1/2023 Pasal 64 ayat (1)", formatBawaan: "{urut}/{unit}/{kka}/{tahun}" },
  naskah_khusus: { nama: "Naskah khusus (SPK, BAST, surat keterangan)", dasar: "Peraturan BPS 1/2023 Pasal 65", formatBawaan: "{urut}/{tahun}" },
};

export const TOKEN_FORMAT = ["{keamanan}", "{urut}", "{urut3}", "{urut4}", "{unit}", "{kka}", "{tahun}"] as const;

export type BahanNomor = { keamanan?: string | null; urut: number; unit?: string | null; kka?: string | null; tahun: number };

/** Menyusun nomor dari pola. Sama dengan fungsi SQL arsip_susun_nomor. */
export function susunNomor(format: string, b: BahanNomor): string {
  const u = String(Math.trunc(b.urut));
  return format
    .split("{keamanan}").join(b.keamanan ?? "")
    .split("{urut}").join(u)
    .split("{urut3}").join(u.padStart(3, "0"))
    .split("{urut4}").join(u.padStart(4, "0"))
    .split("{unit}").join(b.unit ?? "")
    .split("{kka}").join(b.kka ?? "")
    .split("{tahun}").join(String(b.tahun));
}

/** Pesan galat bila pola tidak sah; null bila sah. */
export function periksaFormat(format: string): string | null {
  const f = format.trim();
  if (f.length < 5 || f.length > 120) return "Pola nomor harus 5 sampai 120 karakter.";
  const dipakai = f.match(/\{[^}]*\}/g) ?? [];
  const asing = dipakai.filter((t) => !(TOKEN_FORMAT as readonly string[]).includes(t));
  if (asing.length > 0) return `Token tidak dikenal: ${Array.from(new Set(asing)).join(", ")}. Token yang tersedia: ${TOKEN_FORMAT.join(" ")}.`;
  if (!/\{urut(3|4)?\}/.test(f)) return "Pola wajib memuat {urut}.";
  if (!f.includes("{tahun}")) return "Pola wajib memuat {tahun}.";
  if (/[^\x20-\x7E]/.test(f)) return "Pola hanya boleh memuat huruf, angka, dan tanda baca biasa.";
  if (f.replace(/\{[^}]*\}/g, "").includes("{") || f.replace(/\{[^}]*\}/g, "").includes("}")) return "Kurung kurawal tidak berpasangan.";
  return null;
}

export const perluKka = (format: string): boolean => format.includes("{kka}");
export const perluUnit = (format: string): boolean => format.includes("{unit}");

/** Kode klasifikasi arsip, mis. VS.330 atau KU.200 (boleh bersubkode: KA.410.1). */
export const KKA_SAH = /^[A-Z]{2}\.[0-9]{3}(\.[0-9]+)?$/;
export const kkaSah = (k: string): boolean => KKA_SAH.test(k.trim());

/** Urutan pemilihan kode arsip: pilihan eksplisit, lalu kode kegiatan, lalu bawaan jenis (sama dengan fungsi SQL arsip_ambil_nomor). */
export function pilihKka(eksplisit: string | null | undefined, kegiatan: string | null | undefined, bawaan: string | null | undefined): string | null {
  for (const k of [eksplisit, kegiatan, bawaan]) {
    const v = (k ?? "").trim();
    if (v) return v;
  }
  return null;
}

export type NomorUrai = { keamanan: string | null; urut: number; unit: string | null; kka: string | null; tahun: number };

/** Mengurai nomor yang sudah ada: "B-1285/13030/VS.330/2026" atau naskah khusus "12/2026". Selain itu null. */
export function uraiNomor(teks: string): NomorUrai | null {
  const t = teks.trim();
  let m = /^([A-Z]{1,2})-(\d{1,6})\/(\d{5})\/([A-Z]{2}\.\d{3}(?:\.\d+)?)\/(\d{4})$/.exec(t);
  if (m) return { keamanan: m[1], urut: Number(m[2]), unit: m[3], kka: m[4], tahun: Number(m[5]) };
  m = /^(\d{1,6})\/(\d{5})\/([A-Z]{2}\.\d{3}(?:\.\d+)?)\/(\d{4})$/.exec(t);
  if (m) return { keamanan: null, urut: Number(m[1]), unit: m[2], kka: m[3], tahun: Number(m[4]) };
  m = /^(\d{1,6})\/(\d{4})$/.exec(t);
  if (m) return { keamanan: null, urut: Number(m[1]), unit: null, kka: null, tahun: Number(m[2]) };
  return null;
}

/** Nomor yang hilang dari rangkaian awal..terakhir (untuk kartu "nomor terlewat"). Hasil menaik, dipangkas `batas`. `awal` = nomor tercatat terkecil, agar nomor sebelum buku dimulai tidak dihitung. */
export function celahUrut(terpakai: Iterable<number>, terakhir: number, batas = 200, awal = 1): { celah: number[]; total: number } {
  const ada = new Set<number>();
  for (const n of terpakai) ada.add(n);
  const celah: number[] = [];
  let total = 0;
  for (let i = Math.max(1, awal); i <= terakhir; i++) {
    if (!ada.has(i)) {
      total += 1;
      if (celah.length < batas) celah.push(i);
    }
  }
  return { celah, total };
}

/** Meringkas deret nomor menjadi rentang: [3,4,5,9] -> "3 s.d. 5, 9". */
export function ringkasRentang(nomor: number[]): string {
  const urut = Array.from(new Set(nomor)).sort((a, b) => a - b);
  const bagian: string[] = [];
  for (let i = 0; i < urut.length; ) {
    let j = i;
    while (j + 1 < urut.length && urut[j + 1] === urut[j] + 1) j++;
    bagian.push(j > i ? `${urut[i]} s.d. ${urut[j]}` : String(urut[i]));
    i = j + 1;
  }
  return bagian.join(", ");
}

/** Tahun menurut tanggal "YYYY-MM-DD" (bukan jam peramban). */
export function tahunDariTanggal(tgl: string): number | null {
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(tgl);
  return m ? Number(m[1]) : null;
}

/** Contoh nomor untuk pratinjau pola di layar pengaturan. */
export function contohNomor(format: string, keamanan: string, unit: string, kka: string | null, urut: number, tahun: number): string {
  return susunNomor(format, { keamanan, unit, kka: kka ?? "KKA", urut, tahun });
}

// ---------------------------------------------------------------------------------------------------------------------
// Jenis dokumen lanjutan -> jenis arsip
// ---------------------------------------------------------------------------------------------------------------------
/** Dokumen turunan identifikasi lanjutan (lib/keu/lanjutan JenisDokumen) dipetakan ke jenis arsip. */
export const JENIS_ARSIP_LANJUTAN: Record<"undangan" | "pengantar" | "tugas", string> = { undangan: "undangan", pengantar: "pengantar_nagari", tugas: "st" };

/** Kunci pengenal satu dokumen lanjutan agar tidak mengambil dua nomor. */
export const rujukanLanjutan = (identId: number, jenis: string, kunci: string): string => `keu_ident_dokumen:${identId}:${jenis}:${kunci}`;
/** Kunci pengenal satu penugasan (surat tugas translok). */
export const rujukanPenugasan = (penugasanId: number): string => `sigap_penugasan:${penugasanId}`;
