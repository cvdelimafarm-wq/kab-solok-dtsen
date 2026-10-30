// app/api/portal/pendataan/laporan/foto/route.ts
//
// (30 Okt 2026) Daftar foto dokumentasi untuk pemilih foto Lampiran B Laporan Sementara. Hanya-baca, TERIKAT SATU KEGIATAN.
// GET ?k=<kegiatan>&peran=ppl,pml,supervisi&slot=1,2&dari=&sampai=&cari=&halaman=&ukuran=   -> { total, halaman, ukuran, foto[] }
// GET ?k=<kegiatan>&mode=id&<saringan>                                                      -> { total, terpotong, foto[] } (maks 500)
// GET ?k=<kegiatan>&ids=1,2,3                                                               -> { foto[] } (rincian pilihan tersimpan; maks 60)
// Izin: bencana.admin (lihat) pada kegiatan itu, jadi pengelola SPDT NTP hanya melihat foto SPDT NTP.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import { MAKS_FOTO_LAPORAN, bacaFilterFoto } from "@/lib/laporanFoto";
import { daftarFoto, rincianFoto, semuaFotoSaringan } from "@/lib/portal/laporanFoto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const k = Number(sp.get("k"));
  if (!Number.isInteger(k) || k <= 0) return galat("Pilih kegiatan.");
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  try {
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, "bencana.admin", "lihat", k)) return galat("Anda tidak punya akses ke foto kegiatan ini.", 403);
    const ids = sp.get("ids");
    if (ids !== null) {
      const daftar = ids.split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0).slice(0, MAKS_FOTO_LAPORAN);
      return NextResponse.json({ foto: await rincianFoto(db, k, daftar) });
    }
    const f = bacaFilterFoto(sp);
    if (sp.get("mode") === "id") return NextResponse.json(await semuaFotoSaringan(db, k, f));
    return NextResponse.json(await daftarFoto(db, k, f));
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Gagal memuat daftar foto.", 500);
  }
}
