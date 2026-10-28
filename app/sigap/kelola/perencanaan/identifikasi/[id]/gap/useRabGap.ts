"use client";

// app/sigap/kelola/perencanaan/identifikasi/[id]/gap/useRabGap.ts
//
// (28 Okt 2026) Bahan RAB per survei untuk Gap: RAB aktif RO ini, baris RAB bertanda identifikasi ini, dan status keu_rab_survei. Hanya membaca. Galat apa pun
// (mis. akun tanpa hak baca RAB) diabaikan: Gap lalu berjalan seperti semula dengan kebutuhan biaya dari identifikasi.

import { useMemo } from "react";
import { susunRabSurveiGap, type RabSurveiGap } from "@/lib/keu/gapRab";
import type { BarisRabRow } from "@/lib/keu/rab";
import type { BarisStatusSurvei } from "@/lib/keu/rabStatus";
import { pilihRab, urlBaca, type BarisRabRingkas } from "@/lib/keu/ro";
import { useBacaKeu } from "@/app/sigap/ro/useKeu";

type ItemAkun = { id: number; akun_kode: string };

export function useRabGap(roKode: string | null, identId: number | null, identVer: number | null): { rabSurvei: RabSurveiGap | null; memuat: boolean } {
  const ringkas = useBacaKeu<BarisRabRingkas>(roKode ? urlBaca("keu_v_rab_ringkas", { ro_kode: roKode }, { batas: 200 }) : null);
  const rabId = useMemo(() => (ringkas.baris && roKode ? pilihRab(ringkas.baris, roKode)?.rab_id ?? null : null), [ringkas.baris, roKode]);
  const item = useBacaKeu<ItemAkun>(rabId ? urlBaca("keu_rab_item", { rab_id: rabId }, { batas: 5000, kolom: ["id", "akun_kode"] }) : null);
  const baris = useBacaKeu<BarisRabRow>(rabId && identId ? urlBaca("keu_v_rab_baris", { rab_id: rabId, ident_id: identId }, { batas: 5000 }) : null);
  const status = useBacaKeu<BarisStatusSurvei>(rabId && identId ? urlBaca("keu_rab_survei", { rab_id: rabId, ident_id: identId }, { batas: 5, kolom: ["rab_id", "ident_id", "status"] }) : null);
  const rabSurvei = useMemo(() => {
    if (!rabId || identId === null || identVer === null || !item.baris || !baris.baris) return null;
    return susunRabSurveiGap(true, baris.baris, item.baris, status.baris, identId, identVer);
  }, [rabId, identId, identVer, item.baris, baris.baris, status.baris]);
  // memuat hanya selama tiga bacaan utama belum kembali; galat dianggap selesai
  const menunggu = (x: { baris: unknown; memuat: boolean; galat: string | null }) => x.memuat && !x.galat;
  const memuat = !!roKode && (menunggu(ringkas) || (!!rabId && (menunggu(item) || menunggu(baris))));
  return { rabSurvei, memuat };
}
