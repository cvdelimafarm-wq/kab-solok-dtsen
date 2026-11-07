// lib/portal/wilayahSampelIdent.ts  (hanya server)
//
// (7 Nov 2026) Daftar nagari sampel untuk "Wilayah tugas" Identifikasi lanjutan. Hanya BACA dan tahan galat:
// tanpa tautan, tanpa kegiatan pendataan, atau alokasi belum diunggah -> daftar kosong (layar kembali ke isian manual).

import type { Db } from "@/lib/sigap";
import { bacaAlokasi, muatKonfigAlokasi } from "@/lib/portal/alokasiWilayah";
import { WILAYAH_SAMPEL_KOSONG, pilihKegiatanPendataan, ringkasNagari, type DataWilayahSampel } from "@/lib/wilayahSampelIdent";

export async function muatWilayahSampelIdent(db: Db, identId: number): Promise<DataWilayahSampel> {
  try {
    const { data: taut, error } = await db.from("keu_ident_kegiatan").select("kegiatan_id").eq("ident_id", identId).is("dilepas_at", null);
    if (error || !taut || taut.length === 0) return { ...WILAYAH_SAMPEL_KOSONG };
    const tertaut = (taut as { kegiatan_id: unknown }[]).map((t) => Number(t.kegiatan_id)).filter((n) => Number.isInteger(n) && n > 0);

    const { data: induk } = await db.from("sigap_induk").select("kegiatan_ids").eq("aktif", true);
    const calonIds = new Set<number>(tertaut);
    for (const i of (induk ?? []) as { kegiatan_ids: unknown }[]) {
      const ids = Array.isArray(i.kegiatan_ids) ? (i.kegiatan_ids as unknown[]).map(Number) : [];
      if (ids.some((x) => tertaut.includes(x))) ids.forEach((x) => Number.isInteger(x) && calonIds.add(x));
    }
    const { data: keg } = await db.from("sigap_kegiatan").select("id, nama, jenis").in("id", [...calonIds]);
    const jenis = new Map<number, { jenis: string; nama: string }>();
    for (const k of (keg ?? []) as { id: unknown; nama: unknown; jenis: unknown }[]) jenis.set(Number(k.id), { jenis: String(k.jenis ?? ""), nama: String(k.nama ?? "") });
    const sumber = pilihKegiatanPendataan(tertaut, ((induk ?? []) as { kegiatan_ids: unknown }[]).map((i) => ({ kegiatan_ids: Array.isArray(i.kegiatan_ids) ? (i.kegiatan_ids as (string | number)[]) : [] })), jenis);
    if (sumber.length === 0) return { ...WILAYAH_SAMPEL_KOSONG };

    const semua = [];
    let siap = false;
    for (const s of sumber) {
      const konfig = await muatKonfigAlokasi(db, s.id);
      const r = await bacaAlokasi(db, s.id, konfig.target_per_sls);
      if (r.siap) siap = true;
      semua.push(...r.wilayah);
    }
    const { nagari, tanpa_master } = ringkasNagari(semua);
    return {
      tertaut: true,
      siap,
      kegiatan: sumber,
      nagari,
      total_sub_sls: semua.length,
      total_target: semua.reduce((n, w) => n + w.target, 0),
      tanpa_master,
    };
  } catch {
    return { ...WILAYAH_SAMPEL_KOSONG };
  }
}
