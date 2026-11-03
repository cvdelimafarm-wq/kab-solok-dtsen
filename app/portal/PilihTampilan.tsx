"use client";

// app/portal/PilihTampilan.tsx
//
// (3 Nov 2026) Sakelar kecil "Kartu | Ikon" di atas daftar Kegiatan saya (Beranda). Lihat lib/tampilanBeranda.ts.

import { DAFTAR_TAMPILAN, LABEL_TAMPILAN, type TampilanBeranda } from "@/lib/tampilanBeranda";

export default function PilihTampilan({ nilai, onPilih }: { nilai: TampilanBeranda; onPilih: (t: TampilanBeranda) => void }) {
  return (
    <div role="group" aria-label="Tampilan kegiatan" className="flex items-center justify-end gap-2 px-1" data-testid="pilih-tampilan">
      <span className="text-[11.5px] font-bold text-[#6B7A90]">Tampilan</span>
      <div className="inline-flex rounded-full bg-white p-0.5 shadow-[0_2px_8px_rgba(15,42,82,.1)]">
        {DAFTAR_TAMPILAN.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={nilai === t}
            onClick={() => onPilih(t)}
            className={`min-h-[44px] min-w-[64px] rounded-full px-3.5 text-[12.5px] font-extrabold ${nilai === t ? "bg-[#0F2A52] text-white" : "text-[#0F2A52] active:bg-[#EAF1FC]"}`}
          >
            {LABEL_TAMPILAN[t]}
          </button>
        ))}
      </div>
    </div>
  );
}
