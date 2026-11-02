// lib/instrumenBerkas.ts  (murni; dipakai klien)
//
// (2 Nov 2026) Instrumen pelatihan: kuesioner, buku pedoman, PPT materi. Definisi grup, pemeriksaan berkas sebelum unggah, dan ringkasan status ("sudah diunggah / belum").
// Unggah DIKELOLA di Kelola Pelatihan (tab Persiapan > Instrumen); halaman Instrumen peserta hanya mengunduh / membuka.

export type JenisBerkas = "kuesioner" | "pedoman" | "materi";
export type BerkasInstrumen = { id: number; jenis: JenisBerkas; judul: string; nama_file: string; ukuran: number | null; diunggah_at: string };

export const MAKS_BYTE_BERKAS = 100 * 1024 * 1024; // sama dengan server (/api/sigap/pelatihan/instrumen)

export type GrupBerkas = { jenis: JenisBerkas; judul: string; ket: string; kosong: string; terima: string[] };
export const GRUP_BERKAS: GrupBerkas[] = [
  { jenis: "kuesioner", judul: "Kuesioner", ket: "Kuesioner pendataan yang dipakai di lapangan.", kosong: "Kuesioner belum diunggah.", terima: ["pdf", "doc", "docx", "xls", "xlsx"] },
  { jenis: "pedoman", judul: "Buku Pedoman", ket: "Pedoman pendataan: konsep, definisi, dan tata cara.", kosong: "Buku pedoman belum diunggah panitia. Akan tersedia di sini.", terima: ["pdf", "doc", "docx"] },
  { jenis: "materi", judul: "PPT Materi Pelatihan", ket: "Bahan paparan pelatihan.", kosong: "PPT materi belum diunggah panitia. Akan tersedia di sini.", terima: ["ppt", "pptx", "pps", "ppsx", "pdf", "zip"] },
];
export const grupDari = (jenis: JenisBerkas): GrupBerkas => GRUP_BERKAS.find((g) => g.jenis === jenis)!;
export const atributTerima = (g: GrupBerkas): string => g.terima.map((e) => `.${e}`).join(",");

export function ukuranTeks(b: number | null | undefined): string {
  if (!b) return "";
  return b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

export const ekstensi = (nama: string): string => (nama.includes(".") ? (nama.split(".").pop() ?? "").toLowerCase() : "");

/** Alasan berkas ditolak sebelum diunggah, atau null bila boleh. */
export function periksaBerkas(jenis: JenisBerkas, nama: string, ukuran: number): string | null {
  const g = grupDari(jenis);
  const e = ekstensi(nama);
  if (!ukuran) return "Berkas kosong.";
  if (ukuran > MAKS_BYTE_BERKAS) return `Terlalu besar (${ukuranTeks(ukuran)}); maksimal 100 MB.`;
  if (!g.terima.includes(e)) return `Format .${e || "?"} tidak diterima di ${g.judul}. Gunakan: ${g.terima.join(", ")}.`;
  return null;
}

export type JenisIkonBerkas = "pdf" | "dokumen" | "lembar" | "slide" | "arsip";
export function jenisIkonBerkas(nama: string): JenisIkonBerkas {
  const e = ekstensi(nama);
  if (e === "pdf") return "pdf";
  if (["doc", "docx"].includes(e)) return "dokumen";
  if (["xls", "xlsx"].includes(e)) return "lembar";
  if (["ppt", "pptx", "pps", "ppsx"].includes(e)) return "slide";
  return "arsip";
}

/** PDF dan gambar dapat dibuka langsung di tab browser; format lain disimpan ke HP dengan nama aslinya. */
export const bisaDibukaDiTab = (nama: string): boolean => ["pdf", "png", "jpg", "jpeg", "gif", "webp"].includes(ekstensi(nama));

export type RingkasJenis = { jenis: JenisBerkas; judul: string; jumlah: number; ada: boolean; teks: string };
export function ringkasJenis(berkas: readonly BerkasInstrumen[], jenis: JenisBerkas): RingkasJenis {
  const n = berkas.filter((b) => b.jenis === jenis).length;
  return { jenis, judul: grupDari(jenis).judul, jumlah: n, ada: n > 0, teks: n === 0 ? "Belum diunggah" : n === 1 ? "1 berkas terunggah" : `${n} berkas terunggah` };
}

export function ringkasSemua(berkas: readonly BerkasInstrumen[]): { jenis: RingkasJenis[]; lengkap: boolean; terisi: number } {
  const jenis = GRUP_BERKAS.map((g) => ringkasJenis(berkas, g.jenis));
  const terisi = jenis.filter((j) => j.ada).length;
  return { jenis, lengkap: terisi === jenis.length, terisi };
}
