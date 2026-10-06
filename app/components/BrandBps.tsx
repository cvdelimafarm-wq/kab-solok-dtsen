// Kop identitas: logo BPS + nama instansi. Dipakai di header semua halaman (portal, SIGAP, bencana, dll).
// Logo: /public/logo-bps.svg -- (6 Okt 2026) lambang resmi BPS (SVG vektor dari user, dirapikan: tanpa
// ukuran pt tetap, + aria-label) supaya tajam di semua ukuran & layar retina. PNG lama disimpan sbg cadangan.
//
// (6 Okt 2026) Tulisan instansi dibakukan -- permintaan user:
//   BADAN PUSAT STATISTIK
//   KABUPATEN SOLOK
// dua baris, HURUF KAPITAL, Arial Bold Italic. Warna menyesuaikan latar:
//   - "putih"  : di header gelap (otomatis bila kotakPutih)
//   - "biru"   : biru huruf "b" pada logo (#0093DD), otomatis di latar terang
//   - "hitam"  : bila diminta
// Ukuran huruf tetap mengikuti teksClassName pemanggil (mis. text-[11px]); kelas warna lama dikalahkan.
export const NAMA_INSTANSI = "Badan Pusat Statistik Kabupaten Solok";

const WARNA = { putih: "#FFFFFF", biru: "#0093DD", hitam: "#111111" } as const;

export default function BrandBps({
  className = "",
  teksClassName = "",
  ukuran = 28,
  kotakPutih = false,
  warna,
}: {
  className?: string;
  teksClassName?: string;
  ukuran?: number;
  /** Latar putih di belakang logo, untuk header berwarna gelap. */
  kotakPutih?: boolean;
  /** Warna tulisan; default: putih bila kotakPutih (header gelap), selain itu biru logo. */
  warna?: keyof typeof WARNA;
}) {
  const w = WARNA[warna ?? (kotakPutih ? "putih" : "biru")];
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
      <span
        className={teksClassName}
        aria-label={NAMA_INSTANSI}
        style={{
          fontFamily: "Arial, 'Helvetica Neue', Helvetica, sans-serif",
          fontWeight: 700,
          fontStyle: "italic",
          textTransform: "uppercase",
          lineHeight: 1.12,
          letterSpacing: "0.02em",
          color: w,
        }}
      >
        <span style={{ display: "block", whiteSpace: "nowrap" }}>Badan Pusat Statistik</span>
        <span style={{ display: "block", whiteSpace: "nowrap" }}>Kabupaten Solok</span>
      </span>
    </span>
  );
}
