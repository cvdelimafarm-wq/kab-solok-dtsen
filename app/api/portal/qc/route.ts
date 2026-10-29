// app/api/portal/qc/route.ts
//
// (26 Okt 2026) QC Pemahaman Petugas -- sisi petugas (PML dan PPL Pendataan Pascabencana). Memakai sesi portal (Authorization: Bearer <sesi>).
// GET            -> { status, rekap, sekarang }   status hari ini (perlu mengisi?) + rekap tim kemarin khusus PML. Dipanggil gerbang tiap menit.
// GET ?soal=1    -> soal untuk percobaan berikutnya (tanpa kunci/pembahasan; urutan soal dan pilihan diacak per petugas dan percobaan)
// POST {aksi:"jawab", jawaban:{"<id>":"A".."D"}}  -> tinjauan: skor, benar/salah per soal, kunci, pembahasan; wajib lengkap
// POST {aksi:"rekap_baca", tanggal, kegiatan_id?}  -> PML menandai rekap tim sudah dibaca (kegiatan_id: QC per kegiatan, 29 Okt 2026)
// POST {aksi:"tunda"}                             -> (28 Okt 2026) menunda pengingat push 2 jam ("Ingatkan lagi 2 jam"); modal QC tetap wajib sampai 100
// Sesi "masuk sebagai" (simulasi) tidak boleh menjawab: jawaban akan tercatat atas nama petugas sungguhan.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { GalatQc, bersihkanJawaban, jawab, soalUntuk, statusDanRekap, tandaiRekapDibaca, tundaAkun } from "@/lib/portal/qc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

function tangani(tag: string, e: unknown): NextResponse {
  if (e instanceof GalatQc) return galat(e.message, e.status);
  return galatServer(tag, e);
}

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (req.nextUrl.searchParams.get("soal") === "1") {
      if (aktorDariHeader(req.headers)) return galat('Mode "masuk sebagai" tidak dapat mengerjakan QC.', 403);
      return NextResponse.json(await soalUntuk(db, akun.id));
    }
    return NextResponse.json(await statusDanRekap(db, akun.id));
  } catch (e) {
    return tangani("[api/portal/qc GET]", e);
  }
}

export async function POST(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers)) return galat('Mode "masuk sebagai" tidak dapat mengerjakan QC.', 403);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (body?.aksi === "jawab") {
      const jaw = bersihkanJawaban(body.jawaban);
      if (!jaw) return galat("Jawaban tidak terbaca. Muat ulang halaman lalu coba lagi.", 422);
      return NextResponse.json(await jawab(db, akun.id, jaw));
    }
    if (body?.aksi === "rekap_baca") {
      await tandaiRekapDibaca(db, akun.id, String(body.tanggal ?? ""), body.kegiatan_id);
      return NextResponse.json({ ok: true });
    }
    if (body?.aksi === "tunda") return NextResponse.json(await tundaAkun(db, akun.id, "modal")); // (28 Okt 2026) tunda pengingat push 2 jam; modal tetap wajib
    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return tangani("[api/portal/qc POST]", e);
  }
}
