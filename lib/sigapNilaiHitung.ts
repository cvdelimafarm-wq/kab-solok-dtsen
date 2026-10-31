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

// (31 Okt 2026) Komponen tambahan yang diatur PJ: Kedisiplinan (otomatis dari presensi) dan Sikap (diisi panitia), serta ambang wajib lulus pada NILAI AKHIR.
// Semuanya OPSIONAL pada skema/nilai: tanpa itu, perilaku dan hasil hitung identik dengan sebelumnya.
export type KomponenTambahan = "disiplin" | "sikap";
export const KOMPONEN_TAMBAHAN: KomponenTambahan[] = ["disiplin", "sikap"];
export const LABEL_TAMBAHAN: Record<KomponenTambahan, string> = { disiplin: "Kedisiplinan", sikap: "Sikap" };
export const KET_TAMBAHAN: Record<KomponenTambahan, string> = {
  disiplin: "Otomatis dari presensi: sesi yang dihadiri tepat waktu dibanding seluruh sesi.",
  sikap: "Diisi panitia (0–100) pada tab Monitoring.",
};
export type TambahanSkema = Record<KomponenTambahan, { pakai: boolean; bobot: number }>;
export type LulusAkhir = { wajib: boolean; nilai: number };
export const TAMBAHAN_BAWAAN: TambahanSkema = { disiplin: { pakai: false, bobot: 0 }, sikap: { pakai: false, bobot: 0 } };
export const LULUS_AKHIR_BAWAAN: LulusAkhir = { wajib: false, nilai: 70 };

export type SkemaNilai = {
  pakai: Record<KomponenNilai, boolean>;
  bobot: Record<KomponenNilai, number>;
  dasar_kuis: DasarKuis;
  tambahan?: TambahanSkema;
  lulus_akhir?: LulusAkhir;
};

export const tambahanDari = (s: Pick<SkemaNilai, "tambahan">): TambahanSkema => ({
  disiplin: { pakai: s.tambahan?.disiplin?.pakai === true, bobot: Number(s.tambahan?.disiplin?.bobot) || 0 },
  sikap: { pakai: s.tambahan?.sikap?.pakai === true, bobot: Number(s.tambahan?.sikap?.bobot) || 0 },
});
export const lulusAkhirDari = (s: Pick<SkemaNilai, "lulus_akhir">): LulusAkhir => ({
  wajib: s.lulus_akhir?.wajib === true,
  nilai: Number.isFinite(Number(s.lulus_akhir?.nilai)) ? Number(s.lulus_akhir?.nilai) : LULUS_AKHIR_BAWAAN.nilai,
});
/** Bentuk baku (semua kunci terisi) untuk membandingkan dua skema. */
export const kanonik = (s: SkemaNilai): SkemaNilai => ({ pakai: s.pakai, bobot: s.bobot, dasar_kuis: s.dasar_kuis, tambahan: tambahanDari(s), lulus_akhir: lulusAkhirDari(s) });

export const SKEMA_BAWAAN: SkemaNilai = {
  pakai: { pretest: true, posttest: true, kuis: true },
  bobot: { pretest: 20, posttest: 50, kuis: 30 },
  dasar_kuis: "benar",
};

/** Hasil kuis seorang peserta pada ruang kuis selesai terakhir yang diikutinya. */
export type KuisNilai = { ruang_id: number; kelas: number; poin: number; benar: number; menjawab: number; total_soal: number; benar_pct: number; poin_pct: number };

export type NilaiPeserta = { pretest: number | null; posttest: number | null; kuis: KuisNilai | null; disiplin?: number | null; sikap?: number | null };

export const bulat2 = (n: number) => Math.round(n * 100) / 100;

export function nilaiKuis(k: KuisNilai | null | undefined, dasar: DasarKuis): number | null {
  if (!k) return null;
  return dasar === "poin" ? k.poin_pct : k.benar_pct;
}

export type HasilAkhir = {
  akhir: number | null;
  lengkap: boolean;
  komponen: Record<KomponenNilai, number | null>;
  /** Hanya ada bila ada komponen tambahan yang dipakai. */
  tambahan?: Record<KomponenTambahan, number | null>;
  /** Hanya ada bila skema mewajibkan lulus pada nilai akhir dan nilai akhir sudah ada. */
  lulus?: boolean;
};

export function hitungAkhir(skema: SkemaNilai, n: NilaiPeserta): HasilAkhir {
  const komponen: Record<KomponenNilai, number | null> = { pretest: n.pretest ?? null, posttest: n.posttest ?? null, kuis: nilaiKuis(n.kuis, skema.dasar_kuis) };
  const tam = tambahanDari(skema);
  const nilaiTam: Record<KomponenTambahan, number | null> = { disiplin: n.disiplin ?? null, sikap: n.sikap ?? null };
  const pakaiTam = KOMPONEN_TAMBAHAN.filter((k) => tam[k].pakai);
  const butir: { bobot: number; nilai: number | null }[] = [
    ...KOMPONEN.filter((k) => skema.pakai[k]).map((k) => ({ bobot: skema.bobot[k], nilai: komponen[k] })),
    ...pakaiTam.map((k) => ({ bobot: tam[k].bobot, nilai: nilaiTam[k] })),
  ];
  const tambahan = pakaiTam.length > 0 ? nilaiTam : undefined;
  if (butir.length === 0 || butir.every((b) => b.nilai == null)) return tambahan ? { akhir: null, lengkap: false, komponen, tambahan } : { akhir: null, lengkap: false, komponen };
  const akhir = bulat2(butir.reduce((a, b) => a + (b.bobot * (b.nilai ?? 0)) / 100, 0));
  const hasil: HasilAkhir = { akhir, lengkap: butir.every((b) => b.nilai != null), komponen };
  if (tambahan) hasil.tambahan = tambahan;
  const la = lulusAkhirDari(skema);
  if (la.wajib) hasil.lulus = akhir >= la.nilai;
  return hasil;
}

export function ringkasSkema(s: SkemaNilai): string {
  const tam = tambahanDari(s);
  const bagian = [
    ...KOMPONEN.filter((k) => s.pakai[k]).map((k) => `${LABEL_KOMPONEN[k]} ${s.bobot[k]}%`),
    ...KOMPONEN_TAMBAHAN.filter((k) => tam[k].pakai).map((k) => `${LABEL_TAMBAHAN[k]} ${tam[k].bobot}%`),
  ];
  const la = lulusAkhirDari(s);
  const dasar = bagian.length ? bagian.join(" + ") : "(belum ada komponen dipilih)";
  return la.wajib ? `${dasar} · wajib lulus nilai akhir ≥ ${String(la.nilai).replace(".", ",")}` : dasar;
}

/** Periksa & rapikan skema dari input mentah (JSON). Bobot komponen yang tidak dipilih dipaksa 0. */
export function validasiSkema(x: unknown): { ok: true; skema: SkemaNilai } | { ok: false; error: string } {
  const o = (x ?? {}) as { pakai?: Record<string, unknown>; bobot?: Record<string, unknown>; dasar_kuis?: unknown; tambahan?: Record<string, { pakai?: unknown; bobot?: unknown } | undefined>; lulus_akhir?: { wajib?: unknown; nilai?: unknown } };
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
  const tam = { ...TAMBAHAN_BAWAAN, disiplin: { ...TAMBAHAN_BAWAAN.disiplin }, sikap: { ...TAMBAHAN_BAWAAN.sikap } } as TambahanSkema;
  for (const k of KOMPONEN_TAMBAHAN) {
    const t = o.tambahan?.[k];
    const pk = t?.pakai === true;
    const b = Number(t?.bobot);
    if (pk) {
      if (!Number.isInteger(b) || b < 0 || b > 100) return { ok: false, error: `Bobot ${LABEL_TAMBAHAN[k]} harus bilangan bulat 0–100.` };
      tam[k] = { pakai: true, bobot: b };
    }
  }
  const dipakai = KOMPONEN.filter((k) => pakai[k]);
  const dipakaiTam = KOMPONEN_TAMBAHAN.filter((k) => tam[k].pakai);
  if (dipakai.length + dipakaiTam.length === 0) return { ok: false, error: "Pilih minimal satu komponen nilai." };
  const total = dipakai.reduce((a, k) => a + bobot[k], 0) + dipakaiTam.reduce((a, k) => a + tam[k].bobot, 0);
  if (total !== 100) return { ok: false, error: `Total bobot komponen terpilih harus 100% (sekarang ${total}%).` };
  const dasar: DasarKuis = o.dasar_kuis === "poin" ? "poin" : "benar";
  const skema: SkemaNilai = { pakai, bobot, dasar_kuis: dasar };
  if (dipakaiTam.length > 0) skema.tambahan = tam;
  if (o.lulus_akhir?.wajib === true) {
    const nl = Number(o.lulus_akhir.nilai);
    if (!Number.isFinite(nl) || nl < 0 || nl > 100) return { ok: false, error: "Nilai lulus pada nilai akhir harus 0–100." };
    skema.lulus_akhir = { wajib: true, nilai: Math.round(nl * 100) / 100 };
  }
  return { ok: true, skema };
}

export type ItemSikap = { akun_id: number; nilai: number | null };
/** Validasi item sikap dari klien: akun bilangan bulat positif, nilai bilangan bulat 0-100 atau null (hapus). */
export function periksaItemSikap(x: unknown): { ok: true; item: ItemSikap[] } | { ok: false; error: string } {
  if (!Array.isArray(x) || x.length === 0) return { ok: false, error: "Tidak ada nilai sikap yang dikirim." };
  if (x.length > 500) return { ok: false, error: "Terlalu banyak nilai sekaligus (maksimal 500)." };
  const item: ItemSikap[] = [];
  for (const r of x) {
    const o = (r ?? {}) as { akun_id?: unknown; nilai?: unknown };
    const akun = Number(o.akun_id);
    if (!Number.isInteger(akun) || akun <= 0) return { ok: false, error: "Akun tidak valid." };
    if (o.nilai === null || o.nilai === "") { item.push({ akun_id: akun, nilai: null }); continue; }
    const n = Number(o.nilai);
    if (!Number.isInteger(n) || n < 0 || n > 100) return { ok: false, error: "Nilai sikap harus bilangan bulat 0–100." };
    item.push({ akun_id: akun, nilai: n });
  }
  return { ok: true, item };
}
