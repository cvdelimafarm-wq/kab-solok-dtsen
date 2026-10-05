// Kop identitas: logo BPS + nama lengkap instansi. Dipakai di header halaman petugas.
// Logo: /public/logo-bps.svg -- (6 Okt 2026) versi vektor hasil penelusuran logo-bps.png (per warna), supaya
// tetap tajam di semua ukuran & layar retina -- permintaan user. PNG lama tetap disimpan sbg cadangan.
export const NAMA_INSTANSI = "Badan Pusat Statistik Kabupaten Solok";

export default function BrandBps({
  className = "",
  teksClassName = "",
  ukuran = 28,
  kotakPutih = false,
}: {
  className?: string;
  teksClassName?: string;
  ukuran?: number;
  /** Latar putih di belakang logo, untuk header berwarna gelap. */
  kotakPutih?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-bps.svg"
        alt="Logo BPS"
        style={{ height: ukuran, width: "auto" }}
        decoding="async"
        className={kotakPutih ? "shrink-0 rounded-md bg-white p-1 box-content" : "shrink-0"}
      />
      <span className={teksClassName}>{NAMA_INSTANSI}</span>
    </span>
  );
}
