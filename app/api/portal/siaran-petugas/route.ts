// app/api/portal/siaran-petugas/route.ts
//
// (13 Okt 2026) Siaran ke petugas pendataan: notifikasi push + modal pengumuman yang cukup dikonfirmasi sekali -- permintaan user.
// GET  (Bearer <sesi>)            -> { pengumuman: [...] }  modal yang berlaku & belum dikonfirmasi akun ini (petugas lapangan / admin)
// GET  ?ringkas=1                 -> { push_siap, penerima, berlangganan, riwayat[] }  (admin bencana.admin)
// POST { aksi:"baca", id, versi } -> catat konfirmasi (diabaikan pada sesi "masuk sebagai")
// POST { aksi:"siarkan", kirim_push, judul, isi, url?, modal:{aktif,judul,isi,jenis} }  -> admin bencana.admin level kelola

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aksesRekap } from "@/lib/portal/rekapIdentifikasi";
import { catatBaca, modalUntukAkun, ringkasSiaran, siarkan } from "@/lib/portal/siaranPetugas";
import { aktorDariHeader, boleh, izinAkun } from "@/lib/sigapAkses";
import { validasiSiaran } from "@/lib/siaranPetugas";
import { kirimKeAkun, pushSiap } from "@/lib/sigapPush";
import { urlInternalAman, validasiPesanPush } from "@/lib/sigapPushUtil";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  try {
    if (new URL(req.url).searchParams.get("ringkas") === "1") {
      const { izin } = await izinAkun(db, akun.id);
      if (!boleh(izin, "bencana.admin", "lihat")) return galat("Khusus admin pendataan.", 403);
      return NextResponse.json({ ...(await ringkasSiaran(db)), boleh_kirim: boleh(izin, "bencana.admin", "kelola") });
    }
    const akses = await aksesRekap(db, akun);
    if (!akses.boleh) return NextResponse.json({ pengumuman: [] });
    return NextResponse.json({ pengumuman: await modalUntukAkun(db, akun.id) });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    if (body?.aksi === "baca") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0 || typeof body.versi !== "string") return galat("Permintaan tidak sah.");
      if (!aktorDariHeader(req.headers)) await catatBaca(db, akun.id, id, body.versi);
      return NextResponse.json({ ok: true });
    }
    if (body?.aksi === "uji") {
      // uji notifikasi: HANYA ke perangkat akun pengirim sendiri (bukan ke petugas); tidak dicatat sebagai siaran
      if (aktorDariHeader(req.headers)) return galat('Uji notifikasi tidak dapat dikirim saat mode "masuk sebagai": notifikasi akan masuk ke HP petugas itu. Kembali ke akun Anda dulu.', 403);
      const { izin } = await izinAkun(db, akun.id);
      if (!boleh(izin, "bencana.admin", "kelola")) return galat("Tidak punya izin mengirim uji notifikasi pendataan.", 403);
      if (!pushSiap()) return galat("Pengiriman notifikasi belum aktif: kunci VAPID belum dipasang di server.", 503);
      const url = urlInternalAman(body.url);
      if (url === null) return galat("Tautan tujuan notifikasi tidak sah.", 422);
      const v = validasiPesanPush({ judul: body.judul, isi: body.isi, url });
      if (!v.ok) return galat(v.pesan, 422);
      const h = await kirimKeAkun(db, [akun.id], { ...v.nilai, judul: `[UJI] ${v.nilai.judul}`.slice(0, 80), tag: "uji-siaran-pendataan" });
      return NextResponse.json({ ok: true, perangkat: h.perangkat, terkirim: h.terkirim, gagal: h.gagal });
    }
    if (body?.aksi === "siarkan") {
      if (aktorDariHeader(req.headers)) return galat("Siaran tidak dapat dikirim saat mode \"masuk sebagai\".", 403);
      const { izin } = await izinAkun(db, akun.id);
      if (!boleh(izin, "bencana.admin", "kelola")) return galat("Tidak punya izin mengirim siaran pendataan.", 403);
      const v = validasiSiaran(body);
      if (!v.ok) return galat(v.pesan, 422);
      const h = await siarkan(db, { id: akun.id }, v.nilai);
      if ("galat" in h) return galat(h.galat, h.status);
      return NextResponse.json({ ok: true, ...h });
    }
    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
