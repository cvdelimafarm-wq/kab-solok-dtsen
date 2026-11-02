"use client";

// app/sigap/pelatihan/kelola/GrupTab.tsx
//
// (2 Nov 2026) Perekat kecil untuk tab Kelola Pelatihan yang digabung: PilihSub (pilihan bagian di dalam satu tab, ikut ?sub=) dan ChipSetelan (penanda "Bawaan" / "Diubah").

import { useEffect, useState } from "react";
import { Chip } from "../../admin/ui";

export type ItemSub = { kode: string; label: string; ket?: string };

/** Pilihan bagian di dalam satu tab. Awal dari ?sub= bila sah; berubah tanpa menambah riwayat Back. */
export function useSub(daftar: readonly ItemSub[], awal?: string): [string, (k: string) => void] {
  const [sub, setSub] = useState<string>(awal && daftar.some((x) => x.kode === awal) ? awal : daftar[0].kode);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("sub");
      if (q && daftar.some((x) => x.kode === q)) setSub(q);
    } catch {
      /* abaikan */
    }
    // hanya saat pertama dipasang
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pilih = (k: string) => {
    setSub(k);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("sub", k);
      window.history.replaceState(null, "", u.toString());
    } catch {
      /* abaikan */
    }
  };
  return [sub, pilih];
}

export function PilihSub({ daftar, aktif, onPilih, label }: { daftar: readonly ItemSub[]; aktif: string; onPilih: (k: string) => void; label: string }) {
  const info = daftar.find((x) => x.kode === aktif);
  return (
    <div className="mb-3 space-y-1.5">
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
        {daftar.map((x) => (
          <button
            key={x.kode}
            type="button"
            role="tab"
            aria-selected={aktif === x.kode}
            onClick={() => onPilih(x.kode)}
            className={`min-h-[40px] rounded-full px-4 text-[13px] font-bold ${aktif === x.kode ? "bg-[#0F2A52] text-white" : "border border-[#DDE6F3] bg-white text-[#55657D] hover:bg-[#F8FAFC]"}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      {info?.ket && <p className="text-[12.5px] text-[#6B7A90]">{info.ket}</p>}
    </div>
  );
}

/** Penanda setelan: abu-abu "Bawaan" bila belum disentuh, kuning "Diubah" bila sudah dimodifikasi PJ. */
export function ChipSetelan({ diubah, teksDiubah = "Diubah", teksBawaan = "Bawaan" }: { diubah: boolean; teksDiubah?: string; teksBawaan?: string }) {
  return (
    <Chip w={diubah ? "wait" : "mut"} title={diubah ? "Sudah diubah dari setelan bawaan" : "Masih setelan bawaan"}>
      {diubah ? teksDiubah : teksBawaan}
    </Chip>
  );
}
