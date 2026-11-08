// lib/portal/usulanSampel.ts  (hanya server)
//
// (8 Nov 2026, D4) Sumber usulan jumlah petugas untuk identifikasi lanjutan: sampel pada kegiatan PENDATAAN yang tertaut ke identifikasi (langsung atau satu induk, sama dengan
// wilayah tugas: kegiatanPendataanIdent). Model 1 = sigap_alokasi_wilayah (target kosong memakai target per SLS dari setelan alokasi), model 2/3 = sigap_sampel_objek.
// Hanya baca. Tahan kosong: tanpa tautan, tabel belum ada, atau galat -> SUMBER_KOSONG.

import type { Db } from "@/lib/sigap";
import { SUMBER_KOSONG, type SumberSampel } from "@/lib/keu/usulanSampel";
import { kegiatanPendataanIdent } from "@/lib/portal/wilayahSampelIdent";
import { objekRingan } from "@/lib/portal/sampelObjek";
import { bacaAlokasi, muatKonfigAlokasi } from "@/lib/portal/alokasiWilayah";

export async function sumberSampelIdent(db: Db, identId: number): Promise<SumberSampel> {
  try {
    const sumber = await kegiatanPendataanIdent(db, identId);
    if (sumber === null) return SUMBER_KOSONG;
    const dasar: SumberSampel = { ...SUMBER_KOSONG, tersambung: true, kegiatan_id: sumber[0]?.id ?? null, kegiatan_nama: sumber.map((k) => k.nama).join(", ") || null };
    const ppl = new Set<number>();
    const pml = new Set<number>();
    let unit = 0;
    let sampel = 0;
    let model: 1 | 2 | 3 | null = null;
    let satuan: SumberSampel["satuan"] = "sub SLS";
    let adaObjek = false;
    let adaAlokasi = false;
    for (const s of sumber) {
      const o = await objekRingan(db, s.id);
      if (o.profil && o.baris.length > 0) {
        adaObjek = true;
        model = model ?? (o.profil.model as 2 | 3);
        unit += o.baris.length;
        sampel += o.baris.reduce((n, b) => n + b.jumlah, 0);
        for (const b of o.baris) {
          if (b.ppl_akun_id != null) ppl.add(b.ppl_akun_id);
          if (b.pml_akun_id != null) pml.add(b.pml_akun_id);
        }
        continue;
      }
      const konfig = await muatKonfigAlokasi(db, s.id);
      const r = await bacaAlokasi(db, s.id, konfig.target_per_sls);
      if (r.wilayah.length === 0) continue;
      adaAlokasi = true;
      model = model ?? 1;
      unit += r.wilayah.length;
      sampel += r.wilayah.reduce((n, w) => n + (Number.isFinite(w.target) ? Math.max(0, Math.floor(w.target)) : 0), 0);
      for (const w of r.wilayah) {
        if (w.ppl_akun_id != null) ppl.add(w.ppl_akun_id);
        if (w.pml_akun_id != null) pml.add(w.pml_akun_id);
      }
    }
    if (adaObjek && !adaAlokasi) satuan = "objek";
    else if (adaObjek && adaAlokasi) satuan = "sub SLS"; // campuran: dihitung per unit; teks ringkas menyebut model pertama
    return { ...dasar, model, satuan, unit, sampel, plot_ppl: ppl.size, plot_pml: pml.size };
  } catch {
    return SUMBER_KOSONG;
  }
}
