// app/api/sigap/pelatihan/ketentuan/route.ts
//
// (2 Nov 2026) Pelatihan 5 tab: kartu undangan + ketentuan + jawaban terima/tolak.
//
// GET  (Bearer sesi; ?kegiatan=ID opsional) -> { kegiatan_id, tab_baru, ketentuan:{butir,versi}, undangan:{hari_tanggal,pukul,tempat,tanggal_iso,pdf},
//        peserta:{peran,kelas}|null, respons, status, berubah, kartu:{judul,ket,tombol,nada}, kamera_href|null, boleh_kelola }
// POST {aksi:"respons", respons:"terima"|"tolak", alasan?}       (peserta)  -> { ok, status }
// POST {aksi:"simpan", butir?:string[], tab_baru?:boolean}       (izin pelatihan.kelola = kelola) -> { ok, ketentuan }
//
// SQL 20261102zi belum dijalankan -> tab_baru false, butir kosong; GET tetap 200 sehingga layar lama tidak terganggu.

import { NextRequest, NextResponse } from "next/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan, pesertaPelatihan, undanganUntuk } from "@/lib/sigapTesDb";
import { ketentuanBerubah, periksaRespons, statusUndangan, teksKartuUndangan } from "@/lib/ketentuanPelatihan";
import { muatKetentuan, muatRespons, simpanKetentuan, simpanRespons } from "@/lib/sigapPelatihanBaruDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const [ketentuan, undangan, peserta, { izin }] = await Promise.all([
      muatKetentuan(db, kegiatanId),
      undanganUntuk(db, kegiatanId),
      pesertaPelatihan(db, akun.id, kegiatanId),
      izinAkun(db, akun.id),
    ]);
    const respons = peserta ? await muatRespons(db, kegiatanId, akun.id) : null;
    const status = statusUndangan(respons);
    const berubah = ketentuanBerubah(respons, ketentuan);
    let kameraHref: string | null = null;
    if (peserta) {
      const { data } = await db.from("sigap_akun").select("token").eq("id", akun.id).maybeSingle();
      const token = (data?.token as string | undefined) ?? null;
      kameraHref = token ? `/sigap/translok/${token}` : null;
    }
    return NextResponse.json({
      kegiatan_id: kegiatanId,
      tab_baru: ketentuan.tab_baru,
      ketentuan: { butir: ketentuan.butir, versi: ketentuan.versi },
      undangan: { hari_tanggal: undangan.hari_tanggal, pukul: undangan.pukul, tempat: undangan.tempat, tanggal_iso: undangan.tanggal_iso, pdf: undangan.pdf },
      peserta,
      respons,
      status,
      berubah,
      kartu: teksKartuUndangan(status, berubah),
      kamera_href: kameraHref,
      boleh_lihat_kelola: boleh(izin, "pelatihan.kelola", "lihat", kegiatanId),
      boleh_kelola: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId),
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

    if (body.aksi === "respons") {
      const peserta = await pesertaPelatihan(db, akun.id, kegiatanId);
      if (!peserta) return galat("Anda bukan peserta pelatihan ini.", 403);
      const v = periksaRespons(body);
      if (!v.ok) return galat(v.pesan);
      const ketentuan = await muatKetentuan(db, kegiatanId);
      const hasil = await simpanRespons(db, kegiatanId, akun.id, v.respons, v.alasan, ketentuan.versi);
      if (!hasil.ok) return galat(hasil.pesan, 500);
      return NextResponse.json({ ok: true, status: v.respons === "terima" ? "diterima" : "ditolak" });
    }

    if (body.aksi === "simpan") {
      const { izin } = await izinAkun(db, akun.id);
      if (!boleh(izin, "pelatihan.kelola", "kelola", kegiatanId)) return galat("Tidak punya izin mengelola pelatihan.", 403);
      if (body.butir !== undefined && !Array.isArray(body.butir)) return galat("Daftar ketentuan tidak valid.");
      if (body.tab_baru !== undefined && typeof body.tab_baru !== "boolean") return galat("Pengaturan tab baru tidak valid.");
      const hasil = await simpanKetentuan(db, kegiatanId, { butir: body.butir, tab_baru: body.tab_baru }, akun.nama);
      if (!hasil.ok) return galat(hasil.pesan, 500);
      await catatAudit(db, akun.id, "pelatihan_ketentuan_simpan", { kegiatan_id: kegiatanId, tab_baru: hasil.ketentuan.tab_baru, versi: hasil.ketentuan.versi, jumlah_butir: hasil.ketentuan.butir.length });
      return NextResponse.json({ ok: true, ketentuan: hasil.ketentuan });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
