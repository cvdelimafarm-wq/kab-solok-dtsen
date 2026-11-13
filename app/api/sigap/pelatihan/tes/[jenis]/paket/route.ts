// app/api/sigap/pelatihan/tes/[jenis]/paket/route.ts
//
// (14 Nov 2026, luring 3b) Paket soal TERSANDI untuk dikerjakan tanpa sinyal (keputusan Iqbal 14 Nov).
// GET ?versi=X -> { boleh:false, alasan } di luar jendela unduh (H-1 s.d. tes ditutup);
//               { sama:true, versi } bila HP sudah memegang versi yang sama (tanpa menyandikan ulang);
//               { paket } selain itu. Paket berisi soal TANPA kunci jawaban, tersandi dengan sandi A tes (dibacakan instruktur).
// Hak sama dengan halaman tes: peserta terdaftar yang sudah menerima undangan. Hanya membaca (kecuali membuat sandi A sekali bila belum ada).

import { NextRequest, NextResponse } from "next/server";
import { TUBUH_GERBANG } from "@/lib/gerbangUndangan";
import { periksaGerbang } from "@/lib/sigapPelatihanBaruDb";
import { jenisTesValid } from "@/lib/sigapTes";
import { terapkanAgendaPeserta } from "@/lib/sigapAgendaDb";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan, muatSoal, muatTes, pesertaPelatihan } from "@/lib/sigapTesDb";
import { bolehUnduh, versiSoal } from "@/lib/sigapTesLuring";
import { catatPaketDipegang, susunPaketTes } from "@/lib/sigapTesLuringDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
type Ctx = { params: Promise<{ jenis: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const db = dbAdmin();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const { jenis } = await ctx.params;
    if (!jenisTesValid(jenis)) return galat("Jenis tes tidak dikenal.", 404);
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const tes = await muatTes(db, kegiatanId, jenis);
    if (!tes || !tes.aktif) return NextResponse.json({ boleh: false, alasan: "Tes belum tersedia." });
    const peserta = await pesertaPelatihan(db, akun.id, kegiatanId);
    if (!peserta) return galat("Akun Anda tidak terdaftar sebagai peserta pelatihan ini.", 403);
    if ((await periksaGerbang(db, kegiatanId, akun.id)) !== "boleh") return NextResponse.json(TUBUH_GERBANG, { status: 403 });
    if (!bolehUnduh(tes.buka_at, tes.tutup_at, Date.now())) return NextResponse.json({ boleh: false, alasan: "Paket luring tersedia mulai H-1 sampai tes ditutup." });
    const soal = await muatSoal(db, tes.id);
    if (soal.length === 0) return NextResponse.json({ boleh: false, alasan: "Soal belum tersedia." });
    const versiHp = req.nextUrl.searchParams.get("versi") ?? "";
    const versi = await versiSoal(soal.map((s) => ({ nomor: s.nomor, teks: s.teks, opsi: s.opsi.map((o) => ({ kode: o.kode, teks: o.teks })) })));
    if (versiHp && versiHp === versi) {
      await catatPaketDipegang(db, tes.id, akun.id, versi);
      return NextResponse.json({ boleh: true, sama: true, versi, sekarang: new Date().toISOString() });
    }
    const efektif = await terapkanAgendaPeserta(db, tes, peserta.kelas);
    const paket = await susunPaketTes(db, tes, soal, !!efektif.agenda);
    if (!paket) return NextResponse.json({ boleh: false, alasan: "Paket luring belum bisa dibuat (pengaturan basis data belum lengkap)." });
    // dicatat saat paket dikirim; bila HP gagal menyimpan, pemeriksaan berikutnya (tanpa versi) mengirim ulang dan mencatat lagi
    await catatPaketDipegang(db, tes.id, akun.id, paket.versi);
    return NextResponse.json({ boleh: true, paket });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
