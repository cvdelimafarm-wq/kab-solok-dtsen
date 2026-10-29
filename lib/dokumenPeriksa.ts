// lib/dokumenPeriksa.ts  (murni; dipakai server DAN klien)
//
// (29 Okt 2026) Dokumen hasil pemeriksaan: PML mengunggah PDF scan dari Lembar Pendataan; admin/supervisor mengunduhnya di Kelola Pendataan > QC >
// Dokumen pemeriksaan. Berkas disimpan di penyimpanan sigap-files (pemeriksaan/<kegiatan>/<pml>/<hash>.pdf), catatannya di bencana_dokumen_periksa.
// Jenis berkas ditentukan dari byte awal (%PDF-), bukan dari nama atau tipe kiriman klien. Tidak ada penghapusan permanen: PML hanya "menarik" dokumen
// (dihapus_at), berkasnya tetap tersimpan.

export const MAKS_BYTE_DOKUMEN = 15 * 1024 * 1024;
export const MAKS_JUDUL = 120;
export const MAKS_KETERANGAN = 500;
export const KEGIATAN_DOKUMEN_BAWAAN = 1;

export type DokumenPeriksa = {
  id: number;
  kegiatan_id: number;
  pml_id: number;
  judul: string;
  keterangan: string | null;
  idsubsls: string | null;
  tanggal_periksa: string | null;
  nama_asli: string | null;
  ukuran_byte: number;
  diunggah_at: string;
  diunggah_oleh: string | null;
};

/** Baris untuk admin: dokumen + nama PML dan nama Sub SLS (bila ada). */
export type DokumenPeriksaAdmin = DokumenPeriksa & { pml_nama: string; sub_nama: string | null };

export type KelompokPml = { pml_id: number; pml_nama: string; dokumen: DokumenPeriksaAdmin[]; terakhir_at: string };

/** Berkas PDF sah bila diawali "%PDF-" (boleh didahului sedikit byte kosong, sesuai spesifikasi). */
export function adalahPdf(bytes: Uint8Array): boolean {
  const awal = bytes.subarray(0, 1024);
  const tanda = [0x25, 0x50, 0x44, 0x46, 0x2d];
  outer: for (let i = 0; i + tanda.length <= awal.length; i++) {
    for (let j = 0; j < tanda.length; j++) if (awal[i + j] !== tanda[j]) continue outer;
    return true;
  }
  return false;
}

/** null = ukuran sah; selain itu pesan galat. */
export function periksaUkuranDokumen(byte: number): string | null {
  if (!Number.isFinite(byte) || byte <= 0) return "Berkas kosong. Pilih PDF hasil scan.";
  if (byte > MAKS_BYTE_DOKUMEN) return `Berkas ${labelUkuran(byte)} terlalu besar (maks ${labelUkuran(MAKS_BYTE_DOKUMEN)}). Kecilkan resolusi scan lalu coba lagi.`;
  return null;
}

export function labelUkuran(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} KB`;
  return `${(byte / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

const rapikan = (s: unknown, maks: number): string => String(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maks);

export type IsianDokumen = { judul: string; keterangan: string | null; idsubsls: string | null; tanggal_periksa: string | null };

const TGL = /^\d{4}-\d{2}-\d{2}$/;
function tanggalSah(t: string): boolean {
  if (!TGL.test(t)) return false;
  const d = new Date(`${t}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
}

/** Memeriksa isian formulir unggah. `subSah` = idsubsls milik tim PML; `namaBerkas` dipakai sebagai judul bila judul kosong. */
export function periksaIsianDokumen(
  mentah: { judul?: unknown; keterangan?: unknown; idsubsls?: unknown; tanggal_periksa?: unknown },
  subSah: string[],
  namaBerkas: string | null
): { ok: true; isi: IsianDokumen } | { ok: false; pesan: string } {
  let judul = rapikan(mentah.judul, MAKS_JUDUL);
  if (!judul && namaBerkas) judul = rapikan(namaBerkas.replace(/\.pdf$/i, "").replace(/[_]+/g, " "), MAKS_JUDUL);
  if (!judul) return { ok: false, pesan: "Judul dokumen wajib diisi." };
  const ket = rapikan(mentah.keterangan, MAKS_KETERANGAN);
  const sub = rapikan(mentah.idsubsls, 40);
  if (sub && !subSah.includes(sub)) return { ok: false, pesan: "Sub SLS yang dipilih bukan wilayah tim Anda." };
  const tgl = rapikan(mentah.tanggal_periksa, 10);
  if (tgl && !tanggalSah(tgl)) return { ok: false, pesan: "Tanggal pemeriksaan tidak sah." };
  return { ok: true, isi: { judul, keterangan: ket || null, idsubsls: sub || null, tanggal_periksa: tgl || null } };
}

/** Jalur penyimpanan: pemeriksaan/<kegiatan>/<pml>/<24 hex pertama sha256>.pdf (isi sama = jalur sama). */
export function jalurDokumen(kegiatanId: number, pmlId: number, sha256: string): string {
  return `pemeriksaan/${kegiatanId}/${pmlId}/${sha256.slice(0, 24)}.pdf`;
}

/** Nama berkas unduhan yang aman dan mudah dikenali: "<PML> - <judul>.pdf". */
export function namaUnduhan(pmlNama: string, judul: string): string {
  const aman = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  const dasar = [aman(pmlNama), aman(judul)].filter(Boolean).join(" - ").slice(0, 150).trim() || "dokumen pemeriksaan";
  return `${dasar}.pdf`;
}

/** Mengelompokkan dokumen per PML (kelompok dengan unggahan terbaru lebih dulu; di dalamnya terbaru dulu). */
export function kelompokkanPerPml(daftar: DokumenPeriksaAdmin[]): KelompokPml[] {
  const peta = new Map<number, KelompokPml>();
  for (const d of daftar) {
    const k = peta.get(d.pml_id) ?? { pml_id: d.pml_id, pml_nama: d.pml_nama, dokumen: [], terakhir_at: d.diunggah_at };
    k.dokumen.push(d);
    if (d.diunggah_at > k.terakhir_at) k.terakhir_at = d.diunggah_at;
    peta.set(d.pml_id, k);
  }
  const hasil = Array.from(peta.values());
  for (const k of hasil) k.dokumen.sort((a, b) => (a.diunggah_at < b.diunggah_at ? 1 : a.diunggah_at > b.diunggah_at ? -1 : b.id - a.id));
  return hasil.sort((a, b) => (a.terakhir_at < b.terakhir_at ? 1 : a.terakhir_at > b.terakhir_at ? -1 : a.pml_nama.localeCompare(b.pml_nama)));
}

/** Penyaring pencarian bebas pada judul, keterangan, nama PML, dan nama Sub SLS. */
export function cocokCari(d: DokumenPeriksaAdmin, kata: string): boolean {
  const q = kata.trim().toLowerCase();
  if (!q) return true;
  return [d.judul, d.keterangan, d.pml_nama, d.sub_nama, d.nama_asli].some((x) => (x ?? "").toLowerCase().includes(q));
}
