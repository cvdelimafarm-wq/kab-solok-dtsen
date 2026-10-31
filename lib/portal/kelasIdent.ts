// lib/portal/kelasIdent.ts  (hanya server)
//
// (1 Nov 2026) Membaca kelas pelatihan dari identifikasi lanjutan yang TERTAUT ke kegiatan (keu_ident_kegiatan, dilepas_at null -> keu_ident_lanjutan.isi.kelas).
// Hanya baca. Tahan kosong: tanpa tautan, tabel belum ada, atau isi rusak -> { tersambung: false, kelas: [] } sehingga layar tampil seperti sebelumnya.

import type { Db } from "@/lib/sigap";
import { normalisasiLanjutan } from "@/lib/keu/lanjutan";
import { ringkasKelas, type KelasInfo } from "@/lib/sigapKelasIdent";

export type KelasTertaut = {
  tersambung: boolean;
  ident_id: number | null;
  ident_nama: string | null;
  status_lanjutan: "draf" | "final" | null;
  versi: number | null;
  kelas: KelasInfo[];
};

const KOSONG: KelasTertaut = { tersambung: false, ident_id: null, ident_nama: null, status_lanjutan: null, versi: null, kelas: [] };

export async function muatKelasTertaut(db: Db, kegiatanId: number, jenisPelatihan: boolean): Promise<KelasTertaut> {
  const { data: tautan, error } = await db.from("keu_ident_kegiatan").select("ident_id, ditautkan_at").eq("kegiatan_id", kegiatanId).is("dilepas_at", null).order("ditautkan_at", { ascending: false }).limit(5);
  if (error || !tautan || tautan.length === 0) return KOSONG;
  const identIds = (tautan as { ident_id: number }[]).map((t) => Number(t.ident_id));
  const { data: lanj } = await db.from("keu_ident_lanjutan").select("ident_id, ver, status, isi").in("ident_id", identIds).order("ver", { ascending: false }).limit(50);
  const baris = (lanj ?? []) as { ident_id: number; ver: number; status: string; isi: unknown }[];
  // tautan terbaru yang punya lanjutan; di dalamnya utamakan versi final tertinggi, kalau belum ada pakai draf tertinggi
  for (const id of identIds) {
    const milik = baris.filter((b) => Number(b.ident_id) === id);
    const pilih = milik.find((b) => b.status === "final") ?? milik[0];
    if (!pilih) continue;
    let kelas: KelasInfo[] = [];
    try {
      kelas = ringkasKelas(normalisasiLanjutan(pilih.isi).kelas, jenisPelatihan);
    } catch {
      kelas = [];
    }
    const { data: ident } = await db.from("keu_ident").select("nama").eq("id", id).maybeSingle();
    return {
      tersambung: true,
      ident_id: id,
      ident_nama: ident ? String((ident as { nama: unknown }).nama ?? "") : null,
      status_lanjutan: pilih.status === "final" ? "final" : "draf",
      versi: Number(pilih.ver),
      kelas,
    };
  }
  return { ...KOSONG, tersambung: true, ident_id: identIds[0], status_lanjutan: null };
}
