"use client";

// app/portal/PilihTampilan.tsx
//
// (3 Nov 2026) Sakelar kecil "Kartu | Ikon" di Beranda. Lihat lib/tampilanBeranda.ts.
// (7 Nov 2026) Dipadatkan (permintaan user, hemat tempat): tanpa tulisan "Tampilan" (tetap ada sebagai aria-label), tinggi 32 px (dulu 44 px + label),
// rata kanan dan merapat ke kartu di bawahnya (-mb-2.5 menutup sebagian jarak antarkartu).

import { DAFTAR_TAMPILAN, LABEL_TAMPILAN, type TampilanBeranda } from "@/lib/tampilanBeranda";

export default function PilihTampilan({ nilai, onPilih }: { nilai: TampilanBeranda; onPilih: (t: TampilanBeranda) => void }) {
  return (
    <div role="group" aria-label="Tampilan kegiatan" className="-mb-2.5 flex justify-end px-1" data-testid="pilih-tampilan">
      <div className="inline-flex rounded-full bg-white p-0.5 shadow-[0_2px_8px_rgba(15,42,82,.1)]">
        {DAFTAR_TAMPILAN.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={nilai === t}
            onClick={() => onPilih(t)}
            className={`h-8 min-w-[52px] rounded-full px-3 text-[12px] font-extrabold leading-none ${nilai === t ? "bg-[#0F2A52] text-white" : "text-[#0F2A52] active:bg-[#EAF1FC]"}`}
          >
            {LABEL_TAMPILAN[t]}
          </button>
        ))}
      </div>
    </div>
  );
}
