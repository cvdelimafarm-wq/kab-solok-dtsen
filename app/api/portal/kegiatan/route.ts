// app/api/portal/kegiatan/route.ts
//
// (8 Okt 2026) Struktur 3 layer -- ringkasan kegiatan bertahapan (Transport Lokal) untuk Beranda (Layer 1) dan halaman tahapan (Layer 2).
// GET (Authorization: Bearer <sesi>) [?id=translok-12] -> { sekarang, kegiatan: RingkasKegiatan[] }

import { NextRequest, NextResponse } from "next/server";
import { penugasanAkun } from "@/lib/sigap";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { kegiatanTranslok } from "@/lib/portal/kegiatan";
import { normalisasiNomorWa } from "@/lib/sigapKekurangan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return NextResponse.json({ error: "Sesi berakhir. Silakan masuk kembali." }, { status: 401 });
  try {
    const now = Date.now();
    const semua = await penugasanAkun(db, akun.id);
    const id = req.nextUrl.searchParams.get("id");
    // (14 Okt 2026) bila hanya satu kegiatan diminta (tahapan kegiatan, polling 45 dtk), hanya itu yang dihitung (hasil lembar per penugasan tidak murah)
    const pen = id ? semua.filter((p) => `translok-${p.id}` === id) : semua;
    // nomor WhatsApp admin anggaran (env SIGAP_WA_ADMIN, mis. 6281234567890 atau 081234567890): untuk tombol "Minta izin susulan ke admin"; kosong = tombol tidak tampil
    const waAdmin = normalisasiNomorWa(process.env.SIGAP_WA_ADMIN);
    let kegiatan = await kegiatanTranslok(db, akun.id, akun.token, pen, now, { namaPetugas: akun.nama, waAdmin });
    if (id) {
      kegiatan = kegiatan.filter((k) => k.id === id);
      if (kegiatan.length === 0) return NextResponse.json({ error: "Kegiatan tidak ditemukan atau sudah diarsipkan." }, { status: 404 });
    }
    return NextResponse.json({ sekarang: new Date(now).toISOString(), kegiatan });
  } catch (err) {
    // (14 Okt 2026) pesan database mentah tidak ditampilkan ke petugas; rinciannya tetap ada di log server
    console.error("[api/portal/kegiatan]", err);
    return NextResponse.json({ error: "Gagal memuat kegiatan. Coba lagi sebentar lagi." }, { status: 500 });
  }
}
