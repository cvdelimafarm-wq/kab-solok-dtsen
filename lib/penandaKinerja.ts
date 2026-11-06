// lib/penandaKinerja.ts
//
// (6 Nov 2026) Satu identitas petugas, tahap 3: red flag dan rekomendasi PML tidak lagi dibaca dari `bencana_petugas`,
// melainkan dari `sigap_penilaian_flag` (per akun per kolom penilaian = per kegiatan, skema-sql/20261106e). Putusan Iqbal:
//  - penanda melekat pada kegiatan dan diakumulasi sebagai riwayat;
//  - red flag tampil di kegiatan mana pun, tetapi HANYA PENANDA: tidak boleh memblokir rekrut atau penugasan kembali.
// Selama modul bencana lama hidup (sampai 20 Nov 2026), perubahannya di sana disalin ke sini (`salinDariRosterLama`).

import type { Db } from "@/lib/sigap";

/** Kolom penilaian tempat penanda lama (manual 3 Okt 2026) dicatat: SE2026. */
export const KOLOM_PENANDA_LAMA = 1;
const KEGIATAN_PSP = 1;

export type Penanda = { red_flag: boolean; rekomendasi_pml: boolean };
export type BarisPenanda = { akun_id: number; red_flag: boolean | null; rekomendasi_pml: boolean | null };

/** Gabungkan penanda lintas kegiatan: seseorang ber-red flag bila di kegiatan mana pun pernah ditandai. */
export function gabungPenanda(baris: BarisPenanda[]): Map<number, Penanda> {
  const hasil = new Map<number, Penanda>();
  for (const b of baris) {
    const sebelum = hasil.get(b.akun_id) ?? { red_flag: false, rekomendasi_pml: false };
    hasil.set(b.akun_id, { red_flag: sebelum.red_flag || b.red_flag === true, rekomendasi_pml: sebelum.rekomendasi_pml || b.rekomendasi_pml === true });
  }
  return hasil;
}

/** Penanda gabungan untuk banyak akun (dipotong 200 id per kueri). */
export async function penandaPerAkun(db: Db, akunIds: number[]): Promise<Map<number, Penanda>> {
  const semua: BarisPenanda[] = [];
  const unik = Array.from(new Set(akunIds));
  for (let i = 0; i < unik.length; i += 200) {
    const { data, error } = await db.from("sigap_penilaian_flag").select("akun_id, red_flag, rekomendasi_pml").in("akun_id", unik.slice(i, i + 200));
    if (error) throw new Error(error.message);
    semua.push(...((data ?? []) as BarisPenanda[]));
  }
  return gabungPenanda(semua);
}

/**
 * Menyalin kondisi terkini satu petugas di daftar lama ke tabel baru: penanda ke `sigap_penilaian_flag` (kolom SE2026)
 * dan konfirmasi pendaftaran ke penugasan PSP. Dipanggil sesudah modul bencana lama mengubah `bencana_petugas`.
 * Tidak ada akun tertaut -> tidak ada yang disalin (bukan galat).
 */
export async function salinDariRosterLama(db: Db, petugasId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: bp, error: e1 } = await db.from("bencana_petugas").select("red_flag_kinerja, rekomendasi_pml, pendaftaran_bencana_konfirmasi").eq("id", petugasId).maybeSingle();
  if (e1) return { ok: false, error: e1.message };
  if (!bp) return { ok: true };
  const { data: akun, error: e2 } = await db.from("sigap_akun").select("id").eq("petugas_bencana_id", petugasId).maybeSingle();
  if (e2) return { ok: false, error: e2.message };
  if (!akun) return { ok: true };
  const akunId = akun.id as number;
  const red = bp.red_flag_kinerja === true;
  const rek = bp.rekomendasi_pml === true;
  if (!red && !rek) {
    const { error } = await db.from("sigap_penilaian_flag").delete().eq("akun_id", akunId).eq("kolom_id", KOLOM_PENANDA_LAMA);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await db
      .from("sigap_penilaian_flag")
      .upsert({ akun_id: akunId, kolom_id: KOLOM_PENANDA_LAMA, red_flag: red, rekomendasi_pml: rek, catatan: "Disalin dari daftar petugas lama.", diubah_at: new Date().toISOString() }, { onConflict: "akun_id,kolom_id" });
    if (error) return { ok: false, error: error.message };
  }
  if (typeof bp.pendaftaran_bencana_konfirmasi === "boolean") {
    const { error } = await db.from("sigap_penugasan").update({ konfirmasi_pendaftaran: bp.pendaftaran_bencana_konfirmasi }).eq("akun_id", akunId).eq("kegiatan_id", KEGIATAN_PSP).eq("aktif", true);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}
