// app/api/sigap/vanguard/kasus/route.ts
//
// (1 Nov 2026) VANGUARD V5b: bagian RAHASIA sebuah kasus (kunci, jebakan, alternatif, petunjuk, cara hitung, pembahasan, rujukan) untuk LATIHAN dan simulasi bebas.
// Perangkat petugas hanya memuat bahan soal (kasus/publik.json); isi rahasia diminta per kasus lewat rute ini, dan DITOLAK (403) bila kasus itu sedang diujikan
// kepada akun ini: akun adalah peserta aktif sebuah kegiatan bermode uji yang jadwalnya buka dan level kasusnya dibuka di sana. Aturan itu berlaku juga untuk
// simulasi bebas dari Beranda, supaya kunci tidak dapat diintip lewat jalan lain selama uji.
//   GET ?kode=A01 -> { kode, rahasia: KasusRahasia }   (401 sesi berakhir; 400 kode tidak sah; 404 kasus tidak ada; 403 sedang diuji)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import type { Db } from "@/lib/sigap";
import { sesiDariHeader } from "@/lib/sigapAkses";
import { bolehMencatat } from "@/lib/vanguardAkses";
import { kegiatanBerjenisPelatihan, muatKegiatanUji } from "@/lib/vanguardPengaturanDb";
import { cariKasus, rahasiaKasus } from "@/lib/vanguard/kasus";
import { kasusSedangDiuji } from "@/lib/vanguard/pengaturan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kode = req.nextUrl.searchParams.get("kode") ?? "";
    if (!/^[A-Z][0-9]{2}$/.test(kode)) return galat("Kode kasus tidak sah.");
    const kasus = cariKasus(kode);
    if (!kasus) return galat("Kasus tidak ditemukan.", 404);
    const sekarang = Date.now();
    for (const u of await muatKegiatanUji(db as Db)) {
      if (!kasusSedangDiuji(u.pengaturan, kasus.level, sekarang)) continue;
      if (await kegiatanBerjenisPelatihan(db as Db, u.kegiatan)) continue; // (3 Nov 2026) bank soal pelatihan selalu terbuka (petunjuk dan kunci tersedia)
      if ((await bolehMencatat(db as Db, akunId, u.kegiatan)).boleh) return galat("Kasus ini sedang diujikan kepada Anda; kunci dan pembahasan tidak ditampilkan selama uji.", 403);
    }
    return NextResponse.json({ kode, rahasia: rahasiaKasus(kasus) });
  } catch {
    return galat("Gagal memuat kasus.", 500);
  }
}
