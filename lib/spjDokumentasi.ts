// lib/spjDokumentasi.ts
//
// Label 5 slot foto Dokumentasi -- KONSTAN dipakai bareng oleh frontend
// (app/penyisiran/administrasi-spj.tsx, urutan tombol upload) & backend
// (app/api/penyisiran/spj/dokumentasi/*, validasi `slot` & label di PDF
// lib/pdf/dokumentasi.ts) supaya urutan & teksnya SELALU sinkron di
// ketiga tempat itu -- persis 5 momen yg diminta user: sebelum berangkat,
// sampai lokasi, saat mendata, akan pulang, sampai di rumah.

export const SLOT_LABELS: Record<number, string> = {
  1: "Sebelum Berangkat",
  2: "Sampai di Lokasi",
  3: "Saat Mendata/Identifikasi",
  4: "Akan Pulang",
  5: "Sampai di Rumah",
};

export const SLOT_URUTAN = [1, 2, 3, 4, 5] as const;
