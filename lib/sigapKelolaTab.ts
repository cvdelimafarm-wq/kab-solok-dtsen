// lib/sigapKelolaTab.ts
//
// (8 Nov 2026) Tujuh tab Kelola Pelatihan dan peta alamat lama -> baru. Fungsi MURNI (mudah diuji).
// Urutan tab mengikuti waktu pakai: Kesiapan · Peserta & Kelas · Materi & Penilaian · Komunikasi · Hari H · Kendala · Hasil & Administrasi.
// Alamat lama (?tab=soal, ?tab=kuis&sub=rapat, dsb.) tetap hidup: tautan, push, dan bookmark dialihkan ke tempat barunya.

export const TAB_KELOLA = ["kesiapan", "peserta", "materi", "komunikasi", "harih", "kendala", "hasil"] as const;
export type TabKelola = (typeof TAB_KELOLA)[number];

export type Tujuan = { tab: TabKelola; sub?: string };

const adalah = (t: string): t is TabKelola => (TAB_KELOLA as readonly string[]).includes(t);

/** Alamat (tab, sub) -> tujuan di susunan tujuh tab; null bila tab tidak dikenal. Tab baru dikembalikan apa adanya. */
export function petakanTab(tab: string | null | undefined, sub?: string | null): Tujuan | null {
  const t = (tab ?? "").trim();
  const s = (sub ?? "").trim() || undefined;
  if (!t) return null;
  if (adalah(t)) return { tab: t, sub: s };
  switch (t) {
    // --- tab sebelum 8 Nov 2026 ---
    case "persiapan":
      if (s === "instrumen") return { tab: "materi", sub: "instrumen" };
      if (s === "vanguard") return { tab: "materi", sub: "vanguard" };
      return { tab: "komunikasi", sub: "tampilan" };
    case "tim":
      // Instruktur dan Rencana kelas kini bagian dari "Orang & kelas" (sub pengaturan)
      return { tab: "peserta", sub: s === "hierarki" ? "hierarki" : "pengaturan" };
    case "harikerja":
      return { tab: "peserta", sub: "harikerja" };
    case "soal":
      return { tab: "materi", sub: "tes" };
    case "kuis":
      if (s === "kuispra") return { tab: "materi", sub: "kuispra" };
      if (s === "rapat") return { tab: "harih", sub: "rapat" };
      return { tab: "harih", sub: "adusigap" };
    case "notifikasi":
      return { tab: "komunikasi", sub: s === "pengumuman" ? "pengumuman" : "notifikasi" };
    case "monitoring":
      return { tab: "harih", sub: "monitoring" };
    case "administrasi":
      return { tab: "hasil" };
    // --- alamat yang lebih lama lagi ---
    case "pengumuman":
      return { tab: "komunikasi", sub: "pengumuman" };
    case "rapat":
      return { tab: "harih", sub: "rapat" };
    case "kuispra":
      return { tab: "materi", sub: "kuispra" };
    case "kelas":
      return { tab: "peserta", sub: "pengaturan" };
    case "tampilan":
      return { tab: "komunikasi", sub: "tampilan" };
    case "instrumen":
      return { tab: "materi", sub: "instrumen" };
    case "vanguard":
      return { tab: "materi", sub: "vanguard" };
    default:
      return null;
  }
}
