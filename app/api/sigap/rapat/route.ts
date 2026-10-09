// app/api/sigap/rapat/route.ts
//
// (9 Okt 2026) SIGAP -- presensi rapat Zoom untuk petugas (modal di aplikasi). Permintaan user: tekan "Hadir" + wajib mengetik token rapat.
// GET  (Authorization: Bearer <sesi>) -> { rapat: {id, judul, mulai_at, selesai_at, buka_at, tutup_at, tautan, meeting_id, passcode, status, hadir_at} | null, sekarang }
//      Hanya rapat aktif yang menyasar akun ini. TOKEN TIDAK PERNAH dikirim.
// POST {rapat_id, token} -> { ok:true, hadir_at } atau galat dgn { error, kode }
//      Diperiksa di server: sasaran, jendela waktu, token (tak peka huruf besar/kecil), batas 5 salah / 10 menit. Satu hadir per petugas per rapat.

import { NextRequest, NextResponse } from "next/server";
import { BATAS_SALAH, JENDELA_SALAH_MS, bolehHadir, cocokToken, keBentukPetugas, pilihRapat } from "@/lib/sigapRapat";
import { akunSasaran, hadirAkun, muatRapat, muatRapatAktif } from "@/lib/sigapRapatDb";
import { akunDariRequest, dbAdmin } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400, ekstra: Record<string, unknown> = {}) => NextResponse.json({ error: pesan, ...ekstra }, { status });

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const sekarang = Date.now();
    const kandidat = [];
    for (const r of await muatRapatAktif(db)) if (await akunSasaran(db, akun.id, r)) kandidat.push(r);
    const r = pilihRapat(kandidat, sekarang);
    if (!r) return NextResponse.json({ rapat: null, sekarang: new Date(sekarang).toISOString() });
    return NextResponse.json({ rapat: keBentukPetugas(r, await hadirAkun(db, r.id, akun.id), sekarang), sekarang: new Date(sekarang).toISOString() });
  } catch (e) {
    // gagal baca (mis. tabel belum ada) tidak boleh mengganggu beranda: tanpa modal
    return NextResponse.json({ rapat: null, sekarang: new Date().toISOString(), catatan: e instanceof Error ? e.message : "galat" });
  }
}

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const body = await req.json().catch(() => null);
    const rapatId = Number(body?.rapat_id);
    if (!Number.isInteger(rapatId)) return galat("Rapat tidak valid.");
    const r = await muatRapat(db, rapatId);
    if (!r || !r.aktif) return galat("Rapat tidak ditemukan atau tidak aktif.", 404);
    if (!(await akunSasaran(db, akun.id, r))) return galat("Akun Anda bukan sasaran presensi rapat ini.", 403, { kode: "bukan_sasaran" });

    const sudah = await hadirAkun(db, r.id, akun.id);
    if (sudah) return NextResponse.json({ ok: true, sudah: true, hadir_at: sudah });

    const sekarang = Date.now();
    const izin = bolehHadir(r, false, sekarang);
    if (!izin.ok) return galat(izin.pesan, 422, { kode: izin.kode });

    // batas percobaan salah
    const sejak = new Date(sekarang - JENDELA_SALAH_MS).toISOString();
    const { count } = await db.from("sigap_rapat_coba").select("id", { count: "exact", head: true }).eq("rapat_id", r.id).eq("akun_id", akun.id).eq("ok", false).gte("at", sejak);
    if ((count ?? 0) >= BATAS_SALAH) return galat("Terlalu banyak token salah. Tunggu beberapa menit lalu coba lagi, atau tanyakan token ke panitia.", 429, { kode: "dibatasi" });

    if (!cocokToken(body?.token, r.token)) {
      await db.from("sigap_rapat_coba").insert({ rapat_id: r.id, akun_id: akun.id, ok: false });
      const sisa = Math.max(0, BATAS_SALAH - 1 - (count ?? 0));
      return galat(`Token salah. Cek token yang diumumkan di rapat Zoom (sisa ${sisa} percobaan).`, 422, { kode: "token_salah", sisa });
    }

    const hadirAt = new Date(sekarang).toISOString();
    const { error } = await db.from("sigap_rapat_hadir").insert({ rapat_id: r.id, akun_id: akun.id, hadir_at: hadirAt, sumber: "mandiri" });
    if (error) {
      // dua permintaan bersamaan: yang kedua kena unik -> anggap sudah hadir
      const ulang = await hadirAkun(db, r.id, akun.id);
      if (ulang) return NextResponse.json({ ok: true, sudah: true, hadir_at: ulang });
      return galat(error.message, 500);
    }
    await db.from("sigap_rapat_coba").insert({ rapat_id: r.id, akun_id: akun.id, ok: true });
    return NextResponse.json({ ok: true, sudah: false, hadir_at: hadirAt });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
