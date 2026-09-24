// lib/spjIdentitas.ts
//
// Helper BERSAMA utk label & nilai identitas (Nip./NIK.) petugas di
// dokumen SPJ (Kwitansi, Surat Pernyataan, dst) -- awalnya cuma di
// lib/pdf/kwitansi.ts, DIPINDAH KE SINI (permintaan user 24 Sep 2026:
// aturan yg SAMA jg dipakai Surat Pernyataan) supaya SATU sumber logic,
// jangan diduplikasi/berisiko beda antar dokumen.
//
// Aturan:
//  - PPL & "tetangga" (informan, tabel tetangga_akun -- TIDAK py kolom
//    jabatan sama sekali, jadi SELALU dianggap non-organik) -- NIK,
//    label "NIK." huruf kapital semua (permintaan user 24 Sep 2026).
//  - PML/Kepala Kantor/organik lain -- NIP, label "Nip.".
//  - Nilainya: kolom `nip` di petugas_penyisiran_akun UTK PEGAWAI ORGANIK
//    kadang berisi gabungan "Sobat ID-NIP" (krn org ybs jg py akun Sobat,
//    dipakai APA ADANYA di Surat Pernyataan label "Sobat ID" versi lama
//    -- itu TIDAK diubah). Di baris "Nip."/"NIK." bawah nama, kalau ada
//    tanda "-", HANYA bagian SETELAH "-" TERAKHIR (NIP-nya) yg ditampilkan.

/** true kalau petugas ini "pegawai organik" (py NIP ASN) -- PML/Kepala Kantor. PPL & tetangga/informan (jabatan null krn tabelnya tidak py kolom itu) dianggap non-organik (pakai NIK). */
export function organik(jabatan: string | null): boolean {
  return jabatan === "pml" || jabatan === "kepala_kantor";
}

/** Label identitas: "NIK." (kapital semua) utk PPL/tetangga, "Nip." utk organik (PML/Kepala Kantor). */
export function labelIdentitas(jabatan: string | null): "NIK." | "Nip." {
  return organik(jabatan) ? "Nip." : "NIK.";
}

/**
 * Bersihkan nilai identitas: utk organik (PML/Kepala Kantor), kalau
 * mengandung "Sobat ID-NIP" gabungan, ambil bagian NIP-nya saja (setelah
 * "-" terakhir). PPL/tetangga (NIK murni, tidak pernah digabung) dibiarkan
 * apa adanya.
 */
export function bersihkanNip(id: string | null, jabatan: string | null): string | null {
  if (!id || !organik(jabatan)) return id;
  const idxStrip = id.lastIndexOf("-");
  return idxStrip === -1 ? id : id.slice(idxStrip + 1);
}
