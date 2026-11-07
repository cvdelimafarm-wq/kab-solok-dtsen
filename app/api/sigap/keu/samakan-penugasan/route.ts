// app/api/sigap/keu/samakan-penugasan/route.ts
//
// (7 Nov 2026) "Samakan dengan lanjutan" untuk satu kegiatan tertaut. Logika: lib/keu/samakanPenugasan(.Db).ts.
// GET  ?ident=<id>&kegiatan=<id>                                  -> { selisih[], peringatan[], final, lanjutan_ver, boleh_terapkan }
// POST { ident, kegiatan, pilihan:[{ akun_id, aksi }] }           -> { diterapkan, dilewati, tanpa_atasan[], surat_perlu_terbit[] }  (tidak untuk sesi "masuk sebagai")

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { sesiLengkapDariHeader } from "@/lib/sigapAkses";
import { muatSamakan, terapkanSamakan } from "@/lib/keu/samakanPenugasanDb";
import type { AksiSamakan } from "@/lib/keu/samakanPenugasan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const bulat = (x: unknown): number | null => {
  const n = Number(x);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const AKSI: readonly string[] = ["ubah_peran", "aktifkan", "cabut"];

function dbServer() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key) : null;
}

export async function GET(req: NextRequest) {
  try {
    const db = dbServer();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const sesi = sesiLengkapDariHeader(req.headers);
    if (!sesi) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const u = new URL(req.url);
    const ident = bulat(u.searchParams.get("ident"));
    const kegiatan = bulat(u.searchParams.get("kegiatan"));
    if (!ident || !kegiatan) return galat("Identifikasi atau kegiatan tidak valid.");
    const r = await muatSamakan(db, sesi.akunId, ident, kegiatan);
    if (!r.ok) return galat(r.pesan, r.status);
    return NextResponse.json({ selisih: r.selisih, peringatan: r.peringatan, final: r.final, lanjutan_ver: r.lanjutan_ver, boleh_terapkan: r.boleh_terapkan && sesi.aktorId === null });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = dbServer();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const sesi = sesiLengkapDariHeader(req.headers);
    if (!sesi) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (sesi.aktorId !== null) return galat("Mode masuk-sebagai hanya untuk melihat tampilan; tindakan ini tidak dijalankan.", 403);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const ident = bulat(body?.ident);
    const kegiatan = bulat(body?.kegiatan);
    if (!body || !ident || !kegiatan || !Array.isArray(body.pilihan)) return galat("Permintaan tidak valid.");
    if (body.pilihan.length === 0 || body.pilihan.length > 500) return galat("Pilih minimal satu perubahan (maksimal 500).");
    const pilihan: { akun_id: number; aksi: AksiSamakan }[] = [];
    for (const x of body.pilihan as Record<string, unknown>[]) {
      const akun = bulat(x?.akun_id);
      if (!akun || !AKSI.includes(String(x?.aksi))) return galat("Ada pilihan yang tidak valid.");
      pilihan.push({ akun_id: akun, aksi: String(x.aksi) as AksiSamakan });
    }
    const { data: pelaku } = await db.from("sigap_akun").select("nama").eq("id", sesi.akunId).maybeSingle();
    const r = await terapkanSamakan(db, sesi.akunId, (pelaku as { nama?: string } | null)?.nama ?? `Akun ${sesi.akunId}`, ident, kegiatan, pilihan);
    if (!r.ok) return galat(r.pesan, r.status);
    return NextResponse.json({ diterapkan: r.diterapkan, dilewati: r.dilewati, tanpa_atasan: r.tanpa_atasan, surat_perlu_terbit: r.surat_perlu_terbit });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
