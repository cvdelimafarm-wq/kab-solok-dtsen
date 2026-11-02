"use client";

// app/sigap/vanguardSaya.ts
//
// (3 Nov 2026) Keadaan Vanguard akun ini untuk satu kegiatan (GET /api/sigap/vanguard?kegiatan=ID), lewat simpanan bersama (app/portal/dataBersama.ts):
// SATU permintaan dibagi kartu Vanguard (KartuVanguardHariIni), lajur langkah pelatihan, dan halaman Hari ini. Pindah tab langsung tampil dari simpanan.
// Server tetap memutuskan siapa yang boleh dicatat (mode "tercatat" + boleh); gagal memuat = tidak ada apa pun yang digambar.

import { useMemo } from "react";
import { useData } from "@/app/portal/dataBersama";
import { masukanVanguard, vanguardMendesak, type MasukanLangkah } from "@/lib/alurPelatihan";
import type { RuntutanKartu } from "@/lib/vanguardPelatihan";

export type KeadaanVanguard = { mode: "bebas" | "tercatat"; boleh: boolean; riwayat: { kasus: string; benar: boolean }[]; runtutan?: RuntutanKartu | null };

export type VanguardSaya = {
  /** Kartu / langkah Vanguard berlaku untuk akun ini (mode tercatat dan boleh). */
  ada: boolean;
  benar: number;
  runtutan: RuntutanKartu | null;
  /** Masukan untuk hitungLangkahPelatihan (null bila tidak berlaku). */
  langkah: MasukanLangkah["vanguard"];
  /** Perlu disorot dan didahulukan sekarang. */
  mendesak: boolean;
};

export function useVanguardSaya(kegiatanId: number | null): VanguardSaya {
  const h = useData<KeadaanVanguard>(`/api/sigap/vanguard?kegiatan=${kegiatanId ?? 0}`, { aktif: kegiatanId !== null });
  const data = h.data;
  // dimemoisasi: objek langkah dipakai sebagai dependensi useMemo di lajur langkah
  return useMemo(() => {
    const langkah = kegiatanId === null ? null : masukanVanguard(data);
    return {
      ada: langkah !== null,
      benar: langkah?.benar ?? 0,
      runtutan: langkah ? data?.runtutan ?? null : null,
      langkah,
      mendesak: vanguardMendesak(langkah),
    };
  }, [data, kegiatanId]);
}
