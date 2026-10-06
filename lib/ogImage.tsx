import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Gambar pratinjau link 1200x630: logo BPS + judul halaman. Dibuat otomatis
// (tidak perlu membuat gambar manual). Dipanggil dari opengraph-image.tsx.
// (6 Okt 2026) Logo = lambang resmi BPS (public/logo-bps-hd.png, hasil render tajam dari logo-bps.svg resmi;
// sebelumnya logo-bps.png lama yg bergerigi) & tulisan instansi dibakukan: BADAN PUSAT STATISTIK /
// KABUPATEN SOLOK, kapital, tebal, miring -- permintaan user.
export async function ogImage(judul: string, sub: string) {
  let logo: string | null = null;
  try {
    const buf = await readFile(join(process.cwd(), "public", "logo-bps-hd.png"));
    logo = `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    logo = null; // tanpa logo kalau file tidak terbaca; gambar tetap jadi
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #1E2A47 0%, #141C31 100%)",
          color: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt=""
              height={84}
              style={{ height: 84, background: "#fff", borderRadius: 14, padding: 10 }}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", marginLeft: logo ? 24 : 0 }}>
            {/* Miring dibuat dgn skew krn font miring tidak tersedia di generator gambar */}
            <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: 1, transform: "skewX(-10deg)" }}>BADAN PUSAT STATISTIK</span>
            <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: 1, transform: "skewX(-10deg)" }}>KABUPATEN SOLOK</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 70, fontWeight: 700, lineHeight: 1.15 }}>{judul}</div>
          <div style={{ marginTop: 22, fontSize: 30, color: "#D3DAEB", lineHeight: 1.35 }}>{sub}</div>
        </div>
        <div style={{ display: "flex", height: 8, width: 160, background: "#C08829", borderRadius: 4 }} />
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
