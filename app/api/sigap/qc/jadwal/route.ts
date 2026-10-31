// app/api/sigap/qc/jadwal/route.ts
//
// (26 Okt 2026) Push TERJADWAL QC Pemahaman Petugas -- dipanggil CRON Railway, bukan petugas. Satu cron untuk semua jadwal; route memutuskan sendiri
// apa yang jatuh tempo dari tabel sigap_qc_pengaturan (aturan di lib/sigapQc.ts#rencanaAksi, idempoten lewat sigap_qc_kirim):
//   rilis (jam rilis)            -> semua PML/PPL: "soal hari ini sudah dirilis"
//   ingat_petugas (+30, +50 mnt) -> yang belum selesai: "segera isi"
//   ingat_pml (+30, +50 mnt)     -> PML yang PPL-nya belum mengisi sama sekali
//   rekap_pml (jam rekap, pagi)  -> PML: nilai tim kemarin + soal yang salah + ajakan briefing ulang
//
// PEMANGGILAN (Railway Cron, jam cron UTC; tiap 5 menit, sepanjang hari):
//   POST /api/sigap/qc/jadwal?slot=auto        cron "*/5 * * * *"
//   Header:  Authorization: Bearer <SIGAP_CRON_SECRET>   (sama dengan pengingat-push; tanpa ini route menolak semua panggilan)
//   Uji kering (tidak mengklaim, tidak mengirim): tambahkan &uji=1 -> jumlah penerima per aksi yang SEDANG jatuh tempo.
// Perlu VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (lib/sigapPush.ts). Gagal kirim ke satu akun tidak menghentikan akun lain.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { dbPortal } from "@/lib/portal/server";
import { pushSiap } from "@/lib/sigapPush";
import { galatServer } from "@/lib/sigapGalat";
import { jalankanJadwal } from "@/lib/portal/qc";
import { catatDenyut } from "@/lib/portal/pushTerkelola"; // (31 Okt 2026) denyut cron untuk kartu kesehatan di Kelola > Notifikasi

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function rahasiaBenar(req: NextRequest): boolean | "belum_diset" {
  const rahasia = process.env.SIGAP_CRON_SECRET;
  if (!rahasia || rahasia.length < 16) return "belum_diset";
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(rahasia);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function jalankan(req: NextRequest) {
  const auth = rahasiaBenar(req);
  if (auth === "belum_diset") return NextResponse.json({ error: "SIGAP_CRON_SECRET belum diset di server (minimal 16 karakter)." }, { status: 503 });
  if (!auth) return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  const db = dbPortal();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY belum diset." }, { status: 500 });
  const uji = req.nextUrl.searchParams.get("uji") === "1";
  if (!uji && !pushSiap()) return NextResponse.json({ error: "Kunci VAPID belum dipasang di server." }, { status: 503 });
  const slot = req.nextUrl.searchParams.get("slot");
  if (slot !== null && slot !== "auto") return NextResponse.json({ error: "slot harus auto." }, { status: 400 });
  try {
    const hasil = await jalankanJadwal(db, Date.now(), uji);
    if (!uji) await catatDenyut(db, "qc", { kegiatan: hasil.length });
    return NextResponse.json({ ok: true, hasil });
  } catch (e) {
    return galatServer("[api/sigap/qc/jadwal]", e, "Gagal menjalankan jadwal QC.");
  }
}

export const POST = jalankan;
export const GET = jalankan;
