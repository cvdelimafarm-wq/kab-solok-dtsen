// lib/sigapNilai.ts
//
// (8 Okt 2026) Nilai akhir peserta pelatihan -- bagian database: skema tersimpan, nilai Pretest/Posttest, hasil Kuis Adu Sigap.
// Rumus murni ada di lib/sigapNilaiHitung.ts (dipakai juga di browser).

import type { Db } from "@/lib/sigap";
import type { SesiBaris } from "@/lib/sigapTes";
import { finalisasiBilaKedaluwarsa, muatSoal, muatTesDaftar } from "@/lib/sigapTesDb";
import { SKEMA_BAWAAN, bulat2, hitungAkhir, type HasilAkhir, type KuisNilai, type NilaiPeserta, type SkemaNilai } from "@/lib/sigapNilaiHitung";

export const POIN_MAKS_PER_SOAL = 1000;

// ----------------------------------------------------------------------------------------------
// Skema
// ----------------------------------------------------------------------------------------------
export async function muatSkema(db: Db, kegiatanId: number): Promise<{ skema: SkemaNilai; tersimpan: boolean }> {
  const { data } = await db.from("sigap_pelatihan_nilai_skema").select("pakai_pretest, pakai_posttest, pakai_kuis, bobot_pretest, bobot_posttest, bobot_kuis, dasar_kuis").eq("kegiatan_id", kegiatanId).maybeSingle();
  if (!data) return { skema: SKEMA_BAWAAN, tersimpan: false };
  return {
    tersimpan: true,
    skema: {
      pakai: { pretest: Boolean(data.pakai_pretest), posttest: Boolean(data.pakai_posttest), kuis: Boolean(data.pakai_kuis) },
      bobot: { pretest: Number(data.bobot_pretest), posttest: Number(data.bobot_posttest), kuis: Number(data.bobot_kuis) },
      dasar_kuis: data.dasar_kuis === "poin" ? "poin" : "benar",
    },
  };
}

export async function simpanSkema(db: Db, kegiatanId: number, s: SkemaNilai, akunId: number): Promise<void> {
  const { error } = await db.from("sigap_pelatihan_nilai_skema").upsert(
    {
      kegiatan_id: kegiatanId,
      pakai_pretest: s.pakai.pretest,
      pakai_posttest: s.pakai.posttest,
      pakai_kuis: s.pakai.kuis,
      bobot_pretest: s.bobot.pretest,
      bobot_posttest: s.bobot.posttest,
      bobot_kuis: s.bobot.kuis,
      dasar_kuis: s.dasar_kuis,
      diubah_at: new Date().toISOString(),
      diubah_oleh: akunId,
    },
    { onConflict: "kegiatan_id" },
  );
  if (error) throw new Error(error.message);
}

// ----------------------------------------------------------------------------------------------
// Kuis Adu Sigap: nilai per peserta (ruang SELESAI terakhir yang dijawab peserta)
// ----------------------------------------------------------------------------------------------
export async function muatKuisNilai(db: Db, kegiatanId: number): Promise<Map<number, KuisNilai>> {
  const hasil = new Map<number, KuisNilai>();
  const { data: ruang } = await db.from("sigap_kuis_ruang").select("id, kuis_id, kelas, soal_main").eq("kegiatan_id", kegiatanId).eq("status", "selesai").order("id", { ascending: true }).limit(100);
  const jumlahSoalKuis = new Map<number, number>();
  for (const r of ruang ?? []) {
    let total = Array.isArray(r.soal_main) ? (r.soal_main as unknown[]).length : 0;
    if (total === 0) {
      const kid = Number(r.kuis_id);
      if (!jumlahSoalKuis.has(kid)) {
        const { count } = await db.from("sigap_kuis_soal").select("nomor", { count: "exact", head: true }).eq("kuis_id", kid);
        jumlahSoalKuis.set(kid, count ?? 0);
      }
      total = jumlahSoalKuis.get(kid) ?? 0;
    }
    if (total === 0) continue;
    const { data: papan } = await db.rpc("sigap_kuis_papan", { p_ruang: Number(r.id) });
    for (const x of (papan ?? []) as Record<string, unknown>[]) {
      const akun = Number(x.akun_id);
      const menjawab = Number(x.menjawab);
      if (menjawab === 0 && hasil.has(akun)) continue; // jangan timpa ruang yang pernah dijawab dengan ruang kosong
      const poin = Number(x.poin);
      const benar = Number(x.benar);
      hasil.set(akun, {
        ruang_id: Number(r.id),
        kelas: Number(r.kelas),
        poin,
        benar,
        menjawab,
        total_soal: total,
        benar_pct: bulat2(Math.min(100, (benar / total) * 100)),
        poin_pct: bulat2(Math.min(100, (poin / (total * POIN_MAKS_PER_SOAL)) * 100)),
      });
    }
  }
  return hasil;
}

// ----------------------------------------------------------------------------------------------
// Pretest & Posttest: skor sesi selesai (sesi kedaluwarsa difinalkan dulu, sama seperti Monitoring)
// ----------------------------------------------------------------------------------------------
export async function muatTesNilai(db: Db, kegiatanId: number, akunIds: number[], sekarang = new Date()): Promise<Map<number, { pretest: number | null; posttest: number | null }>> {
  const hasil = new Map<number, { pretest: number | null; posttest: number | null }>();
  for (const id of akunIds) hasil.set(id, { pretest: null, posttest: null });
  if (akunIds.length === 0) return hasil;
  const daftar = await muatTesDaftar(db, kegiatanId);
  for (const t of daftar) {
    if (t.jenis !== "pretest" && t.jenis !== "posttest") continue;
    const { data } = await db.from("sigap_tes_sesi").select("id, tes_id, akun_id, mulai_at, batas_at, selesai_at, jawaban, skor, benar, total, diubah_at").eq("tes_id", t.id).in("akun_id", akunIds).limit(5000);
    let soal: Awaited<ReturnType<typeof muatSoal>> | null = null;
    for (const s0 of (data ?? []) as SesiBaris[]) {
      let s = s0;
      if (!s.selesai_at && sekarang.getTime() >= new Date(s.batas_at).getTime()) {
        soal = soal ?? (await muatSoal(db, t.id));
        s = await finalisasiBilaKedaluwarsa(db, s, soal, sekarang);
      }
      if (s.selesai_at && s.skor !== null && s.skor !== undefined) {
        const baris = hasil.get(s.akun_id);
        if (baris) baris[t.jenis] = Number(s.skor);
      }
    }
  }
  return hasil;
}

// ----------------------------------------------------------------------------------------------
// Gabungan: nilai lengkap per akun
// ----------------------------------------------------------------------------------------------
export type NilaiLengkap = NilaiPeserta & HasilAkhir;

export async function muatNilaiAkhir(db: Db, kegiatanId: number, akunIds: number[]): Promise<{ skema: SkemaNilai; tersimpan: boolean; per: Map<number, NilaiLengkap> }> {
  const [{ skema, tersimpan }, tes, kuis] = await Promise.all([muatSkema(db, kegiatanId), muatTesNilai(db, kegiatanId, akunIds), muatKuisNilai(db, kegiatanId)]);
  const per = new Map<number, NilaiLengkap>();
  for (const id of akunIds) {
    const n: NilaiPeserta = { pretest: tes.get(id)?.pretest ?? null, posttest: tes.get(id)?.posttest ?? null, kuis: kuis.get(id) ?? null };
    per.set(id, { ...n, ...hitungAkhir(skema, n) });
  }
  return { skema, tersimpan, per };
}
