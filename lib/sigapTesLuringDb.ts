// lib/sigapTesLuringDb.ts
//
// (14 Nov 2026, luring 3b) Sisi server paket soal luring: sandi A per tes (dibuat sekali, disimpan di sigap_tes.luring_sandi) dan paket tersandi.
// Kunci jawaban TIDAK pernah masuk paket. Kolom belum ada (SQL 20261114e belum dijalankan) = fitur luring mati, tanpa galat bagi peserta.

import type { Db } from "@/lib/sigap";
import type { SoalLengkap, TesBaris } from "@/lib/sigapTes";
import { buatSandi, sandikan, versiSoal, type IsiPaketSoal, type PaketTes } from "@/lib/sigapTesLuring";

/** Sandi A tes ini; dibuat bila belum ada. null = kolom belum tersedia. */
export async function sandiTes(db: Db, tesId: number): Promise<string | null> {
  const { data, error } = await db.from("sigap_tes").select("luring_sandi").eq("id", tesId).maybeSingle();
  if (error) return null;
  const ada = (data as { luring_sandi: string | null } | null)?.luring_sandi;
  if (ada) return ada;
  const baru = buatSandi();
  // hanya isi bila masih kosong (dua permintaan bersamaan tidak saling menimpa)
  await db.from("sigap_tes").update({ luring_sandi: baru, luring_sandi_at: new Date().toISOString() }).eq("id", tesId).is("luring_sandi", null);
  const { data: lagi } = await db.from("sigap_tes").select("luring_sandi").eq("id", tesId).maybeSingle();
  return (lagi as { luring_sandi: string | null } | null)?.luring_sandi ?? null;
}

/** Paket soal tersandi (tanpa kunci). `tesJadwal` = jadwal tes asli; `dimulaiInstruktur` = tes memakai agenda hari H. */
export async function susunPaketTes(db: Db, tesJadwal: TesBaris, soal: SoalLengkap[], dimulaiInstruktur: boolean): Promise<PaketTes | null> {
  const sandi = await sandiTes(db, tesJadwal.id);
  if (!sandi || soal.length === 0) return null;
  const isiSoal: IsiPaketSoal["soal"] = soal.map((s) => ({ nomor: s.nomor, teks: s.teks, opsi: s.opsi.map((o) => ({ kode: o.kode, teks: o.teks })) }));
  const versi = await versiSoal(isiSoal);
  const isi: IsiPaketSoal = { tes_id: tesJadwal.id, versi, soal: isiSoal };
  return {
    v: 1,
    tes_id: tesJadwal.id,
    kegiatan_id: tesJadwal.kegiatan_id,
    jenis: tesJadwal.jenis,
    judul: tesJadwal.judul,
    durasi_menit: tesJadwal.durasi_menit,
    buka_at: tesJadwal.buka_at,
    tutup_at: tesJadwal.tutup_at,
    dimulai_instruktur: dimulaiInstruktur,
    jumlah_soal: isiSoal.length,
    versi,
    diunduh_at: new Date().toISOString(),
    tersandi: await sandikan(isi, sandi),
  };
}

/** (luring 3b-1) Catat versi paket yang kini dipegang HP peserta. Gagal (tabel belum ada) = diam. */
export async function catatPaketDipegang(db: Db, tesId: number, akunId: number, versi: string): Promise<void> {
  await db.from("sigap_tes_paket_unduh").upsert({ tes_id: tesId, akun_id: akunId, versi, at: new Date().toISOString() }, { onConflict: "tes_id,akun_id" });
}

export type SiapLuring = { siap: number; total: number; belum: string[] };

/**
 * (luring 3b-1) Kesiapan tanpa sinyal per kelas: peserta aktif kelas itu yang HP-nya memegang paket VERSI TERBARU.
 * `versi` = versi soal saat ini (versiSoal). Mengembalikan null bila tabel catatan belum tersedia.
 */
export async function siapLuringKelas(db: Db, kegiatanId: number, tesId: number, kelas: number, versi: string, filterBukanAdministrasi: string): Promise<SiapLuring | null> {
  const { data: pen } = await db.from("sigap_penugasan").select("akun_id").eq("kegiatan_id", kegiatanId).eq("kelas", kelas).eq("aktif", true).or(filterBukanAdministrasi).limit(2000);
  const akunIds = [...new Set(((pen ?? []) as { akun_id: number }[]).map((p) => Number(p.akun_id)))];
  if (akunIds.length === 0) return { siap: 0, total: 0, belum: [] };
  const { data: unduh, error } = await db.from("sigap_tes_paket_unduh").select("akun_id, versi").eq("tes_id", tesId).in("akun_id", akunIds);
  if (error) return null;
  const pegang = new Set(((unduh ?? []) as { akun_id: number; versi: string }[]).filter((u) => u.versi === versi).map((u) => Number(u.akun_id)));
  const belumIds = akunIds.filter((id) => !pegang.has(id));
  let belum: string[] = [];
  if (belumIds.length) {
    const { data: akun } = await db.from("sigap_akun").select("id, nama").in("id", belumIds);
    belum = ((akun ?? []) as { id: number; nama: string | null }[]).map((a) => a.nama ?? `Akun ${a.id}`).sort((a, b) => a.localeCompare(b, "id"));
  }
  return { siap: akunIds.length - belumIds.length, total: akunIds.length, belum };
}
