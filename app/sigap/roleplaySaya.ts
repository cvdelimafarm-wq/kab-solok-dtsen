"use client";

// app/sigap/roleplaySaya.ts
//
// (8 Nov 2026) Keadaan Roleplay bareng kelas untuk akun ini (GET /api/sigap/vanguard/roleplay?kegiatan=ID), lewat simpanan bersama (app/portal/dataBersama.ts):
// SATU permintaan dibagi kartu Hari ini dan lajur langkah pelatihan. Roleplay tidak aktif (tidak dicentang di Kelola Pelatihan) atau gagal dimuat = tidak ada apa pun yang digambar.

import { useMemo } from "react";
import { useData } from "@/app/portal/dataBersama";
import type { MasukanLangkah } from "@/lib/alurPelatihan";
import { adalahPeserta, type KeadaanRoleplay } from "@/app/sigap/vanguard/roleplay/tipe";

export type RoleplaySaya = {
  /** Roleplay aktif dan akun ini berhak (peserta, instruktur kelas, atau panitia). */
  ada: boolean;
  peran: "peserta" | "instruktur" | "pengelola" | null;
  /** Masukan langkah 8 untuk hitungLangkahPelatihan: hanya untuk peserta (null bila tidak berlaku). */
  langkah: MasukanLangkah["roleplay"];
  /** Sesi roleplay sedang berjalan atau diperiksa (kartu disorot). */
  mendesak: boolean;
};

export function useRoleplaySaya(kegiatanId: number | null): RoleplaySaya {
  const h = useData<KeadaanRoleplay>(`/api/sigap/vanguard/roleplay?kegiatan=${kegiatanId ?? 0}`, { aktif: kegiatanId !== null });
  const data = h.data;
  return useMemo(() => {
    if (kegiatanId === null || !data || !data.aktif) return { ada: false, peran: null, langkah: null, mendesak: false };
    if (adalahPeserta(data)) {
      const rp = data.roleplay;
      const sudahIsi = !!data.isian && ((data.isian.iv1?.length ?? 0) > 0 || Object.keys(data.isian.nilai ?? {}).length > 0);
      const langkah = { ada: !!rp, terbuka: rp?.status === "berjalan", sudahIsi, selesai: rp?.status === "selesai" };
      return { ada: true, peran: "peserta", langkah, mendesak: langkah.terbuka && !langkah.sudahIsi };
    }
    return { ada: true, peran: data.peran, langkah: null, mendesak: data.roleplay?.status === "berjalan" };
  }, [data, kegiatanId]);
}
