// app/api/sigap/pelatihan/materi/route.ts
//
// (2 Nov 2026) Tahap C: materi tab Instrumen -- video belajar (dilacak sampai habis) dan tautan instrumen (dilacak sudah dibuka). Aturan murni: lib/sigapMateri.ts.
// Dibaca peserta pelatihan dan akun berizin lihat `pelatihan.kelola`; mengubah materi hanya izin kelola. Laporan progres hanya dari peserta.
//
// GET  -> { tersedia, boleh_kelola, bisa_lapor, materi:[{id,urutan,jenis,judul,url,youtube_id,durasi_detik,wajib,progres:{detik_unik,persen,selesai,manual}|null}], ringkasan:{wajib_total,wajib_selesai,belum,...} }
// POST peserta  {aksi:"lapor", materi_id, segmen:[[dari,sampai],...], durasi?}  -> { ok, progres, selesai_baru, dipangkas }
//               {aksi:"buka", materi_id}                                         -> { ok, progres }       (tautan)
//               {aksi:"manual", materi_id}                                       -> { ok, progres }       (video; cadangan, diberi tanda)
// POST pengelola {aksi:"simpan", id?, jenis, judul, url, durasi_detik?, wajib?, urutan?} -> { ok, id }
//                {aksi:"sembunyikan", id}                                                  -> { ok }

import { NextRequest, NextResponse } from "next/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan, pesertaPelatihan } from "@/lib/sigapTesDb";
import { PROGRES_KOSONG, periksaLaporan, periksaMateri, persenProgres, ringkasMateri, type Progres } from "@/lib/sigapMateri";
import { catatBuka, catatManual, laporPutar, muatMateri, muatProgresBatch, nonaktifkanMateri, simpanMateri } from "@/lib/sigapMateriDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

const ringkasProgres = (p: Progres, persen: number) => ({ detik_unik: p.detik_unik, persen, selesai: !!p.selesai_at, manual: p.selesai_manual });

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const [peserta, { izin }] = await Promise.all([pesertaPelatihan(db, akun.id, kegiatanId), izinAkun(db, akun.id)]);
    const lihat = boleh(izin, "pelatihan.kelola", "lihat", kegiatanId);
    if (!peserta && !lihat) return galat("Materi hanya untuk peserta pelatihan.", 403);
    const { tersedia, materi } = await muatMateri(db, kegiatanId);
    const progres = peserta && materi.length > 0 ? ((await muatProgresBatch(db, materi.map((m) => m.id), [akun.id])).get(akun.id) ?? new Map<number, Progres>()) : new Map<number, Progres>();
    return NextResponse.json({
      tersedia,
      boleh_kelola: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId),
      bisa_lapor: !!peserta,
      materi: materi.map((m) => {
        const p = progres.get(m.id) ?? null;
        return { id: m.id, urutan: m.urutan, jenis: m.jenis, judul: m.judul, url: m.url, youtube_id: m.youtube_id, durasi_detik: m.durasi_detik, wajib: m.wajib, progres: peserta ? ringkasProgres(p ?? PROGRES_KOSONG(), persenProgres(m, p)) : null };
      }),
      ringkasan: ringkasMateri(materi, progres),
    });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") return galat("Permintaan tidak valid.");
    const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const sekarang = Date.now();

    if (body.aksi === "lapor" || body.aksi === "buka" || body.aksi === "manual") {
      const peserta = await pesertaPelatihan(db, akun.id, kegiatanId);
      if (!peserta) return galat("Hanya peserta pelatihan yang dicatat progresnya.", 403);
      if (body.aksi === "lapor") {
        const v = periksaLaporan(body);
        if (!v.ok) return galat(v.pesan);
        const h = await laporPutar(db, kegiatanId, akun.id, v.laporan, sekarang);
        if (!h.ok) return galat(h.pesan, h.status ?? 500);
        return NextResponse.json({ ok: true, progres: { detik_unik: h.progres.detik_unik, selesai: !!h.progres.selesai_at, manual: h.progres.selesai_manual }, selesai_baru: h.selesai_baru, dipangkas: h.dipangkas, durasi: h.durasi });
      }
      const materiId = Number(body.materi_id);
      if (!Number.isInteger(materiId) || materiId <= 0) return galat("Materi tidak dikenal.");
      const h = body.aksi === "buka" ? await catatBuka(db, kegiatanId, akun.id, materiId, sekarang) : await catatManual(db, kegiatanId, akun.id, materiId, sekarang);
      if (!h.ok) return galat(h.pesan, h.status ?? 500);
      return NextResponse.json({ ok: true, progres: { detik_unik: h.progres.detik_unik, selesai: !!h.progres.selesai_at, manual: h.progres.selesai_manual } });
    }

    // ---- aksi pengelola ----
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, "pelatihan.kelola", "kelola", kegiatanId)) return galat("Tidak punya izin mengelola materi pelatihan.", 403);

    if (body.aksi === "simpan") {
      const v = periksaMateri(body);
      if (!v.ok) return galat(v.pesan);
      const h = await simpanMateri(db, kegiatanId, v.materi, akun.nama);
      if (!h.ok) return galat(h.pesan, h.status ?? 500);
      await catatAudit(db, akun.id, "pelatihan_materi_simpan", { kegiatan_id: kegiatanId, materi_id: h.id, jenis: v.materi.jenis, judul: v.materi.judul, wajib: v.materi.wajib });
      return NextResponse.json({ ok: true, id: h.id });
    }

    if (body.aksi === "sembunyikan") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) return galat("Materi tidak dikenal.");
      const h = await nonaktifkanMateri(db, kegiatanId, id);
      if (!h.ok) return galat(h.pesan, h.status ?? 500);
      await catatAudit(db, akun.id, "pelatihan_materi_sembunyikan", { kegiatan_id: kegiatanId, materi_id: id, judul: h.judul });
      return NextResponse.json({ ok: true });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
