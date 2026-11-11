// lib/portal/sampelAlokasi.ts  (hanya server)
//
// (11 Nov 2026) Ringkasan modul "Sampel per SLS" untuk kegiatan model 1 yang sampelnya berasal dari alokasi sub SLS + TAG (unggah Excel pembagian atau tanda di HP),
// bukan dari tabel sigap_sampel lama. Dipakai Beranda/bar bawah agar tab Sampel muncul bagi PPL (sub SLS-nya) dan PML (semua PPL bawahannya).
// null = akun tidak punya wilayah atau belum ada tag (tab tidak tampil). Gagal membaca = null (Beranda tetap jalan).

import type { Db } from "@/lib/sigap";
import type { AkunPortal } from "@/lib/portal/server";
import type { InfoSampel } from "@/lib/sampelSls";

type Wil = { idsubsls: string; ppl_akun_id: number | null; pml_akun_id: number | null };

export async function ringkasModulAlokasi(db: Db, akun: AkunPortal, kegiatanId: number): Promise<InfoSampel | null> {
  try {
    const { data, error } = await db
      .from("sigap_alokasi_wilayah")
      .select("idsubsls, ppl_akun_id, pml_akun_id")
      .eq("kegiatan_id", kegiatanId)
      .is("nonaktif_at", null)
      .or(`ppl_akun_id.eq.${akun.id},pml_akun_id.eq.${akun.id}`)
      .limit(5000);
    if (error) return null;
    const wil = (data ?? []) as Wil[];
    if (wil.length === 0) return null;
    const peran: "ppl" | "pml" = wil.some((w) => w.ppl_akun_id === akun.id) ? "ppl" : "pml";
    const milik = wil.filter((w) => (peran === "ppl" ? w.ppl_akun_id === akun.id : w.pml_akun_id === akun.id));
    const subs = Array.from(new Set(milik.map((w) => w.idsubsls)));
    if (subs.length === 0) return null;
    const { data: tg, error: e2 } = await db
      .from("sigap_sampel_tag")
      .select("peran")
      .eq("kegiatan_id", kegiatanId)
      .in("idsubsls", subs)
      .is("dilepas_at", null)
      .limit(20000);
    if (e2) return null;
    const tag = (tg ?? []) as { peran: string }[];
    const utama = tag.filter((t) => t.peran === "utama").length;
    const cadangan = tag.filter((t) => t.peran === "cadangan").length;
    if (utama + cadangan === 0) return null;
    const ppl = new Set(milik.map((w) => w.ppl_akun_id).filter((x): x is number => x != null)).size;
    return { kegiatan_id: kegiatanId, peran, sls: subs.length, utama, cadangan, diganti: 0, ppl };
  } catch {
    return null;
  }
}
