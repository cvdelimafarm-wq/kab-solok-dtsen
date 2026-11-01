// app/api/sigap/vanguard/route.ts
//
// (1 Nov 2026) VANGUARD V2a: rekaman percobaan simulasi kuesioner KP. Aturan: lib/vanguard/rekam.ts (penilaian ulang di server), lib/vanguardAkses.ts.
//   GET  ?kegiatan=ID  -> { mode:"tercatat", boleh, alasan, riwayat:[{kasus, percobaan, benar, bintang}] } (hanya milik akun sendiri)
//                         tanpa ?kegiatan -> { mode:"bebas", boleh:false, riwayat:[] } (simulasi bebas: tidak ada rekaman)
//   POST { kegiatan, kasus, isian, petunjuk, lihatJawaban, durasiDtk } -> menilai ulang di server, mencatat, dan membalas { dicatat, nomor, benar, bintang, koreksi, pemeriksaan }
// Tidak boleh mencatat saat "masuk sebagai" akun lain (hanya lihat). Tidak ada data responden nyata: kasus fiktif; yang disimpan isian petugas.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { aktorDariHeader, sesiDariHeader } from "@/lib/sigapAkses";
import { bolehMencatat } from "@/lib/vanguardAkses";
import { barisKesalahan, barisPercobaan, bacaMuatan, MAKS_PERCOBAAN_PER_KASUS, modeMasuk, ringkasPercobaan, ringkasRiwayat } from "@/lib/vanguard/rekam";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

const idKegiatan = (s: string | null): number | null => (s && /^\d{1,9}$/.test(s) && Number(s) > 0 ? Number(s) : null);

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatan = idKegiatan(req.nextUrl.searchParams.get("kegiatan"));
    if (modeMasuk(kegiatan) === "bebas") return NextResponse.json({ mode: "bebas", boleh: false, alasan: null, riwayat: [] });
    const izin = await bolehMencatat(db as Db, akunId, kegiatan as number);
    if (!izin.boleh) return NextResponse.json({ mode: "tercatat", boleh: false, alasan: izin.alasan, riwayat: [] });
    const { data, error } = await db.from("sigap_vanguard_percobaan").select("kasus, benar, bintang").eq("kegiatan_id", kegiatan).eq("akun_id", akunId).limit(5000);
    if (error) return galat("Gagal memuat riwayat.", 500);
    return NextResponse.json({ mode: "tercatat", boleh: true, alasan: null, riwayat: ringkasRiwayat((data ?? []) as { kasus: string; benar: boolean; bintang: number }[]) });
  } catch {
    return galat("Gagal memuat Vanguard.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers)) return galat("Mode lihat (masuk sebagai) tidak dapat mencatat percobaan.", 403);
    let badan: unknown;
    try { badan = await req.json(); } catch { return galat("Isi permintaan tidak sah."); }
    const baca = bacaMuatan(badan);
    if (!baca.ok) return galat(baca.pesan);
    const { muatan, kasus } = baca;
    const izin = await bolehMencatat(db as Db, akunId, muatan.kegiatan);
    if (!izin.boleh) return galat(izin.alasan ?? "Tidak diizinkan.", 403);

    // Nomor percobaan = urutan petugas pada kasus ini. Dua kiriman bersamaan bertabrakan di unique (kegiatan, akun, kasus, nomor): coba ulang sekali.
    for (let ulang = 0; ulang < 2; ulang++) {
      const { count, error: eHitung } = await db.from("sigap_vanguard_percobaan").select("id", { count: "exact", head: true }).eq("kegiatan_id", muatan.kegiatan).eq("akun_id", akunId).eq("kasus", muatan.kasus);
      if (eHitung) return galat("Gagal mencatat percobaan.", 500);
      const nomor = (count ?? 0) + 1;
      if (nomor > MAKS_PERCOBAAN_PER_KASUS) return galat("Batas percobaan untuk kasus ini sudah tercapai.", 429);
      const hasil = ringkasPercobaan(kasus, muatan, nomor);
      const { data: baru, error } = await db.from("sigap_vanguard_percobaan").insert(barisPercobaan(akunId, muatan, hasil, nomor)).select("id").single();
      if (error) {
        if ((error as { code?: string }).code === "23505" && ulang === 0) continue;
        return galat("Gagal mencatat percobaan.", 500);
      }
      const kes = barisKesalahan((baru as { id: number }).id, akunId, muatan, hasil);
      if (kes.length > 0) {
        const { error: eKes } = await db.from("sigap_vanguard_kesalahan").insert(kes);
        if (eKes) return galat("Percobaan tercatat, tetapi rincian kesalahan gagal disimpan.", 500);
      }
      return NextResponse.json({ dicatat: true, nomor, benar: hasil.benar, bintang: hasil.bintang, koreksi: hasil.koreksi, pemeriksaan: hasil.pemeriksaan });
    }
    return galat("Gagal mencatat percobaan.", 500);
  } catch {
    return galat("Gagal mencatat percobaan.", 500);
  }
}
