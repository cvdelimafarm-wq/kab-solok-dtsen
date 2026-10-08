// app/api/sigap/ping/route.ts
//
// (8 Okt 2026) Pemantauan pemasangan aplikasi SIGAP -- dipanggil otomatis saat SIGAP dibuka oleh akun yang sudah masuk (dibatasi di sisi HP: tiap 30 menit).
// POST (Bearer sesi) { mode:"aplikasi"|"browser", platform?:"android"|"ios"|"lain" } -> { ok }
// mode "aplikasi" = dibuka dari ikon layar utama (standalone) -> terpasang. Dilihat panitia di Kelola Pelatihan > Notifikasi.

import { NextRequest, NextResponse } from "next/server";
import { akunDariRequest, dbAdmin } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const PLATFORM = new Set(["android", "ios", "lain"]);

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir.", 401);
    const body = await req.json().catch(() => null);
    const mode = String(body?.mode ?? "");
    if (mode !== "aplikasi" && mode !== "browser") return galat("Mode tidak dikenal.");
    const platform = PLATFORM.has(String(body?.platform ?? "")) ? String(body.platform) : "lain";
    const sekarang = new Date().toISOString();
    const { data: ada } = await db.from("sigap_aplikasi_pakai").select("pertama_aplikasi_at").eq("akun_id", akun.id).maybeSingle();
    const baris: Record<string, unknown> =
      mode === "aplikasi"
        ? { akun_id: akun.id, platform, terpasang: true, terakhir_aplikasi_at: sekarang, pertama_aplikasi_at: (ada?.pertama_aplikasi_at as string | null) ?? sekarang, diperbarui_at: sekarang }
        : { akun_id: akun.id, platform, terakhir_browser_at: sekarang, diperbarui_at: sekarang };
    const { error } = await db.from("sigap_aplikasi_pakai").upsert(baris, { onConflict: "akun_id" });
    if (error) return galat(error.message, 500);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
