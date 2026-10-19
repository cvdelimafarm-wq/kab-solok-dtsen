// app/api/verifikasi-foto/route.ts  (PUBLIK, tanpa sesi)
//
// (19 Okt 2026) Verifikasi foto Kamera SIGAP oleh siapa pun (mis. pemeriksa SPJ, BPK) tanpa login.
// GET  ?k=SGP-XXXX-XXXX-XXXX        -> catatan server (waktu, nagari bila ada, kegiatan, pengambil). TANPA koordinat tepat dan TANPA foto arsip.
// POST multipart { berkas, k? }     -> bandingkan berkas dengan catatan: 'cocok' (SHA-256 sama persis), 'mirip' (sidik gambar dekat; mis. dikompres WhatsApp), 'beda'.
//                                      Tanpa k: hanya bisa cocok persis (SHA-256 berkas ber-cap).
// Pembatasan laju per IP (di-hash): 30 pemeriksaan / 10 menit, dicatat di sigap_foto_cek. Foto arsip dilihat setelah login (endpoint berkas).

import { NextRequest, NextResponse } from "next/server";
import { dbPortal } from "@/lib/portal/server";
import { AMBANG_MIRIP_BIT, jarakHamming, normalisasiKode, teksWaktuWib } from "@/lib/sigapFoto";
import { sidikGambar } from "@/lib/sigapFotoCap";
import { hashIp, ipDariHeader, sha256Hex } from "@/lib/sigapFotoServer";
import type { Db } from "@/lib/sigap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATAS = 30;
const JENDELA_MS = 10 * 60_000;
const MAKS_BYTE = 15 * 1024 * 1024;

const j = (o: Record<string, unknown>, status = 200) => NextResponse.json(o, { status, headers: { "Cache-Control": "no-store" } });


async function terbatas(db: Db, ipHash: string): Promise<boolean> {
  const { count } = await db.from("sigap_foto_cek").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("dicek_at", new Date(Date.now() - JENDELA_MS).toISOString());
  return (count ?? 0) >= BATAS;
}

async function catat(db: Db, kode: string | null, hasil: string, ipHash: string) {
  await db.from("sigap_foto_cek").insert({ kode, hasil, ip_hash: ipHash });
}

type FotoRow = { id: number; kode: string; kegiatan_id: number; akun_pengambil: number; diambil_at: string; lokasi_teks: string | null; status_periksa: string; file_dihapus_at: string | null; waktu_terverifikasi: boolean; sha256: string; sidik_gambar: string | null };

async function catatanPublik(db: Db, f: FotoRow) {
  const [{ data: keg }, { data: ak }] = await Promise.all([
    db.from("sigap_kegiatan").select("nama").eq("id", f.kegiatan_id).maybeSingle(),
    db.from("sigap_akun").select("nama").eq("id", f.akun_pengambil).maybeSingle(),
  ]);
  return {
    kode: f.kode,
    waktu: teksWaktuWib(new Date(f.diambil_at).getTime()),
    waktu_dari_server: f.waktu_terverifikasi,
    lokasi: f.lokasi_teks,
    kegiatan: (keg?.nama as string | undefined) ?? null,
    pengambil: (ak?.nama as string | undefined) ?? null,
    dalam_pemeriksaan: f.status_periksa === "dipertanyakan",
    berkas_dihapus: !!f.file_dihapus_at,
  };
}

const KOLOM = "id, kode, kegiatan_id, akun_pengambil, diambil_at, lokasi_teks, status_periksa, file_dihapus_at, waktu_terverifikasi, sha256, sidik_gambar";

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return j({ error: "Layanan belum siap." }, 500);
  const ipHash = hashIp(ipDariHeader(req.headers));
  if (await terbatas(db, ipHash)) return j({ error: "Terlalu banyak pemeriksaan. Coba lagi beberapa menit lagi." }, 429);
  const kode = normalisasiKode(req.nextUrl.searchParams.get("k"));
  if (!kode) return j({ error: "Kode tidak valid. Format: SGP-XXXX-XXXX-XXXX." }, 400);
  const { data } = await db.from("sigap_foto").select(KOLOM).eq("kode", kode).maybeSingle();
  if (!data) {
    await catat(db, kode, "tidak_ada", ipHash);
    return j({ ada: false, kode });
  }
  await catat(db, kode, "cocok", ipHash);
  return j({ ada: true, catatan: await catatanPublik(db, data as FotoRow) });
}

export async function POST(req: NextRequest) {
  const db = dbPortal();
  if (!db) return j({ error: "Layanan belum siap." }, 500);
  const ipHash = hashIp(ipDariHeader(req.headers));
  if (await terbatas(db, ipHash)) return j({ error: "Terlalu banyak pemeriksaan. Coba lagi beberapa menit lagi." }, 429);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return j({ error: "Isian tidak terbaca." }, 400);
  }
  const berkas = form.get("berkas");
  if (!(berkas instanceof File) || berkas.size < 1000) return j({ error: "Berkas foto wajib." }, 400);
  if (berkas.size > MAKS_BYTE) return j({ error: "Berkas terlalu besar (maks 15 MB)." }, 413);
  const kodeMasuk = form.get("k");
  const kode = kodeMasuk ? normalisasiKode(String(kodeMasuk)) : null;
  if (kodeMasuk && !kode) return j({ error: "Kode tidak valid. Format: SGP-XXXX-XXXX-XXXX." }, 400);

  const buf = Buffer.from(await berkas.arrayBuffer());
  const sha = sha256Hex(buf);

  let foto: FotoRow | null = null;
  if (kode) {
    const { data } = await db.from("sigap_foto").select(KOLOM).eq("kode", kode).maybeSingle();
    foto = (data as FotoRow | null) ?? null;
    if (!foto) {
      await catat(db, kode, "tidak_ada", ipHash);
      return j({ ada: false, kode });
    }
    if (foto.sha256 === sha) {
      await catat(db, kode, "cocok", ipHash);
      return j({ ada: true, hasil: "cocok", pesan: "Berkas ini sama persis dengan yang tersimpan di SIGAP.", catatan: await catatanPublik(db, foto) });
    }
    let hasil: "mirip" | "beda" = "beda";
    try {
      const d = jarakHamming(await sidikGambar(buf), foto.sidik_gambar);
      if (d !== null && d <= AMBANG_MIRIP_BIT) hasil = "mirip";
    } catch {
      return j({ error: "Berkas bukan gambar yang valid." }, 400);
    }
    await catat(db, kode, hasil, ipHash);
    return j({
      ada: true,
      hasil,
      pesan: hasil === "mirip" ? "Gambar mirip dengan yang tersimpan, tetapi berkasnya berbeda (mis. dikompres aplikasi chat). Bukan salinan persis." : "Gambar tidak cocok dengan foto yang tersimpan untuk kode ini.",
      catatan: await catatanPublik(db, foto),
    });
  }

  const { data } = await db.from("sigap_foto").select(KOLOM).eq("sha256", sha).maybeSingle();
  if (!data) {
    await catat(db, null, "beda", ipHash);
    return j({ ada: false, hasil: "beda", pesan: "Tidak ada foto SIGAP dengan sidik berkas yang sama. Bila foto dikirim lewat aplikasi chat, masukkan juga kode pada cap agar bisa dibandingkan secara 'mirip'." });
  }
  await catat(db, (data as FotoRow).kode, "cocok", ipHash);
  return j({ ada: true, hasil: "cocok", pesan: "Berkas ini sama persis dengan yang tersimpan di SIGAP.", catatan: await catatanPublik(db, data as FotoRow) });
}
