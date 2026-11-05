// lib/portal/kelasIdent.ts  (hanya server)
//
// (1 Nov 2026) Membaca identifikasi lanjutan yang TERTAUT ke kegiatan (keu_ident_kegiatan, dilepas_at null -> keu_ident_lanjutan) dan kelas pelatihan di dalamnya.
// Hanya baca. Tahan kosong: tanpa tautan, tabel belum ada, atau isi rusak -> { tersambung: false, ... } sehingga layar tampil seperti sebelumnya.
// `muatLanjutanTertaut` dipakai bersama oleh kelas pelatihan (push 60) dan usulan seleksi (push 61, lib/portal/seleksiTurunan.ts).

import type { Db } from "@/lib/sigap";
import { normalisasiLanjutan, type IsiLanjutan } from "@/lib/keu/lanjutan";
import { ringkasKelas, type KelasInfo } from "@/lib/sigapKelasIdent";

export type LanjutanTertaut = {
  tersambung: boolean;
  ident_id: number | null;
  ident_nama: string | null;
  status_lanjutan: "draf" | "final" | null;
  versi: number | null;
  /** Isi lanjutan yang sudah dinormalkan; null bila belum ada lanjutan atau isinya rusak. */
  isi: IsiLanjutan | null;
};

const KOSONG: LanjutanTertaut = { tersambung: false, ident_id: null, ident_nama: null, status_lanjutan: null, versi: null, isi: null };

export async function muatLanjutanTertaut(db: Db, kegiatanId: number): Promise<LanjutanTertaut> {
  const { data: tautan, error } = await db.from("keu_ident_kegiatan").select("ident_id, ditautkan_at").eq("kegiatan_id", kegiatanId).is("dilepas_at", null).order("ditautkan_at", { ascending: false }).limit(5);
  if (error || !tautan || tautan.length === 0) return KOSONG;
  const identIds = (tautan as { ident_id: number }[]).map((t) => Number(t.ident_id));
  // (5 Nov 2026) Kelas pelatihan mengikuti versi yang DIPAKAI modul hilir (penanda ver_hilir, SQL 20261105a); tanpa penanda atau SQL belum dijalankan = versi terbaru.
  type BarisLj = { ident_id: number; ver: number; status: string; isi: unknown; ver_hilir?: number | null; status_hilir?: string | null; isi_hilir?: unknown };
  const lihat = async (kolom: string) =>
    (await db.from("keu_ident_lanjutan").select(kolom).in("ident_id", identIds).order("ver", { ascending: false }).limit(50)) as unknown as { data: BarisLj[] | null; error: unknown };
  let hasil = await lihat("ident_id, ver, status, isi, ver_hilir, status_hilir, isi_hilir");
  if (hasil.error) hasil = await lihat("ident_id, ver, status, isi");
  const baris = (hasil.data ?? []).map((b) => (b.ver_hilir != null && b.isi_hilir != null ? { ...b, ver: b.ver_hilir, status: b.status_hilir ?? b.status, isi: b.isi_hilir } : b));
  // tautan terbaru yang punya lanjutan; di dalamnya utamakan versi final tertinggi, kalau belum ada pakai draf tertinggi
  for (const id of identIds) {
    const milik = baris.filter((b) => Number(b.ident_id) === id);
    const pilih = milik.find((b) => b.status === "final") ?? milik[0];
    if (!pilih) continue;
    let isi: IsiLanjutan | null = null;
    try {
      isi = normalisasiLanjutan(pilih.isi);
    } catch {
      isi = null;
    }
    const { data: ident } = await db.from("keu_ident").select("nama").eq("id", id).maybeSingle();
    return {
      tersambung: true,
      ident_id: id,
      ident_nama: ident ? String((ident as { nama: unknown }).nama ?? "") : null,
      status_lanjutan: pilih.status === "final" ? "final" : "draf",
      versi: Number(pilih.ver),
      isi,
    };
  }
  return { ...KOSONG, tersambung: true, ident_id: identIds[0] };
}

export type KelasTertaut = Omit<LanjutanTertaut, "isi"> & { kelas: KelasInfo[] };

export async function muatKelasTertaut(db: Db, kegiatanId: number, jenisPelatihan: boolean): Promise<KelasTertaut> {
  const { isi, ...sisa } = await muatLanjutanTertaut(db, kegiatanId);
  return { ...sisa, kelas: isi ? ringkasKelas(isi.kelas, jenisPelatihan) : [] };
}
