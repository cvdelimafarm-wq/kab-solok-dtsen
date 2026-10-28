// lib/portal/laporanIsiKonfig.ts  (hanya server)
//
// (28 Okt 2026) Pengaturan "Isi laporan SPJ" per kegiatan (tabel sigap_laporan_isi_konfig, SQL 20261028c). Pembacaan longgar (normalisasiLaporan; tabel belum ada =
// bawaan); penyimpanan ketat (galatLaporan). Pembaca untuk SPJ ada di lib/sigapLaporanData.ts. Aturan isi: lib/sigapLaporanIsi.ts.

import type { Db } from "@/lib/sigap";
import { GalatKonfig } from "@/lib/portal/lembarKonfig";
import { KONFIG_LAPORAN_BAWAAN, galatLaporan, normalisasiLaporan, rapikanLaporan, samaDenganBawaanLaporan, type KonfigLaporan } from "@/lib/sigapLaporanIsi";

export type DataAdminLaporan = {
  /** false = SQL 20261028c belum dijalankan (pengaturan belum bisa disimpan) */
  tabel_ada: boolean;
  kegiatan: { id: number; nama: string; tersimpan: boolean; diubah_oleh: string | null; diubah_at: string | null }[];
  konfig: Record<string, KonfigLaporan>;
};

export async function dataAdminLaporan(db: Db): Promise<DataAdminLaporan> {
  const [{ data: keg, error: e1 }, { data: baris, error: e2 }] = await Promise.all([
    db.from("sigap_kegiatan").select("id, nama").order("id"),
    db.from("sigap_laporan_isi_konfig").select("kegiatan_id, konfig, diubah_oleh, diubah_at"),
  ]);
  if (e1) throw new Error(`Gagal membaca kegiatan: ${e1.message}`);
  const simpan = new Map(((baris ?? []) as { kegiatan_id: number; konfig: unknown; diubah_oleh: string | null; diubah_at: string | null }[]).map((r) => [Number(r.kegiatan_id), r]));
  const konfig: Record<string, KonfigLaporan> = {};
  const kegiatan = ((keg ?? []) as { id: number; nama: string }[]).map((k) => {
    const s = simpan.get(Number(k.id));
    konfig[String(k.id)] = s ? normalisasiLaporan(s.konfig) : KONFIG_LAPORAN_BAWAAN;
    return { id: Number(k.id), nama: String(k.nama ?? `Kegiatan ${k.id}`), tersimpan: !!s, diubah_oleh: s?.diubah_oleh ?? null, diubah_at: s?.diubah_at ?? null };
  });
  return { tabel_ada: !e2, kegiatan, konfig };
}

/** Simpan (ketat). `null` = kembali ke bawaan (baris pengaturan dihapus; bukan data lapangan). */
export async function simpanLaporan(db: Db, kegiatanId: number, mentah: unknown, oleh: string): Promise<{ konfig: KonfigLaporan; bawaan: boolean }> {
  const { data: ada } = await db.from("sigap_kegiatan").select("id").eq("id", kegiatanId).maybeSingle();
  if (!ada) throw new GalatKonfig("Kegiatan tidak ditemukan.", 404);
  const tabelBelum = (m: string) => /sigap_laporan_isi_konfig|schema cache|does not exist/i.test(m);
  if (mentah === null) {
    const { error } = await db.from("sigap_laporan_isi_konfig").delete().eq("kegiatan_id", kegiatanId);
    if (error) {
      if (tabelBelum(error.message)) return { konfig: KONFIG_LAPORAN_BAWAAN, bawaan: true };
      throw new Error(`Gagal mengembalikan ke bawaan: ${error.message}`);
    }
    return { konfig: KONFIG_LAPORAN_BAWAAN, bawaan: true };
  }
  const g = galatLaporan(mentah);
  if (g.length > 0) throw new GalatKonfig(g.slice(0, 6).join(" "));
  const rapi = rapikanLaporan(mentah);
  const { error } = await db.from("sigap_laporan_isi_konfig").upsert({ kegiatan_id: kegiatanId, konfig: rapi, diubah_oleh: oleh, diubah_at: new Date().toISOString() }, { onConflict: "kegiatan_id" });
  if (error) {
    if (tabelBelum(error.message)) throw new GalatKonfig("Tabel pengaturan belum dibuat. Jalankan dulu SQL 20261028c_laporan_isi.sql.", 409);
    throw new Error(`Gagal menyimpan pengaturan: ${error.message}`);
  }
  return { konfig: rapi, bawaan: samaDenganBawaanLaporan(rapi) };
}
