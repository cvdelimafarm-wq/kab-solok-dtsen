// lib/hierarkiImpor.ts  (murni, tanpa basis data)
//
// (2 Nov 2026) Impor hierarki pelatihan dari template Excel: kolom Nama, Peran, Atasan (nama). Template diunduh sudah terisi data sekarang, PJ cukup mengubah kolom Atasan
// lalu mengunggah lagi. Kaidah: Atasan KOSONG = tidak diubah; "-" = tanpa atasan. Nama dicocokkan tanpa memandang huruf besar-kecil dan spasi ganda.
// Hasil bacaan hanya berisi PERUBAHAN yang sah; baris bermasalah dilaporkan (nomor baris + alasan) dan tidak diterapkan. Server memeriksa ulang dengan periksaPerubahan.

import type { PeranPelatihan, SimpulHierarki } from "@/lib/hierarkiPelatihan";

export const KOLOM_TEMPLATE = ["No", "Nama", "Peran", "Kelas", "Atasan"] as const;
export const PETUNJUK_TEMPLATE = [
  "Ubah hanya kolom Peran dan Atasan. Nama tidak boleh diubah (dipakai untuk mencocokkan).",
  "Atasan: tulis nama persis seperti di kolom Nama. Kosong = tidak diubah. Tulis - (strip) bila peserta tidak punya atasan.",
  "Peran: korwil, pml, atau ppl. Kosong = tidak diubah. Kolom Kelas hanya keterangan.",
];

const URUT: Record<PeranPelatihan, number> = { korwil: 0, pml: 1, ppl: 2 };
const PERAN_SAH = new Set<string>(["korwil", "pml", "ppl"]);

export const normNama = (s: unknown): string => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const teks = (x: unknown): string => (x === null || x === undefined ? "" : String(x).replace(/\s+/g, " ").trim());

/** Baris template (judul + data) dari simpul sekarang, terurut peran lalu nama. */
export function barisTemplate(simpul: readonly SimpulHierarki[]): (string | number)[][] {
  const nama = new Map(simpul.map((s) => [s.akun_id, s.nama]));
  const urut = [...simpul].sort((a, b) => URUT[a.peran] - URUT[b.peran] || a.nama.localeCompare(b.nama));
  return [[...KOLOM_TEMPLATE], ...urut.map((s, i) => [i + 1, s.nama, s.peran, s.kelas ?? "", s.atasan_akun_id !== null ? nama.get(s.atasan_akun_id) ?? "" : "-"])];
}

export type PerubahanImpor = {
  akun_id: number;
  nama: string;
  peran: PeranPelatihan;
  atasan_akun_id: number | null;
  atasan_nama: string | null;
  /** keadaan sebelumnya, untuk pratinjau */
  sebelumnya: { peran: PeranPelatihan; atasan_nama: string | null };
};
export type GalatImpor = { baris: number; pesan: string };
export type HasilImpor = { perubahan: PerubahanImpor[]; sama: number; galat: GalatImpor[]; kolomSah: boolean };

function adaSiklus(mulai: number, atasanDari: ReadonlyMap<number, number | null>): boolean {
  const lihat = new Set<number>();
  let id: number | null = atasanDari.get(mulai) ?? null;
  while (id !== null && !lihat.has(id)) {
    if (id === mulai) return true;
    lihat.add(id);
    id = atasanDari.get(id) ?? null;
  }
  return false;
}

/** Membaca baris lembar kerja (array of array, baris pertama yang memuat kolom "Nama" dianggap judul). */
export function bacaImpor(lembar: readonly (readonly unknown[])[], simpul: readonly SimpulHierarki[]): HasilImpor {
  const hasil: HasilImpor = { perubahan: [], sama: 0, galat: [], kolomSah: false };
  let judul = -1;
  for (let i = 0; i < Math.min(lembar.length, 10); i++) {
    if (lembar[i].some((c) => normNama(c) === "nama")) {
      judul = i;
      break;
    }
  }
  if (judul < 0) {
    hasil.galat.push({ baris: 1, pesan: "Baris judul tidak ditemukan (harus ada kolom Nama). Pakai template dari tombol Unduh template." });
    return hasil;
  }
  const kolom = lembar[judul].map(normNama);
  const cNama = kolom.indexOf("nama");
  const cPeran = kolom.indexOf("peran");
  const cAtasan = [kolom.indexOf("atasan"), kolom.indexOf("nama atasan"), kolom.indexOf("atasan (nama)")].find((x) => x >= 0) ?? -1;
  if (cAtasan < 0) {
    hasil.galat.push({ baris: judul + 1, pesan: "Kolom Atasan tidak ditemukan. Pakai template dari tombol Unduh template." });
    return hasil;
  }
  hasil.kolomSah = true;

  const peta = new Map<string, SimpulHierarki[]>();
  for (const s of simpul) peta.set(normNama(s.nama), [...(peta.get(normNama(s.nama)) ?? []), s]);
  const namaPer = new Map(simpul.map((s) => [s.akun_id, s.nama]));
  const cari = (n: string): SimpulHierarki | "kembar" | null => {
    const l = peta.get(normNama(n));
    return !l ? null : l.length > 1 ? "kembar" : l[0];
  };

  type Calon = { baris: number; s: SimpulHierarki; peran: PeranPelatihan; atasan: number | null };
  const calon: Calon[] = [];
  const sudah = new Set<number>();
  for (let i = judul + 1; i < lembar.length; i++) {
    const r = lembar[i];
    const nomor = i + 1;
    const nama = teks(r[cNama]);
    if (!nama) continue;
    const s = cari(nama);
    if (s === null) {
      hasil.galat.push({ baris: nomor, pesan: `Nama "${nama}" bukan peserta pelatihan ini.` });
      continue;
    }
    if (s === "kembar") {
      hasil.galat.push({ baris: nomor, pesan: `Nama "${nama}" kembar; ubah lewat tabel.` });
      continue;
    }
    if (sudah.has(s.akun_id)) {
      hasil.galat.push({ baris: nomor, pesan: `"${nama}" muncul lebih dari sekali.` });
      continue;
    }
    sudah.add(s.akun_id);

    let peran = s.peran;
    const pRaw = cPeran >= 0 ? teks(r[cPeran]).toLowerCase() : "";
    if (pRaw) {
      if (!PERAN_SAH.has(pRaw)) {
        hasil.galat.push({ baris: nomor, pesan: `Peran "${pRaw}" tidak dikenal (korwil, pml, atau ppl).` });
        continue;
      }
      peran = pRaw as PeranPelatihan;
    }

    let atasan: number | null = s.atasan_akun_id;
    const aRaw = teks(r[cAtasan]);
    if (aRaw === "-" || aRaw === "–") atasan = null;
    else if (aRaw) {
      const a = cari(aRaw);
      if (a === null) {
        hasil.galat.push({ baris: nomor, pesan: `Atasan "${aRaw}" bukan peserta pelatihan ini.` });
        continue;
      }
      if (a === "kembar") {
        hasil.galat.push({ baris: nomor, pesan: `Atasan "${aRaw}" kembar; ubah lewat tabel.` });
        continue;
      }
      if (a.akun_id === s.akun_id) {
        hasil.galat.push({ baris: nomor, pesan: `"${nama}" tidak boleh menjadi atasan diri sendiri.` });
        continue;
      }
      atasan = a.akun_id;
    }
    if (peran === s.peran && atasan === s.atasan_akun_id) {
      hasil.sama++;
      continue;
    }
    calon.push({ baris: nomor, s, peran, atasan });
  }

  // siklus akibat gabungan perubahan: buang baris yang ikut melingkar, ulangi sampai stabil
  let sisa = calon;
  for (let putaran = 0; putaran <= calon.length; putaran++) {
    const atasanDari = new Map<number, number | null>(simpul.map((x) => [x.akun_id, x.atasan_akun_id]));
    for (const c of sisa) atasanDari.set(c.s.akun_id, c.atasan);
    const buruk = sisa.filter((c) => adaSiklus(c.s.akun_id, atasanDari));
    if (buruk.length === 0) break;
    for (const c of buruk) hasil.galat.push({ baris: c.baris, pesan: `"${c.s.nama}": atasan yang dipilih membuat rantai atasan melingkar.` });
    const set = new Set(buruk.map((c) => c.s.akun_id));
    sisa = sisa.filter((c) => !set.has(c.s.akun_id));
  }
  hasil.perubahan = sisa.map((c) => ({
    akun_id: c.s.akun_id,
    nama: c.s.nama,
    peran: c.peran,
    atasan_akun_id: c.atasan,
    atasan_nama: c.atasan === null ? null : namaPer.get(c.atasan) ?? null,
    sebelumnya: { peran: c.s.peran, atasan_nama: c.s.atasan_akun_id === null ? null : namaPer.get(c.s.atasan_akun_id) ?? null },
  }));
  hasil.galat.sort((a, b) => a.baris - b.baris);
  return hasil;
}

export type MasukanPerubahan = { akun_id: number; atasan_akun_id: number | null; peran: PeranPelatihan };

/** Pemeriksaan di server atas daftar perubahan: peserta sah, atasan sah, bukan diri sendiri, tanpa siklus. Mengembalikan pesan galat atau null. */
export function periksaPerubahan(simpul: readonly SimpulHierarki[], perubahan: readonly MasukanPerubahan[]): string | null {
  const ada = new Set(simpul.map((s) => s.akun_id));
  const atasanDari = new Map<number, number | null>(simpul.map((x) => [x.akun_id, x.atasan_akun_id]));
  const lihat = new Set<number>();
  for (const p of perubahan) {
    if (!ada.has(p.akun_id)) return "Ada akun yang bukan peserta pelatihan ini.";
    if (lihat.has(p.akun_id)) return "Ada peserta yang muncul dua kali dalam perubahan.";
    lihat.add(p.akun_id);
    if (!PERAN_SAH.has(p.peran)) return "Peran tidak valid.";
    if (p.atasan_akun_id !== null) {
      if (p.atasan_akun_id === p.akun_id) return "Atasan tidak boleh diri sendiri.";
      if (!ada.has(p.atasan_akun_id)) return "Atasan harus peserta pelatihan ini.";
    }
    atasanDari.set(p.akun_id, p.atasan_akun_id);
  }
  for (const p of perubahan) if (adaSiklus(p.akun_id, atasanDari)) return "Perubahan membuat atasan melingkar.";
  return null;
}
