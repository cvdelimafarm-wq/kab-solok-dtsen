// app/api/penyisiran/rencana-besok-kirim/route.ts
//
// Catat bahwa petugas (PPL) SUDAH menekan "📤 Kirim ke WA PML"
// (FloatBarRencanaBesok, app/penyisiran/page.tsx) HARI INI -- dipakai kartu
// #1 "Monitoring Penyisiran Sensus Ekonomi 2026" (kolom baru "Kirim Rencana
// Besok", permintaan user) utk menampilkan status sudah/belum per PPL.
// Upsert ke tabel penyisiran_rencana_besok_kirim (migrasi
// 20260921c_rencana_besok_kirim_status.sql) -- klik berulang di hari yg
// sama TIDAK bikin baris ganda (primary key petugas_id+tanggal_kirim),
// cuma perbarui waktu & metodenya.
//
// HANYA role "penyisiran_petugas" (login personal) yg boleh memanggil ini,
// & petugas_id SELALU diambil dari SESI (subject token), TIDAK dari body --
// supaya seorang PPL tidak bisa menandai "sudah kirim" utk PPL lain.
//
// Dipanggil dari kirimKeWaPml() (page.tsx) begitu Web Share API (JALUR 1)
// BERHASIL ATAU gambar berhasil disalin ke clipboard (JALUR 2 fallback) --
// bukan sekadar tombol ditekan. Kegagalan endpoint ini SENGAJA tidak
// mengganggu alur kirim/salin gambar yg sudah berjalan (dipanggil "fire and
// forget" dari FE) -- sekadar bookkeeping monitoring, bukan bagian inti
// fitur kirim gambar.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SAMA PERSIS dgn formula di /api/penyisiran/rencana-besok & /api/penyisiran/
// monitoring-kinerja-hari-ini -- diulang di sini (bukan diekspor bersama,
// cuma beberapa baris) krn Next.js App Router MELARANG route.ts mengekspor
// apa pun selain handler HTTP & const konfigurasi resmi.
function tanggalHariIniJakarta(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}
function tanggalBesokJakarta(): string {
  const jakartaMs = Date.now() + 7 * 60 * 60 * 1000;
  const jakarta = new Date(jakartaMs);
  jakarta.setUTCDate(jakarta.getUTCDate() + 1);
  return jakarta.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const token = extractBearer(req);
  if (!verifySession(token, "penyisiran_petugas")) {
    return NextResponse.json({ error: "Sesi tidak valid / kedaluwarsa." }, { status: 401 });
  }
  const petugasId = Number(getSessionSubject(token));
  if (!Number.isFinite(petugasId) || petugasId <= 0) {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const metode = body?.metode === "share" ? "share" : "salin";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const tanggalKirim = tanggalHariIniJakarta();
  const tanggalRencana = tanggalBesokJakarta();

  const { error } = await supabase.from("penyisiran_rencana_besok_kirim").upsert(
    {
      petugas_id: petugasId,
      tanggal_kirim: tanggalKirim,
      tanggal_rencana: tanggalRencana,
      metode,
      terkirim_at: new Date().toISOString(),
    },
    { onConflict: "petugas_id,tanggal_kirim" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, tanggal_kirim: tanggalKirim });
}
