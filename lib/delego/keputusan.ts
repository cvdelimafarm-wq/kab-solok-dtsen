// lib/delego/keputusan.ts
//
// (14 Nov 2026) Keputusan tercatat (SQL 20261114v): sinyal Ruang keputusan -> pilihan + alasan -> butir kerja Delego -> evaluasi.
// Berkas MURNI: bentuk data, pilihan bawaan per jenis sinyal, pemeriksaan isian, dan penyusun argumen fungsi basis data.

export type HasilEvaluasi = "sinyal_hilang" | "masih_ada" | "lainnya";

/** Keputusan terakhir yang menempel pada satu butir sinyal (keu_keputusan_ringkas). */
export type RingkasKeputusan = {
  id: number; pilihan: string; diputus_at: string; pemutus: string; butir: number; butir_selesai: number; evaluasi: HasilEvaluasi | null;
};

export type ButirKeputusan = { id: number; judul: string; status: string; tenggat: string; penerima: string };

export type Keputusan = {
  id: number; sinyal_kode: string; sinyal_kunci: string; judul: string; ringkas: string; ident_id: number | null; pilihan: string; alasan: string;
  pemutus_peran: string; pemutus: string; milik_saya: boolean; diputus_at: string; evaluasi_hasil: HasilEvaluasi | null; evaluasi_catatan: string | null;
  dievaluasi_at: string | null; butir: number; butir_selesai: number; butir_isi: ButirKeputusan[];
};

export type BahanKeputusanTercatat = {
  hari_ini: string;
  pemutus: boolean;
  keputusan: Keputusan[];
  ringkas: { bulan_ini: number; tanpa_tindak_lanjut: number; tunggu_evaluasi: number };
  organik: { akun_id: number; nama: string }[];
  kelompok: { kode: string; nama: string }[];
};

export const MIN_ALASAN = 10;

/** Pilihan yang disarankan per jenis sinyal. Sistem menyarankan; pemutus boleh menulis pilihan lain. */
export const PILIHAN_SARAN: Record<string, string[]> = {
  naik_kepala: ["Perpanjang tenggat", "Alihkan ke pegawai lain", "Kurangi target", "Batalkan butir", "Tetap dengan bantuan"],
  sanggah: ["Terima sanggahan", "Tolak sanggahan", "Minta keterangan tambahan"],
  gap_keras: ["Usulkan revisi anggaran", "Ubah identifikasi", "Batalkan identifikasi", "Terima selisih dengan catatan"],
  spk: ["Terbitkan SPK sekarang dengan catatan keterlambatan", "Tunda penerbitan SPK"],
  usulan: ["Setujui usulan", "Tolak usulan"],
  tanpa_catatan: ["Wajibkan catat pekerjaan kantor", "Tunda aturan minimal sampai pencatatan berjalan"],
  lainnya: [],
};

export const TEKS_EVALUASI: Record<HasilEvaluasi, { teks: string; nada: "hijau" | "amber" | "abu" }> = {
  sinyal_hilang: { teks: "Sinyal hilang", nada: "hijau" },
  masih_ada: { teks: "Sinyal masih ada", nada: "amber" },
  lainnya: { teks: "Lainnya", nada: "abu" },
};

/** Keadaan satu keputusan untuk lencana. */
export function statusKeputusan(k: { butir: number; butir_selesai: number; evaluasi: HasilEvaluasi | null } | null): { teks: string; nada: "hijau" | "amber" | "biru" | "abu" } | null {
  if (!k) return null;
  if (k.evaluasi) return { teks: `Dievaluasi: ${TEKS_EVALUASI[k.evaluasi].teks.toLowerCase()}`, nada: TEKS_EVALUASI[k.evaluasi].nada };
  if (k.butir > 0 && k.butir_selesai < k.butir) return { teks: `Butir ${k.butir_selesai}/${k.butir} selesai`, nada: "biru" };
  return { teks: "Diputuskan, tunggu evaluasi", nada: "amber" };
}

export type IsianKeputusan = {
  pilihan: string;
  alasan: string;
  butir: boolean;
  penerima: number | null;
  tenggat: string;
  judulButir: string;
  kelompok: string;
  targetHarian: string;
};

export const ISIAN_KEPUTUSAN_KOSONG: IsianKeputusan = { pilihan: "", alasan: "", butir: false, penerima: null, tenggat: "", judulButir: "", kelompok: "", targetHarian: "20" };

/** Pesan galat pertama, atau null bila isian sah. `adaIdent`: sinyal membawa identifikasi (butir memakai RO-nya). */
export function galatKeputusan(f: IsianKeputusan, hariIni: string, adaIdent: boolean): string | null {
  if (f.pilihan.trim().length < 3) return "Tulis pilihan yang diambil.";
  if (f.alasan.trim().length < MIN_ALASAN) return `Alasan minimal ${MIN_ALASAN} huruf.`;
  if (!f.butir) return null;
  if (!f.penerima) return "Pilih penerima butir kerja.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.tenggat)) return "Isi tenggat butir kerja.";
  if (f.tenggat < hariIni) return "Tenggat tidak boleh sebelum hari ini.";
  if (f.judulButir.trim().length < 3) return "Judul butir kerja minimal 3 huruf.";
  if (!adaIdent && !f.kelompok) return "Pilih pekerjaan tim untuk butir kerja.";
  const t = Number(f.targetHarian.replace(",", "."));
  if (!Number.isFinite(t) || t < 0 || t > 1000) return "Beban harian 0 sampai 1000 poin.";
  return null;
}

/** Argumen keu_keputusan_catat. */
export function argsKeputusan(
  s: { kode: string; judul: string; kunci: string; teks: string; sub: string; ident_id?: number | null },
  f: IsianKeputusan,
): Record<string, unknown> {
  const butir = f.butir
    ? {
        judul: f.judulButir.trim(),
        tenggat: f.tenggat,
        target_harian: Number(f.targetHarian.replace(",", ".")),
        penerima: [{ akun: f.penerima, peran: "pegawai" }],
        ...(s.ident_id ? {} : { kelompok: f.kelompok }),
      }
    : null;
  return {
    p_sinyal: s.kode,
    p_kunci: s.kunci,
    p_judul: s.teks.slice(0, 200),
    p_ringkas: `${s.judul}: ${s.sub}`.slice(0, 500),
    p_pilihan: f.pilihan.trim(),
    p_alasan: f.alasan.trim(),
    p_ident: s.ident_id ?? null,
    p_butir: butir,
  };
}

/** Judul butir kerja bawaan dari pilihan dan sinyal. */
export const judulButirBawaan = (pilihan: string, teks: string) => `${pilihan.trim() || "Tindak lanjut"}: ${teks}`.slice(0, 200);
