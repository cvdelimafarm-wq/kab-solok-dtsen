// lib/portal/wilayahSampelIdent.ts  (hanya server)
//
// (7 Nov 2026) Daftar nagari sampel untuk "Wilayah tugas" Identifikasi lanjutan. Hanya BACA dan tahan galat:
// tanpa tautan, tanpa kegiatan pendataan, atau alokasi belum diunggah -> daftar kosong (layar kembali ke isian manual).
// (8 Nov 2026, D4) Kegiatan model 2/3 ikut: wilayahnya diturunkan dari daftar objek sampel (sigap_sampel_objek), bukan dari alokasi sub SLS.
// `kegiatanPendataanIdent` dipakai bersama oleh usulan jumlah petugas (lib/portal/usulanSampel.ts).

import type { Db } from "@/lib/sigap";
import { bacaAlokasi, muatKonfigAlokasi } from "@/lib/portal/alokasiWilayah";
import { wilayahObjekRingan } from "@/lib/portal/sampelObjek";
import { WILAYAH_SAMPEL_KOSONG, pilihKegiatanPendataan, ringkasNagari, type DataWilayahSampel, type KegiatanSampel } from "@/lib/wilayahSampelIdent";

/** Kegiatan pendataan sumber wilayah/sampel sebuah identifikasi (tertaut langsung atau satu induk). null = identifikasi belum tertaut ke kegiatan. */
export async function kegiatanPendataanIdent(db: Db, identId: number): Promise<KegiatanSampel[] | null> {
  const { data: taut, error } = await db.from("keu_ident_kegiatan").select("kegiatan_id").eq("ident_id", identId).is("dilepas_at", null);
  if (error || !taut || taut.length === 0) return null;
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
  return pilihKegiatanPendataan(tertaut, ((induk ?? []) as { kegiatan_ids: unknown }[]).map((i) => ({ kegiatan_ids: Array.isArray(i.kegiatan_ids) ? (i.kegiatan_ids as (string | number)[]) : [] })), jenis);
}

export async function muatWilayahSampelIdent(db: Db, identId: number): Promise<DataWilayahSampel> {
  try {
    const sumber = await kegiatanPendataanIdent(db, identId);
    if (!sumber || sumber.length === 0) return { ...WILAYAH_SAMPEL_KOSONG };

    const semua: { kecamatan: string; nagari: string; target: number }[] = [];
    let siap = false;
    let adaObjek = false;
    let adaAlokasi = false;
    for (const s of sumber) {
      const o = await wilayahObjekRingan(db, s.id);
      if (o.ada) {
        siap = true;
        adaObjek = true;
        semua.push(...o.wilayah);
        continue;
      }
      const konfig = await muatKonfigAlokasi(db, s.id);
      const r = await bacaAlokasi(db, s.id, konfig.target_per_sls);
      if (r.siap) siap = true;
      if (r.wilayah.length > 0) adaAlokasi = true;
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
      satuan: adaObjek && adaAlokasi ? "unit" : adaObjek ? "objek" : "sub SLS",
    };
  } catch {
    return { ...WILAYAH_SAMPEL_KOSONG };
  }
}
