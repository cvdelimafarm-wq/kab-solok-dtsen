// app/sigap/spdt/Ik.tsx -- ikon garis inline (24x24, tebal 2) untuk Lembar Pendataan SPDT NTP; tanpa emoji.

export type NamaIk = "pin" | "turun" | "tambah" | "kurang" | "semua" | "lokasi" | "cari" | "arah" | "salin" | "tutup" | "segar" | "centang" | "awas";

export default function Ik({ n, className = "h-[18px] w-[18px]" }: { n: NamaIk; className?: string }) {
  const p = {
    pin: (
      <>
        <path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" />
        <circle cx="12" cy="9" r="2.5" />
      </>
    ),
    turun: <path d="m6 9 6 6 6-6" />,
    tambah: <path d="M12 5v14M5 12h14" />,
    kurang: <path d="M5 12h14" />,
    semua: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
    lokasi: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>
    ),
    cari: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
    arah: <path d="M3 11 21 3l-8 18-2-8z" />,
    salin: (
      <>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V6a2 2 0 0 1 2-2h9" />
      </>
    ),
    tutup: <path d="M6 6l12 12M18 6 6 18" />,
    segar: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
    centang: <path d="m5 12 5 5 9-10" />,
    awas: (
      <>
        <path d="M12 3 2 20h20z" />
        <path d="M12 10v4M12 17.5v.01" />
      </>
    ),
  }[n];
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`flex-none fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round] ${className}`}>
      {p}
    </svg>
  );
}
