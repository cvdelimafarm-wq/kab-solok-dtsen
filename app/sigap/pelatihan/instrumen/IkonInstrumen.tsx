// app/sigap/pelatihan/instrumen/IkonInstrumen.tsx
//
// (2 Nov 2026) Ikon judul kartu di tab Instrumen (menggantikan emoji): garis SVG di kotak berwarna lembut, ukuran dan gaya sama dengan ikon kartu lain di tampilan pelatihan.

export type KunciIkonInstrumen = "kuesioner" | "pedoman" | "materi" | "video" | "tautan";

const GARIS = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const WARNA: Record<KunciIkonInstrumen, string> = {
  kuesioner: "bg-[#E6EEFC] text-[#1F5FD1]",
  pedoman: "bg-[#FFF1D1] text-[#A86400]",
  materi: "bg-[#EFE9FD] text-[#6A3FD1]",
  video: "bg-[#FDE8E8] text-[#C0392B]",
  tautan: "bg-[#E3F6EC] text-[#13794B]",
};

function Gambar({ kunci }: { kunci: KunciIkonInstrumen }) {
  const p = { viewBox: "0 0 24 24", width: 22, height: 22, "aria-hidden": true as const, focusable: "false" as const, ...GARIS };
  switch (kunci) {
    case "kuesioner": // papan jepit dengan daftar centang
      return (
        <svg {...p}>
          <rect x="5" y="4.5" width="14" height="16.5" rx="2.5" />
          <path d="M9 4.5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v.5" />
          <path d="m8.5 11.5 1.3 1.3 2.2-2.4M14 11.8h2.5" />
          <path d="m8.5 16.5 1.3 1.3 2.2-2.4M14 16.8h2.5" />
        </svg>
      );
    case "pedoman": // buku terbuka
      return (
        <svg {...p}>
          <path d="M12 6.5C10.3 5.2 8 4.7 4.5 5v12.5c3.5-.3 5.8.2 7.5 1.5M12 6.5c1.7-1.3 4-1.8 7.5-1.5v12.5c-3.5-.3-5.8.2-7.5 1.5M12 6.5V19" />
        </svg>
      );
    case "materi": // layar presentasi dengan grafik
      return (
        <svg {...p}>
          <rect x="3.5" y="4" width="17" height="11.5" rx="2" />
          <path d="M12 15.5V19M8.5 19.5h7" />
          <path d="M7.5 12.5v-2M11 12.5V8.5M14.5 12.5v-3M17 12.5" />
        </svg>
      );
    case "video": // layar dengan tombol putar
      return (
        <svg {...p}>
          <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
          <path d="m10.3 9.6 4.6 2.4-4.6 2.4z" fill="currentColor" />
        </svg>
      );
    default: // tautan
      return (
        <svg {...p}>
          <path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-.9.9" />
          <path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l.9-.9" />
        </svg>
      );
  }
}

/** Judul kartu: kotak ikon + teks. */
export function JudulIkon({ kunci, teks }: { kunci: KunciIkonInstrumen; teks: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className={`grid h-9 w-9 flex-none place-items-center rounded-[11px] ${WARNA[kunci]}`}>
        <Gambar kunci={kunci} />
      </span>
      {teks}
    </span>
  );
}
