// app/api/portal/pendataan/laporan/foto/gambar/route.ts
//
// (30 Okt 2026) Gambar satu foto dokumentasi (JPEG diperkecil) untuk pemilih foto dan untuk disisipkan ke laporan.
// GET ?k=<kegiatan>&id=<sigap_dokumentasi.id>&u=kecil|sedang (Authorization: Bearer <sesi>) -> image/jpeg.
// Izin bencana.admin (lihat) pada kegiatan k, dan foto harus milik kegiatan k (diperiksa ulang di gambarFoto). Klien memakai fetch + blob.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import { gambarFoto, ukuranGambarSah } from "@/lib/portal/laporanFoto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const k = Number(sp.get("k"));
  const id = Number(sp.get("id"));
  if (!Number.isInteger(k) || k <= 0 || !Number.isInteger(id) || id <= 0) return galat("Kegiatan dan id foto wajib.");
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  try {
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, "bencana.admin", "lihat", k)) return galat("Anda tidak punya akses ke foto kegiatan ini.", 403);
    const jpeg = await gambarFoto(db, k, id, ukuranGambarSah(sp.get("u")));
    if (!jpeg) return galat("Foto tidak ditemukan pada kegiatan ini.", 404);
    return new NextResponse(new Uint8Array(jpeg), {
      // isi foto tidak berubah (id tetap, berkas tetap); Vary: Authorization supaya simpanan tidak dipakai bersama antar-akun
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", Vary: "Authorization" },
    });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Gagal memuat gambar.", 500);
  }
}
