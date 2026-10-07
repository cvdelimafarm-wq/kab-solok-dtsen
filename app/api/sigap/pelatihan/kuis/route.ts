// app/api/sigap/pelatihan/kuis/route.ts
//
// (7 Okt 2026) SIGAP > Pelatihan > Kuis Live -- sisi PESERTA (HP).
// GET                -> keadaan ruang (ringan; tanpa kunci selama soal berjalan). Dipoll ~1,5 dtk: cukup cek HMAC sesi.
// GET ?detail=1      -> + keadaan pribadi (sudah menjawab? poin, peringkat). Wajib peserta pelatihan.
// POST {aksi:"gabung"}                         -> bergabung ke ruang aktif (otomatis dari akun SIGAP)
// POST {aksi:"jawab", ruang_id, nomor, pilihan} -> kirim jawaban (satu kali per soal; waktu & poin dihitung server)

import { NextRequest, NextResponse } from "next/server";
import { sesiDariHeader } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan, pesertaPelatihan } from "@/lib/sigapTesDb";
import { catatJawaban, dariCache, gabungRuang, keadaanPeserta, ruangTerkini } from "@/lib/sigapKuisDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akunId = sesiDariHeader(req.headers);
    if (!akunId) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await dariCache("kegiatan", 60_000, () => idKegiatanPelatihan(db));
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const now = new Date();
    const ruang = await ruangTerkini(db, kegiatanId);
    if (!ruang) return NextResponse.json({ ada: false, sekarang: now.toISOString() });

    let pribadi: number | null = null;
    if (req.nextUrl.searchParams.get("detail") === "1") {
      const akun = await akunDariRequest(req, db);
      if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
      const p = await dariCache(`pes:${kegiatanId}:${akun.id}`, 60_000, () => pesertaPelatihan(db, akun.id, kegiatanId));
      if (!p) return galat("Akun ini bukan peserta pelatihan.", 403);
      pribadi = akun.id;
    }
    return NextResponse.json({ ada: true, ...(await keadaanPeserta(db, ruang, now, pribadi)) });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const body = await req.json().catch(() => null);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await dariCache("kegiatan", 60_000, () => idKegiatanPelatihan(db));
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const peserta = await dariCache(`pes:${kegiatanId}:${akun.id}`, 60_000, () => pesertaPelatihan(db, akun.id, kegiatanId));
    if (!peserta) return galat("Akun ini bukan peserta pelatihan.", 403);
    const aksi = String(body?.aksi ?? "");
    const now = new Date();

    if (aksi === "gabung") {
      const ruang = await ruangTerkini(db, kegiatanId);
      if (!ruang || ruang.status === "selesai") return galat("Belum ada kuis yang dibuka.", 409);
      await gabungRuang(db, akun.id, ruang);
      return NextResponse.json({ ok: true, ruang_id: ruang.id });
    }

    if (aksi === "jawab") {
      const ruangId = Number(body?.ruang_id);
      const nomor = Number(body?.nomor);
      if (!Number.isInteger(ruangId) || !Number.isInteger(nomor)) return galat("Data jawaban tidak valid.");
      const ruang = await ruangTerkini(db, kegiatanId); // cache 500 ms; ruang aktif milik kegiatan ini
      if (!ruang || ruang.id !== ruangId) return galat("Ruang tidak ditemukan.", 404);
      const h = await catatJawaban(db, akun.id, ruangId, nomor, String(body?.pilihan ?? ""), now);
      if (!h.ok) return galat(h.error, h.status);
      return NextResponse.json({ ok: true, sudah: h.sudah === true });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
