import Link from "next/link";

// (9 Okt 2026) Kop identitas SIGAP untuk halaman bergaya header gelap (masuk, translok): petak putih berisi lambang S biru-emas + nama.
// Ditekan = ke Beranda SIGAP ("/"). Menggantikan BrandBps (logo BPS lama) di permukaan SIGAP.
export default function LogoSigap({ className = "", ukuran = 38 }: { className?: string; ukuran?: number }) {
  const isi = Math.round(ukuran * 0.76);
  return (
    <Link href="/" aria-label="SIGAP, ke Beranda" className={`flex min-w-0 items-center gap-2.5 text-white ${className}`}>
      <span
        className="grid flex-none place-items-center rounded-[11px] bg-white shadow-[0_4px_12px_rgba(4,16,40,.3)]"
        style={{ width: ukuran, height: ukuran }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/sigap-logo.png" alt="" width={isi} height={isi} style={{ width: isi, height: isi }} className="object-contain" />
      </span>
      <span className="min-w-0">
        <span className="block text-[18px] font-extrabold leading-none">SIGAP</span>
        <span className="mt-[3px] block truncate text-[8px] font-semibold uppercase tracking-[0.14em] text-[#A9BCD8]">Sistem Integrasi Kegiatan BPS</span>
      </span>
    </Link>
  );
}
