// app/api/sigap/pelatihan/kelas/route.ts
//
// (1 Nov 2026) Kelas pelatihan menurut perencanaan (identifikasi lanjutan yang tertaut ke kegiatan): mode Daring/Luring/Hybrid, jadwal, tempat. HANYA BACA.
// Tanpa tautan identifikasi <-> kegiatan, semua jawaban { tersambung: false } dan layar tidak berubah. Logika: lib/sigapKelasIdent.ts, lib/portal/kelasIdent.ts.
//
// GET ?mode=peserta (bawaan) -> { tersedia, tersambung, cara, kelas, kandidat, aturan }   (peserta pelatihan)
// GET ?mode=admin            -> { tersambung, ident, kelas[+peserta], tanpa_kelas, di_luar, peringatan, kegiatan{tanggal_mulai,tanggal_selesai}, periode_rencana, banding_periode }   (izin pelatihan.kelola lihat)

import { NextRequest, NextResponse } from "next/server";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, FILTER_BUKAN_ADMINISTRASI, idKegiatanPelatihan } from "@/lib/sigapTesDb";
import { muatKelasTertaut } from "@/lib/portal/kelasIdent";
import { aturanMode, bandingPeriode, kelasUntukPeserta, periodeKelas, peringatanKelas, sebaranDenganPeran } from "@/lib/sigapKelasIdent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariRequest(req, db);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  const mode = req.nextUrl.searchParams.get("mode") ?? "peserta";

  if (mode === "admin") {
    const kegiatanId = await idKegiatanPelatihan(db, req);
    if (!kegiatanId) return galat("Pelatihan tidak ditemukan.", 404);
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, "pelatihan.kelola", "lihat", kegiatanId)) return galat("Tidak punya izin melihat kelas pelatihan.", 403);
    const tertaut = await muatKelasTertaut(db, kegiatanId, true);
    const { data: pen } = await db.from("sigap_penugasan").select("peran, kelas").eq("kegiatan_id", kegiatanId).eq("aktif", true).or(FILTER_BUKAN_ADMINISTRASI).limit(5000);
    const peserta = ((pen ?? []) as { peran: string; kelas: number | null }[]).map((r) => ({ peran: String(r.peran), kelas: r.kelas === null || r.kelas === undefined ? null : Number(r.kelas) }));
    const sebar = sebaranDenganPeran(tertaut.kelas, peserta);
    const { data: keg } = await db.from("sigap_kegiatan").select("tanggal_mulai, tanggal_selesai").eq("id", kegiatanId).maybeSingle();
    const tgl = { tanggal_mulai: (keg?.tanggal_mulai as string | null | undefined) ?? null, tanggal_selesai: (keg?.tanggal_selesai as string | null | undefined) ?? null };
    const rencana = periodeKelas(tertaut.kelas);
    return NextResponse.json({
      kegiatan_id: kegiatanId,
      tersambung: tertaut.tersambung,
      ident: tertaut.ident_id === null ? null : { id: tertaut.ident_id, nama: tertaut.ident_nama, status_lanjutan: tertaut.status_lanjutan, versi: tertaut.versi },
      kelas: tertaut.kelas.map((k) => ({ ...k, aturan: aturanMode(k.metode), peserta: sebar.per_kelas.get(k.nomor) ?? 0 })),
      jumlah_peserta: peserta.length,
      tanpa_kelas: sebar.tanpa_kelas,
      otomatis: sebar.otomatis,
      di_luar: sebar.di_luar,
      peringatan: peringatanKelas(tertaut.kelas),
      kegiatan: tgl,
      periode_rencana: rencana,
      banding_periode: rencana ? bandingPeriode(rencana, { mulai: tgl.tanggal_mulai, selesai: tgl.tanggal_selesai }) : null,
    });
  }

  const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
  if (!kegiatanId) return NextResponse.json({ tersedia: false, tersambung: false });
  const { data: pen } = await db.from("sigap_penugasan").select("peran, kelas").eq("akun_id", akun.id).eq("kegiatan_id", kegiatanId).eq("aktif", true).or(FILTER_BUKAN_ADMINISTRASI).limit(1);
  const mine = ((pen ?? []) as { peran: string; kelas: number | null }[])[0];
  if (!mine) return NextResponse.json({ tersedia: false, tersambung: false });
  const tertaut = await muatKelasTertaut(db, kegiatanId, true);
  if (!tertaut.tersambung || tertaut.kelas.length === 0) return NextResponse.json({ tersedia: true, tersambung: false });
  const hasil = kelasUntukPeserta(tertaut.kelas, String(mine.peran), mine.kelas === null || mine.kelas === undefined ? null : Number(mine.kelas));
  return NextResponse.json({
    tersedia: true,
    tersambung: true,
    peran: mine.peran,
    cara: hasil.cara,
    kelas: hasil.kelas,
    kandidat: hasil.kandidat,
    aturan: hasil.kelas ? aturanMode(hasil.kelas.metode) : null,
  });
}
