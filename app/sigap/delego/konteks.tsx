"use client";

// app/sigap/delego/konteks.tsx
//
// (26 Okt 2026) Konteks Delego: hak akun, tanggal hari ini (WIB, dari basis data), jam WIB, dan peran ringkas. Disediakan oleh DelegoShell.

import { createContext, useContext } from "react";
import type { HakDelegasi } from "@/lib/delego/tipe";

export type KonteksDelego = {
  hak: HakDelegasi;
  hari: string;
  jam: number;
  /** Boleh melihat halaman tim (pemberi atau pelihat pada minimal satu RO). */
  manajer: boolean;
  /** Boleh mendelegasikan (pemberi pada minimal satu RO). */
  pemberi: boolean;
  /** Boleh mendelegasikan pada RO ini. */
  bolehBeri: (ro: string) => boolean;
  muatHak: () => Promise<void>;
};

export const KonteksDelegoRef = createContext<KonteksDelego | null>(null);

export function useKonteksDelego(): KonteksDelego {
  const k = useContext(KonteksDelegoRef);
  if (!k) throw new Error("useKonteksDelego dipakai di luar DelegoShell");
  return k;
}
