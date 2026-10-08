// lib/sigapNilaiHitung.ts
//
// (8 Okt 2026) Nilai akhir peserta pelatihan = rata-rata berbobot dari komponen yang dicentang:
// Pretest, Posttest, Kuis (Adu Sigap). Murni (tanpa database) -> dipakai server DAN browser (Monitoring menghitung ulang
// seketika saat skema diubah).
//
// Aturan:
//  - Nilai tiap komponen skala 0-100. Pretest/Posttest = skor sesi yang selesai. Kuis = persentase jawaban benar
//    (dasar "benar") ATAU poin dinormalkan terhadap poin maksimum 1000/soal (dasar "poin"), dari ruang kuis selesai terakhir
//    yang dijawab peserta.
//  - Hanya komponen yang dicentang dihitung; total bobot komponen terpilih HARUS 100.
//  - Komponen terpilih yang belum punya nilai dihitung 0; baris ditandai `lengkap = false`.
//    Bila SEMUA komponen terpilih kosong -> nilai akhir null ("-").

export type KomponenNilai = "pretest" | "posttest" | "kuis";
export const KOMPONEN: KomponenNilai[] = ["pretest", "posttest", "kuis"];
export const LABEL_KOMPONEN: Record<KomponenNilai, string> = { pretest: "Pretest", posttest: "Posttest", kuis: "Kuis (Adu Sigap)" };
export type DasarKuis = "benar" | "poin";
export const LABEL_DASAR_KUIS: Record<DasarKuis, string> = { benar: "% jawaban benar", poin: "poin dinormalkan (maks 1000/soal)" };

export type SkemaNilai = { pakai: Record<KomponenNilai, boolean>; bobot: Record<KomponenNilai, number>; dasar_kuis: DasarKuis };

export const SKEMA_BAWAAN: SkemaNilai = {
  pakai: { pretest: true, posttest: true, kuis: true },
  bobot: { pretest: 20, posttest: 50, kuis: 30 },
  dasar_kuis: "benar",
};

/** Hasil kuis seorang peserta pada ruang kuis selesai terakhir yang diikutinya. */
export type KuisNilai = { ruang_id: number; kelas: number; poin: number; benar: number; menjawab: number; total_soal: number; benar_pct: number; poin_pct: number };

export type NilaiPeserta = { pretest: number | null; posttest: number | null; kuis: KuisNilai | null };

export const bulat2 = (n: number) => Math.round(n * 100) / 100;

export function nilaiKuis(k: KuisNilai | null | undefined, dasar: DasarKuis): number | null {
  if (!k) return null;
  return dasar === "poin" ? k.poin_pct : k.benar_pct;
}

export type HasilAkhir = { akhir: number | null; lengkap: boolean; komponen: Record<KomponenNilai, number | null> };

export function hitungAkhir(skema: SkemaNilai, n: NilaiPeserta): HasilAkhir {
  const komponen: Record<KomponenNilai, number | null> = { pretest: n.pretest ?? null, posttest: n.posttest ?? null, kuis: nilaiKuis(n.kuis, skema.dasar_kuis) };
  const dipakai = KOMPONEN.filter((k) => skema.pakai[k]);
  if (dipakai.length === 0 || dipakai.every((k) => komponen[k] == null)) return { akhir: null, lengkap: false, komponen };
  const jumlah = dipakai.reduce((a, k) => a + (skema.bobot[k] * (komponen[k] ?? 0)) / 100, 0);
  return { akhir: bulat2(jumlah), lengkap: dipakai.every((k) => komponen[k] != null), komponen };
}

export function ringkasSkema(s: SkemaNilai): string {
  const bagian = KOMPONEN.filter((k) => s.pakai[k]).map((k) => `${LABEL_KOMPONEN[k]} ${s.bobot[k]}%`);
  return bagian.length ? bagian.join(" + ") : "(belum ada komponen dipilih)";
}

/** Periksa & rapikan skema dari input mentah (JSON). Bobot komponen yang tidak dipilih dipaksa 0. */
export function validasiSkema(x: unknown): { ok: true; skema: SkemaNilai } | { ok: false; error: string } {
  const o = (x ?? {}) as { pakai?: Record<string, unknown>; bobot?: Record<string, unknown>; dasar_kuis?: unknown };
  const pakai = {} as Record<KomponenNilai, boolean>;
  const bobot = {} as Record<KomponenNilai, number>;
  for (const k of KOMPONEN) {
    pakai[k] = o.pakai?.[k] === true;
    const b = Number(o.bobot?.[k]);
    if (pakai[k]) {
      if (!Number.isInteger(b) || b < 0 || b > 100) return { ok: false, error: `Bobot ${LABEL_KOMPONEN[k]} harus bilangan bulat 0–100.` };
      bobot[k] = b;
    } else bobot[k] = 0;
  }
  const dipakai = KOMPONEN.filter((k) => pakai[k]);
  if (dipakai.length === 0) return { ok: false, error: "Pilih minimal satu komponen nilai." };
  const total = dipakai.reduce((a, k) => a + bobot[k], 0);
  if (total !== 100) return { ok: false, error: `Total bobot komponen terpilih harus 100% (sekarang ${total}%).` };
  const dasar: DasarKuis = o.dasar_kuis === "poin" ? "poin" : "benar";
  return { ok: true, skema: { pakai, bobot, dasar_kuis: dasar } };
}
