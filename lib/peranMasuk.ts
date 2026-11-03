// lib/peranMasuk.ts  (murni)
//
// (3 Nov 2026) "Masuk sebagai": akun berkewenangan ganda di sebuah pelatihan (peserta, instruktur, panitia, penanggung jawab) memilih peran lewat dropdown di HP.
// Pilihan menentukan isi tab Hari ini (kartu peserta atau ringkasan pengelola), tab bawah (Pelatihan atau Absen peserta), dan tombol Kamera. Hanya memengaruhi TAMPILAN:
// hak akses di server tetap menurut izin akun.

export type PeranMasuk = "peserta" | "instruktur" | "panitia" | "pj";

export const LABEL_PERAN: Record<PeranMasuk, string> = {
  peserta: "Peserta",
  instruktur: "Instruktur",
  panitia: "Panitia",
  pj: "Penanggung jawab (PJ)",
};

const URUT: PeranMasuk[] = ["pj", "panitia", "instruktur", "peserta"];

export type KewenanganAkun = { peserta: boolean; instruktur: boolean; lihat: boolean; kelola: boolean };

/** Peran yang tersedia: PJ bila izin Kelola level kelola, selain itu Panitia bila izin lihat; ditambah Instruktur dan Peserta. Urut dari kewenangan terbesar. */
export function peranTersedia(k: KewenanganAkun): PeranMasuk[] {
  const ada: PeranMasuk[] = [];
  if (k.kelola) ada.push("pj");
  else if (k.lihat) ada.push("panitia");
  if (k.instruktur) ada.push("instruktur");
  if (k.peserta) ada.push("peserta");
  return URUT.filter((p) => ada.includes(p));
}

/**
 * Peran yang BOLEH DIPILIH di dropdown. Pengelola (izin Kelola -> PJ, izin Lihat -> Panitia) bebas berganti ke peran di bawahnya, termasuk yang belum terdaftar
 * (menjadi pratinjau: tampilan saja, sama seperti peran lain hak akses tetap menurut izin). Akun tanpa izin pengelola hanya memilih peran yang benar-benar dimilikinya.
 */
export function peranPilihan(k: KewenanganAkun): PeranMasuk[] {
  if (k.kelola) return ["pj", "panitia", "instruktur", "peserta"];
  if (k.lihat) return ["panitia", "instruktur", "peserta"];
  return peranTersedia(k);
}

/** Teks di dropdown: peran yang belum terdaftar diberi keterangan "pratinjau". */
export function labelPilihan(p: PeranMasuk, nyata: readonly PeranMasuk[]): string {
  return nyata.includes(p) || (p === "panitia" && nyata.includes("pj")) ? LABEL_PERAN[p] : `${LABEL_PERAN[p]} (pratinjau)`;
}

export const adalahPeran = (x: unknown): x is PeranMasuk => x === "peserta" || x === "instruktur" || x === "panitia" || x === "pj";

/**
 * Peran yang berlaku. Pilihan tersimpan dipakai bila masih tersedia. Tanpa pilihan: peserta yang BELUM menerima undangan masuk sebagai peserta lebih dulu
 * (undangan harus dituntaskan); selain itu kewenangan terbesar. Tidak ada peran -> null.
 */
export function pilihPeran(tersedia: readonly PeranMasuk[], tersimpan: string | null | undefined, undanganBelumDiterima = false): PeranMasuk | null {
  if (tersedia.length === 0) return null;
  if (adalahPeran(tersimpan) && tersedia.includes(tersimpan)) return tersimpan;
  if (undanganBelumDiterima && tersedia.includes("peserta")) return "peserta";
  return tersedia[0];
}

/** Dropdown hanya tampil bila ada dua peran atau lebih. */
export const perluPemilih = (tersedia: readonly PeranMasuk[]): boolean => tersedia.length >= 2;

/** Jenis pengguna di mata hierarki/absen. */
export const jenisDariPeran = (p: PeranMasuk): "peserta" | "instruktur" | "panitia" => (p === "pj" ? "panitia" : p);

/** Tab bawah menurut peran: peserta melihat Pelatihan; selain itu Absen peserta. */
export function tabUntukPeran(p: PeranMasuk): { pelatihan: boolean; absen: boolean } {
  return p === "peserta" ? { pelatihan: true, absen: false } : { pelatihan: false, absen: true };
}

export const kunciPeran = (kegiatanId: number): string => `sigap_pel_peran_${kegiatanId}`;

/** Label pendek untuk tombol menu di header (tanpa "(pratinjau)"). */
export const LABEL_PERAN_PENDEK: Record<PeranMasuk, string> = { peserta: "Peserta", instruktur: "Instruktur", panitia: "Panitia", pj: "PJ" };
