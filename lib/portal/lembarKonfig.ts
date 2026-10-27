// lib/portal/lembarKonfig.ts  (hanya server)
//
// (27 Okt 2026) Pengaturan Lembar Pendataan per kegiatan (tabel sigap_lembar_konfig). Pembacaan memakai normalisasiKonfig (longgar: tidak pernah gagal,
// kegiatan tanpa baris = KONFIG_BAWAAN). Penyimpanan memakai galatKonfig (ketat). Lihat lib/lembarKonfig.ts untuk aturan.

import type { Db } from "@/lib/sigap";
import { KEGIATAN_PENDATAAN_BAWAAN } from "@/lib/portal/pendataan";
import { KONFIG_BAWAAN, galatKonfig, normalisasiKonfig, rapikanKonfig, samaDenganBawaan, type KonfigLembar } from "@/lib/lembarKonfig";

export class GalatKonfig extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Pengaturan satu kegiatan (bawaan bila belum disimpan atau tabel belum ada). */
export async function konfigKegiatan(db: Db, kegiatanId: number): Promise<KonfigLembar> {
  const { data, error } = await db.from("sigap_lembar_konfig").select("konfig").eq("kegiatan_id", kegiatanId).maybeSingle();
  if (error || !data) return KONFIG_BAWAAN; // tabel belum dibuat / belum ada pengaturan: Lembar tetap berjalan seperti biasa
  return normalisasiKonfig((data as { konfig: unknown }).konfig);
}

/** Kegiatan milik Sub SLS (mengikuti KK-nya; bawaan kegiatan 1). */
export async function kegiatanSub(db: Db, idsubsls: string): Promise<number> {
  const { data } = await db.from("bencana_pendataan_kk").select("kegiatan_id").eq("idsubsls", idsubsls).limit(1).maybeSingle();
  return Number((data as { kegiatan_id?: unknown } | null)?.kegiatan_id ?? KEGIATAN_PENDATAAN_BAWAAN);
}

export type DataAdminKonfig = {
  kegiatan: { id: number; nama: string; punya_kk: boolean; tersimpan: boolean; diubah_oleh: string | null; diubah_at: string | null }[];
  konfig: Record<string, KonfigLembar>;
};

export async function dataAdminKonfig(db: Db): Promise<DataAdminKonfig> {
  const [{ data: keg, error: e1 }, { data: baris }, { data: kk }] = await Promise.all([
    db.from("sigap_kegiatan").select("id, nama").order("id"),
    db.from("sigap_lembar_konfig").select("kegiatan_id, konfig, diubah_oleh, diubah_at"),
    db.from("bencana_pendataan_kk").select("kegiatan_id").eq("aktif", true).limit(1000),
  ]);
  if (e1) throw new Error(`Gagal membaca kegiatan: ${e1.message}`);
  const adaKk = new Set(((kk ?? []) as { kegiatan_id: number }[]).map((r) => Number(r.kegiatan_id)));
  adaKk.add(KEGIATAN_PENDATAAN_BAWAAN);
  const simpan = new Map(((baris ?? []) as { kegiatan_id: number; konfig: unknown; diubah_oleh: string | null; diubah_at: string | null }[]).map((r) => [Number(r.kegiatan_id), r]));
  const konfig: Record<string, KonfigLembar> = {};
  const kegiatan = ((keg ?? []) as { id: number; nama: string }[]).map((k) => {
    const s = simpan.get(Number(k.id));
    konfig[String(k.id)] = s ? normalisasiKonfig(s.konfig) : KONFIG_BAWAAN;
    return { id: Number(k.id), nama: String(k.nama ?? `Kegiatan ${k.id}`), punya_kk: adaKk.has(Number(k.id)), tersimpan: !!s, diubah_oleh: s?.diubah_oleh ?? null, diubah_at: s?.diubah_at ?? null };
  });
  return { kegiatan, konfig };
}

/** Simpan (ketat). `null` = kembalikan ke tampilan bawaan (baris dihapus: pengaturan, bukan data lapangan). */
export async function simpanKonfig(db: Db, kegiatanId: number, mentah: unknown, oleh: string): Promise<{ konfig: KonfigLembar; bawaan: boolean }> {
  const { data: ada } = await db.from("sigap_kegiatan").select("id").eq("id", kegiatanId).maybeSingle();
  if (!ada) throw new GalatKonfig("Kegiatan tidak ditemukan.", 404);
  if (mentah === null) {
    const { error } = await db.from("sigap_lembar_konfig").delete().eq("kegiatan_id", kegiatanId);
    if (error) throw new Error(`Gagal mengembalikan ke bawaan: ${error.message}`);
    return { konfig: KONFIG_BAWAAN, bawaan: true };
  }
  const g = galatKonfig(mentah);
  if (g.length > 0) throw new GalatKonfig(g.slice(0, 6).join(" "));
  const rapi = rapikanKonfig(mentah);
  const { error } = await db.from("sigap_lembar_konfig").upsert({ kegiatan_id: kegiatanId, konfig: rapi, diubah_oleh: oleh, diubah_at: new Date().toISOString() }, { onConflict: "kegiatan_id" });
  if (error) throw new Error(`Gagal menyimpan pengaturan: ${error.message}`);
  return { konfig: rapi, bawaan: samaDenganBawaan(rapi) };
}
