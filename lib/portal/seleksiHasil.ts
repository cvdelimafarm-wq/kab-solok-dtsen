// lib/portal/seleksiHasil.ts  (hanya server)
//
// (1 Nov 2026) Hasil seleksi untuk satu identifikasi: seleksi pada kegiatan yang tertaut (keu_ident_kegiatan, dilepas_at null), ringkasan peserta, dan penugasan bersumber seleksi.
// Hanya baca. Aturan: lib/seleksiHasil.ts.

import type { Db } from "@/lib/sigap";
import { hitungPenugasanSeleksi, ringkasSeleksi, type BarisPeserta, type BarisSeleksi, type RingkasSeleksi } from "@/lib/seleksiHasil";

export type HasilSeleksiIdent = {
  tersambung: boolean;
  kegiatan: { id: number; nama: string }[];
  seleksi: (RingkasSeleksi & { kegiatan_id: number })[];
  ditugaskan: { ppl: number; pml: number };
};

/** Kegiatan yang tertaut aktif ke identifikasi; kosong bila tidak ada/tabel belum ada. */
export async function kegiatanTertaut(db: Db, identId: number): Promise<{ id: number; nama: string }[]> {
  const { data, error } = await db.from("keu_ident_kegiatan").select("kegiatan_id").eq("ident_id", identId).is("dilepas_at", null);
  if (error || !data || data.length === 0) return [];
  const ids = Array.from(new Set((data as { kegiatan_id: number }[]).map((r) => Number(r.kegiatan_id))));
  const { data: kg } = await db.from("sigap_kegiatan").select("id, nama").in("id", ids);
  return ((kg ?? []) as { id: number; nama: string }[]).map((k) => ({ id: Number(k.id), nama: String(k.nama) }));
}

/** `izinkan(kegiatanId)` menyaring kegiatan yang boleh dilihat pemanggil. */
export async function hasilSeleksiIdent(db: Db, identId: number, izinkan: (kegiatanId: number) => boolean): Promise<HasilSeleksiIdent> {
  const semua = await kegiatanTertaut(db, identId);
  if (semua.length === 0) return { tersambung: false, kegiatan: [], seleksi: [], ditugaskan: { ppl: 0, pml: 0 } };
  const kegiatan = semua.filter((k) => izinkan(k.id));
  if (kegiatan.length === 0) return { tersambung: true, kegiatan: [], seleksi: [], ditugaskan: { ppl: 0, pml: 0 } };
  const ids = kegiatan.map((k) => k.id);

  const { data: sel } = await db.from("sigap_seleksi").select("id, kegiatan_id, nama, jalur, status, kebutuhan_ppl, kebutuhan_pml, sudah_ppl, sudah_pml").in("kegiatan_id", ids).neq("status", "batal").order("id");
  const barisSel = ((sel ?? []) as (BarisSeleksi & { kegiatan_id: number })[]).map((s) => ({ ...s, id: Number(s.id), kegiatan_id: Number(s.kegiatan_id) }));
  const selIds = barisSel.map((s) => s.id);
  const { data: ps } = selIds.length > 0 ? await db.from("sigap_seleksi_peserta").select("seleksi_id, peran, status, hasil, konfirmasi, ditugaskan_at").in("seleksi_id", selIds).limit(20000) : { data: [] as BarisPeserta[] };
  const ringkas = ringkasSeleksi(barisSel, ((ps ?? []) as BarisPeserta[]).map((p) => ({ ...p, seleksi_id: Number(p.seleksi_id) })));
  const kegDari = new Map(barisSel.map((s) => [s.id, s.kegiatan_id]));

  const { data: pen } = await db.from("sigap_penugasan").select("peran, sumber").in("kegiatan_id", ids).eq("aktif", true).like("sumber", "seleksi_%").limit(20000);
  const ditugaskan = hitungPenugasanSeleksi((pen ?? []) as { peran: string; sumber: string | null }[]);

  return { tersambung: true, kegiatan, seleksi: ringkas.map((r) => ({ ...r, kegiatan_id: kegDari.get(r.id) ?? 0 })), ditugaskan };
}
