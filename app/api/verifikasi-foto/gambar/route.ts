// app/api/verifikasi-foto/gambar/route.ts  (PUBLIK, tanpa sesi)
//
// (27 Okt 2026) Gambar foto untuk halaman /verifikasi.  GET ?k=SGP-XXXX-XXXX-XXXX&u=kecil|penuh
//   kecil : JPEG ±800 px (±80-120 KB), dibuat dari berkas ber-cap, dikirim langsung oleh server ini.
//   penuh : pengalihan (302) ke tautan bertanda tangan penyimpanan yang berlaku 5 menit -> byte foto penuh TIDAK melewati server ini.
// Foto hanya dilayani bila belum dihapus DAN belum disetujui untuk dihapus (lib/sigapVerifikasi.ts); selain itu 404 dan halaman
// menampilkan verifikasi kode saja. Kode 48 bit acak = kunci akses; tebakan dibatasi per IP (di-hash), sama dengan pemeriksaan kode.
// Permintaan gambar tidak dicatat ke sigap_foto_cek (hanya dihitung), supaya satu halaman yang memuat 2 gambar tidak menghabiskan jatah.

import { NextRequest, NextResponse } from "next/server";
import { dbPortal } from "@/lib/portal/server";
import { BUCKET_SIGAP } from "@/lib/sigap";
import { normalisasiKode } from "@/lib/sigapFoto";
import { hashIp, ipDariHeader } from "@/lib/sigapFotoServer";
import { buatFotoKecil } from "@/lib/sigapFotoKecil";
import { SimpananKecil, fotoBolehTampil, ukuranDariParam } from "@/lib/sigapVerifikasi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lebih longgar daripada pemeriksaan kode (30 / 10 menit) karena satu pemeriksaan membuka 1-3 gambar dan boleh dimuat ulang.
const BATAS_GAMBAR = 120;
const JENDELA_MS = 10 * 60_000;
const TTL_TAUTAN_DETIK = 300;

const simpanan = new SimpananKecil<Buffer>(24, 10 * 60_000);

const tolak = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return tolak(500, "Layanan belum siap.");
  const ipHash = hashIp(ipDariHeader(req.headers));
  const { count } = await db.from("sigap_foto_cek").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("dicek_at", new Date(Date.now() - JENDELA_MS).toISOString());
  if ((count ?? 0) >= BATAS_GAMBAR) return tolak(429, "Terlalu banyak permintaan. Coba lagi beberapa menit lagi.");

  const kode = normalisasiKode(req.nextUrl.searchParams.get("k"));
  if (!kode) return tolak(400, "Kode tidak valid.");
  const ukuran = ukuranDariParam(req.nextUrl.searchParams.get("u"));

  const { data: foto } = await db.from("sigap_foto").select("id, file_path, file_dihapus_at, hapus_disetujui_at").eq("kode", kode).maybeSingle();
  if (!foto || !fotoBolehTampil(foto)) return tolak(404, "Foto tidak tersedia.");
  const jalur = foto.file_path as string;

  if (ukuran === "penuh") {
    const { data, error } = await db.storage.from(BUCKET_SIGAP).createSignedUrl(jalur, TTL_TAUTAN_DETIK);
    if (error || !data?.signedUrl) return tolak(404, "Berkas tidak ditemukan di penyimpanan.");
    return new NextResponse(null, { status: 302, headers: { Location: data.signedUrl, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  }

  const kunci = `${kode}|${jalur}`;
  let kecil = simpanan.ambil(kunci, Date.now());
  if (!kecil) {
    const { data, error } = await db.storage.from(BUCKET_SIGAP).download(jalur);
    if (error || !data) return tolak(404, "Berkas tidak ditemukan di penyimpanan.");
    try {
      kecil = await buatFotoKecil(Buffer.from(await data.arrayBuffer()));
    } catch {
      return tolak(422, "Berkas bukan gambar yang valid.");
    }
    simpanan.simpan(kunci, kecil, Date.now());
  }
  return new NextResponse(new Uint8Array(kecil), {
    // private + 10 menit: pemeriksa membuka ulang dengan cepat, tetapi bila foto dinonaktifkan tampilan segera menyusul (bukan berhari-hari).
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=600", "X-Robots-Tag": "noindex" },
  });
}
