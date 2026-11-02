// lib/instrumenTampil.ts  (murni)
//
// (3 Nov 2026) Kartu berkas Instrumen: nama berkas tidak ditulis dua kali. Judul sering sama dengan nama berkas (mis. "2. Kuesioner ... .pdf" dan judul tanpa ".pdf"),
// jadi nama berkas hanya ditampilkan bila BERBEDA dari judul (selain ekstensi, huruf besar-kecil, dan spasi / tanda baca).

const sandi = (t: string): string =>
  t
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip|rar|mp4|mov|png|jpe?g)$/i, "")
    .replace(/[^a-z0-9]+/g, "");

/** Nama berkas yang perlu ditampilkan di bawah judul; null bila sudah sama dengan judul (atau kosong). */
export function namaBerkasTambahan(judul: string, namaFile: string | null | undefined): string | null {
  const n = (namaFile ?? "").trim();
  if (!n) return null;
  return sandi(n) === sandi(judul ?? "") ? null : n;
}
