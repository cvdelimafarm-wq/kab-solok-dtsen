// lib/sigapNilai.ts
//
// (8 Okt 2026) Nilai akhir peserta pelatihan -- bagian database: skema tersimpan, nilai Pretest/Posttest, hasil Kuis Adu Sigap.
// Rumus murni ada di lib/sigapNilaiHitung.ts (dipakai juga di browser).

import type { Db } from "@/lib/sigap";
import { skorResmi, type SesiBaris } from "@/lib/sigapTes";
import { finalisasiBilaKedaluwarsa, muatPengaturanPresensi, muatSoal, muatTesDaftar } from "@/lib/sigapTesDb";
import { kunciSesi } from "@/lib/sigapPresensi";
import { SKEMA_BAWAAN, bulat2, hitungAkhir, lulusAkhirDari, periksaItemSikap, tambahanDari, type HasilAkhir, type ItemSikap, type KuisNilai, type NilaiPeserta, type SkemaNilai } from "@/lib/sigapNilaiHitung";

export const POIN_MAKS_PER_SOAL = 1000;

// ----------------------------------------------------------------------------------------------
// Skema
// ----------------------------------------------------------------------------------------------
const KOLOM_SKEMA_LAMA = "pakai_pretest, pakai_posttest, pakai_kuis, bobot_pretest, bobot_posttest, bobot_kuis, dasar_kuis";
// (31 Okt 2026) + komponen Kedisiplinan/Sikap dan wajib lulus nilai akhir (SQL 20261031m). Bila kolom belum ada, bacaan jatuh ke kolom lama.
const KOLOM_SKEMA_BARU = `${KOLOM_SKEMA_LAMA}, pakai_disiplin, bobot_disiplin, pakai_sikap, bobot_sikap, wajib_lulus_akhir, nilai_lulus_akhir`;

export async function muatSkema(db: Db, kegiatanId: number): Promise<{ skema: SkemaNilai; tersimpan: boolean }> {
  let data: Record<string, unknown> | null = null;
  const baru = await db.from("sigap_pelatihan_nilai_skema").select(KOLOM_SKEMA_BARU).eq("kegiatan_id", kegiatanId).maybeSingle();
  if (!baru.error) data = (baru.data as Record<string, unknown> | null) ?? null;
  else {
    const lama = await db.from("sigap_pelatihan_nilai_skema").select(KOLOM_SKEMA_LAMA).eq("kegiatan_id", kegiatanId).maybeSingle();
    data = (lama.data as Record<string, unknown> | null) ?? null;
  }
  if (!data) return { skema: SKEMA_BAWAAN, tersimpan: false };
  const skema: SkemaNilai = {
    pakai: { pretest: Boolean(data.pakai_pretest), posttest: Boolean(data.pakai_posttest), kuis: Boolean(data.pakai_kuis) },
    bobot: { pretest: Number(data.bobot_pretest), posttest: Number(data.bobot_posttest), kuis: Number(data.bobot_kuis) },
    dasar_kuis: data.dasar_kuis === "poin" ? "poin" : "benar",
  };
  if (data.pakai_disiplin === true || data.pakai_sikap === true) {
    skema.tambahan = { disiplin: { pakai: data.pakai_disiplin === true, bobot: Number(data.bobot_disiplin) || 0 }, sikap: { pakai: data.pakai_sikap === true, bobot: Number(data.bobot_sikap) || 0 } };
  }
  if (data.wajib_lulus_akhir === true) skema.lulus_akhir = { wajib: true, nilai: Number(data.nilai_lulus_akhir) };
  return { tersimpan: true, skema };
}

export const PESAN_SQL_NILAI = "Kolom nilai akhir baru belum ada di database. Jalankan SQL 20261031m_nilai_akhir_berbobot.sql, lalu simpan ulang.";

export async function simpanSkema(db: Db, kegiatanId: number, s: SkemaNilai, akunId: number): Promise<void> {
  const dasar = {
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
  };
  const tam = tambahanDari(s);
  const la = lulusAkhirDari(s);
  const butuhKolomBaru = tam.disiplin.pakai || tam.sikap.pakai || la.wajib;
  const baru = {
    ...dasar,
    pakai_disiplin: tam.disiplin.pakai,
    bobot_disiplin: tam.disiplin.pakai ? tam.disiplin.bobot : 0,
    pakai_sikap: tam.sikap.pakai,
    bobot_sikap: tam.sikap.pakai ? tam.sikap.bobot : 0,
    wajib_lulus_akhir: la.wajib,
    nilai_lulus_akhir: la.nilai,
  };
  const { error } = await db.from("sigap_pelatihan_nilai_skema").upsert(baru, { onConflict: "kegiatan_id" });
  if (!error) return;
  if (/column|schema cache|does not exist/i.test(error.message)) {
    if (butuhKolomBaru) throw new Error(PESAN_SQL_NILAI);
    const { error: e2 } = await db.from("sigap_pelatihan_nilai_skema").upsert(dasar, { onConflict: "kegiatan_id" }); // SQL belum jalan: skema klasik tetap bisa disimpan
    if (e2) throw new Error(e2.message);
    return;
  }
  throw new Error(error.message);
}

// ----------------------------------------------------------------------------------------------
// (31 Okt 2026) Kedisiplinan (otomatis dari presensi) dan Sikap (diisi panitia)
// ----------------------------------------------------------------------------------------------
/** Kedisiplinan = sesi presensi yang dihadiri TEPAT WAKTU / seluruh sesi terjadwal x 100. null bila presensi belum diatur. */
export async function muatDisiplin(db: Db, kegiatanId: number, akunIds: number[]): Promise<Map<number, number | null>> {
  const hasil = new Map<number, number | null>();
  const peng = await muatPengaturanPresensi(db, kegiatanId);
  const total = peng?.jadwal.length ?? 0;
  for (const id of akunIds) hasil.set(id, total > 0 ? 0 : null);
  if (!peng || total === 0 || akunIds.length === 0) return hasil;
  const sah = new Set(peng.jadwal.map((s) => s.kunci));
  const { data } = await db.from("sigap_pelatihan_presensi").select("akun_id, tanggal, sesi_no, diterima, terlambat").eq("kegiatan_id", kegiatanId).in("akun_id", akunIds).limit(20000);
  const tepat = new Map<number, Set<string>>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    if (r.diterima === false || r.terlambat === true) continue;
    const kunci = kunciSesi(String(r.tanggal).slice(0, 10), Number(r.sesi_no ?? 1));
    if (!sah.has(kunci)) continue;
    const a = Number(r.akun_id);
    if (!tepat.has(a)) tepat.set(a, new Set());
    tepat.get(a)!.add(kunci);
  }
  for (const id of akunIds) hasil.set(id, bulat2(Math.min(100, ((tepat.get(id)?.size ?? 0) / total) * 100)));
  return hasil;
}

/** Nilai sikap per akun. `tersedia` = false bila tabelnya belum ada (SQL 20261031m belum dijalankan). */
export async function muatSikap(db: Db, kegiatanId: number): Promise<{ peta: Map<number, number>; tersedia: boolean }> {
  const { data, error } = await db.from("sigap_pelatihan_sikap").select("akun_id, nilai").eq("kegiatan_id", kegiatanId).limit(5000);
  if (error) return { peta: new Map(), tersedia: false };
  return { peta: new Map(((data ?? []) as { akun_id: number; nilai: number }[]).map((r) => [Number(r.akun_id), Number(r.nilai)])), tersedia: true };
}

export { periksaItemSikap, type ItemSikap };

export async function simpanSikap(db: Db, kegiatanId: number, item: ItemSikap[], oleh: number): Promise<void> {
  const isi = item.filter((x) => x.nilai !== null).map((x) => ({ kegiatan_id: kegiatanId, akun_id: x.akun_id, nilai: x.nilai as number, diubah_oleh: oleh, diubah_at: new Date().toISOString() }));
  const hapus = item.filter((x) => x.nilai === null).map((x) => x.akun_id);
  if (isi.length > 0) {
    const { error } = await db.from("sigap_pelatihan_sikap").upsert(isi, { onConflict: "kegiatan_id,akun_id" });
    if (error) throw new Error(/relation|does not exist|schema cache/i.test(error.message) ? PESAN_SQL_NILAI : error.message);
  }
  if (hapus.length > 0) {
    const { error } = await db.from("sigap_pelatihan_sikap").delete().eq("kegiatan_id", kegiatanId).in("akun_id", hapus);
    if (error) throw new Error(error.message);
  }
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
    const { data } = await db.from("sigap_tes_sesi").select("id, tes_id, akun_id, mulai_at, batas_at, selesai_at, jawaban, skor, benar, total, diubah_at, percobaan, skor_terbaik").eq("tes_id", t.id).in("akun_id", akunIds).limit(5000);
    let soal: Awaited<ReturnType<typeof muatSoal>> | null = null;
    for (const s0 of (data ?? []) as SesiBaris[]) {
      let s = s0;
      if (!s.selesai_at && sekarang.getTime() >= new Date(s.batas_at).getTime()) {
        soal = soal ?? (await muatSoal(db, t.id));
        s = await finalisasiBilaKedaluwarsa(db, s, soal, sekarang);
      }
      // (8 Okt 2026) nilai resmi = skor tertinggi dari semua percobaan (percobaan ulang yang belum selesai memakai skor_terbaik sebelumnya)
      const resmi = skorResmi(s);
      if (resmi !== null) {
        const baris = hasil.get(s.akun_id);
        if (baris) baris[t.jenis] = resmi;
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
  const tam = tambahanDari(skema);
  const [disiplin, sikap] = await Promise.all([tam.disiplin.pakai ? muatDisiplin(db, kegiatanId, akunIds) : null, tam.sikap.pakai ? muatSikap(db, kegiatanId) : null]);
  const per = new Map<number, NilaiLengkap>();
  for (const id of akunIds) {
    const n: NilaiPeserta = { pretest: tes.get(id)?.pretest ?? null, posttest: tes.get(id)?.posttest ?? null, kuis: kuis.get(id) ?? null };
    if (disiplin) n.disiplin = disiplin.get(id) ?? null;
    if (sikap) n.sikap = sikap.peta.get(id) ?? null;
    per.set(id, { ...n, ...hitungAkhir(skema, n) });
  }
  return { skema, tersimpan, per };
}
