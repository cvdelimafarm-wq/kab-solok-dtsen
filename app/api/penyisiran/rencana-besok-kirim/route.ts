// app/api/penyisiran/rencana-besok-kirim/route.ts
//
// Catat bahwa petugas (PPL) SUDAH "mengirim rencana besok" ke PML -- dipakai
// kartu #1 "Monitoring Penyisiran Sensus Ekonomi 2026" (kolom "Kirim Rencana
// Besok", permintaan user) utk menampilkan status sudah/belum per PPL.
// Upsert ke tabel penyisiran_rencana_besok_kirim (migrasi
// 20260921c_rencana_besok_kirim_status.sql) -- klik berulang utk
// tanggal_kirim yg sama TIDAK bikin baris ganda (primary key
// petugas_id+tanggal_kirim), cuma perbarui waktu & metodenya.
//
// DUA jalur pemicu (permintaan user, "data Kirim Rencana Besok bisa lwat
// copy rencana di kartu monitoring di atas atau lwat float bar di bawah"):
//  1) kirimKeWaPml() (FloatBarRencanaBesok, app/penyisiran/page.tsx) begitu
//     Web Share API BERHASIL ATAU gambar berhasil disalin ke clipboard --
//     TIDAK mengirim tanggal_rencana (default: besok, sesuai perilaku lama).
//  2) salinSebagaiGambar() (ModalRencanaBesok, app/seruti/penyisiran-usaha.tsx,
//     dibuka dari kartu "📅 Dijadwalkan Besok") -- mengirim tanggal_rencana =
//     tanggal yg SEDANG DITAMPILKAN di modal itu (bisa hari lain, bukan cuma
//     besok, krn modal punya navigasi tanggal) -- shg PPL yg susulan
//     menyalin rencana utk tanggal yg terlewat tetap tercatat "sudah kirim"
//     utk tanggal ITU, bukan hari ini.
// tanggal_kirim SELALU diturunkan dari tanggal_rencana (tanggal_kirim =
// tanggal_rencana - 1 hari) -- bukan dari "hari ini" -- supaya jalur (2)
// dgn tanggal_rencana lampau/lain tetap tercatat pd tanggal_kirim yg benar
// (bukan malah tercatat sbg "kirim hari ini"). Kalau body TIDAK menyertakan
// tanggal_rencana (jalur 1), defaultnya besok -- shg tanggal_kirim = hari
// ini, PERSIS perilaku lama.
//
// HANYA role "penyisiran_petugas" (login personal) yg boleh memanggil ini,
// & petugas_id SELALU diambil dari SESI (subject token), TIDAK dari body --
// supaya seorang PPL tidak bisa menandai "sudah kirim" utk PPL lain.
//
// Kegagalan endpoint ini SENGAJA tidak mengganggu alur kirim/salin gambar
// yg sudah berjalan (dipanggil "fire and forget" dari FE) -- sekadar
// bookkeeping monitoring, bukan bagian inti fitur kirim/salin gambar.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, getSessionSubject, extractBearer } from "@/lib/penyisiranAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// SAMA PERSIS dgn formula di /api/penyisiran/rencana-besok & /api/penyisiran/
// monitoring-kinerja-hari-ini -- diulang di sini (bukan diekspor bersama,
// cuma beberapa baris) krn Next.js App Router MELARANG route.ts mengekspor
// apa pun selain handler HTTP & const konfigurasi resmi.
function tanggalBesokJakarta(): string {
  const jakartaMs = Date.now() + 7 * 60 * 60 * 1000;
  const jakarta = new Date(jakartaMs);
  jakarta.setUTCDate(jakarta.getUTCDate() + 1);
  return jakarta.toISOString().slice(0, 10);
}
// Tanggal (ISO "YYYY-MM-DD") sehari SEBELUM iso -- dihitung murni sbg
// tanggal kalender (bukan lewat timezone lokal server) supaya aman dipakai
// utk iso apa pun yg dikirim FE, bukan cuma "besok".
function tanggalSebelumnya(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
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

  // tanggal_rencana opsional dari body (dipakai ModalRencanaBesok saat
  // menyalin rencana utk tanggal selain besok) -- kalau tidak ada/tidak
  // valid, default besok (perilaku lama, dipakai FloatBar). tanggal_kirim
  // SELALU diturunkan dari tanggal_rencana (lihat komentar header file).
  const tanggalRencanaRaw = typeof body?.tanggal_rencana === "string" ? body.tanggal_rencana : "";
  const tanggalRencanaValid =
    /^\d{4}-\d{2}-\d{2}$/.test(tanggalRencanaRaw) && !Number.isNaN(Date.parse(tanggalRencanaRaw));
  const tanggalRencana = tanggalRencanaValid ? tanggalRencanaRaw : tanggalBesokJakarta();
  const tanggalKirim = tanggalSebelumnya(tanggalRencana);

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
