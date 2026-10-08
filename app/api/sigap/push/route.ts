// app/api/sigap/push/route.ts
//
// (8 Okt 2026) Notifikasi push SIGAP -- sisi perangkat peserta (siapa pun yang sudah masuk).
// GET  (Bearer sesi)                      -> { siap, publik, perangkat }   (siap = kunci VAPID terpasang di server; perangkat = jumlah perangkat aktif akun ini)
// POST { aksi:"daftar", langganan, perangkat? } -> { ok }   simpan/perbarui langganan perangkat ini (endpoint yang sama dipindah ke akun yang sedang masuk)
// POST { aksi:"batal", endpoint }               -> { ok }   matikan langganan perangkat ini (hanya milik akun sendiri; baris tidak dihapus)
// POST { aksi:"uji" }                           -> { ok, terkirim, perangkat }   kirim notifikasi uji ke perangkat akun sendiri

import { NextRequest, NextResponse } from "next/server";
import { ringkasPerangkat } from "@/lib/sigapLog";
import { kirimKeAkun, kunciPublikPush, pushSiap } from "@/lib/sigapPush";
import { MAKS_PERANGKAT_PER_AKUN, endpointAman, validasiLangganan } from "@/lib/sigapPushUtil";
import { akunDariRequest, dbAdmin } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const terakhirUji = new Map<number, number>();

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariRequest(req, db);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  const { count } = await db.from("sigap_push_langganan").select("id", { count: "exact", head: true }).eq("akun_id", akun.id).eq("aktif", true);
  return NextResponse.json({ siap: pushSiap(), publik: kunciPublikPush(), perangkat: count ?? 0 });
}

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const body = await req.json().catch(() => null);
    const aksi = String(body?.aksi ?? "");

    if (aksi === "daftar") {
      if (!pushSiap()) return galat("Notifikasi belum diaktifkan di server.", 503);
      const v = validasiLangganan(body?.langganan);
      if (!v.ok) return galat(v.pesan, 422);
      const sekarang = new Date().toISOString();
      const nama = typeof body?.perangkat === "string" && body.perangkat.trim() ? body.perangkat.trim().slice(0, 120) : ringkasPerangkat(req.headers.get("user-agent"));
      const { error } = await db
        .from("sigap_push_langganan")
        .upsert({ akun_id: akun.id, endpoint: v.nilai.endpoint, p256dh: v.nilai.p256dh, auth: v.nilai.auth, perangkat: nama, aktif: true, gagal: 0, diperbarui_at: sekarang }, { onConflict: "endpoint" });
      if (error) return galat(error.message, 500);
      // batasi jumlah perangkat aktif per akun: yang terlama dinonaktifkan
      const { data } = await db.from("sigap_push_langganan").select("id").eq("akun_id", akun.id).eq("aktif", true).order("diperbarui_at", { ascending: false });
      const lebih = (data ?? []).slice(MAKS_PERANGKAT_PER_AKUN).map((x) => x.id as number);
      if (lebih.length) await db.from("sigap_push_langganan").update({ aktif: false, diperbarui_at: sekarang }).in("id", lebih);
      return NextResponse.json({ ok: true });
    }

    if (aksi === "batal") {
      if (!endpointAman(body?.endpoint)) return galat("Alamat perangkat tidak valid.", 422);
      await db.from("sigap_push_langganan").update({ aktif: false, diperbarui_at: new Date().toISOString() }).eq("endpoint", body.endpoint).eq("akun_id", akun.id);
      return NextResponse.json({ ok: true });
    }

    if (aksi === "uji") {
      if (!pushSiap()) return galat("Notifikasi belum diaktifkan di server.", 503);
      const t = terakhirUji.get(akun.id) ?? 0;
      if (Date.now() - t < 15_000) return galat("Tunggu beberapa detik sebelum mengirim uji lagi.", 429);
      terakhirUji.set(akun.id, Date.now());
      const h = await kirimKeAkun(db, [akun.id], { judul: "Notifikasi SIGAP aktif", isi: `Halo ${akun.nama.split(",")[0]}, ini notifikasi uji. Bila Anda membacanya, notifikasi berfungsi.`, url: "/", tag: "uji" });
      if (h.perangkat === 0) return galat("Belum ada perangkat yang terdaftar untuk akun ini. Aktifkan notifikasi dulu.", 409);
      return NextResponse.json({ ok: true, terkirim: h.terkirim, perangkat: h.perangkat });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
