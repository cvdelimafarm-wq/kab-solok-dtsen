// app/api/sigap/pelatihan/tes/[jenis]/route.ts
//
// (7 Okt 2026) SIGAP > Pelatihan -- pengerjaan pretest/posttest oleh peserta.
// Waktu mutlak dari jam server. Aturan (dipilih user): hitung mundur per orang + batas tutup:
//   mulai hanya pada [buka_at, tutup_at); batas_at = LEAST(mulai + durasi, tutup_at).
// GET                         -> keadaan tes (status, soal tanpa kunci saat mengerjakan, hasil sesudah tutup)
// POST {aksi:"mulai"}         -> buka sesi (atau lanjutkan bila sudah ada)
// POST {aksi:"simpan", jawaban:{"1":"B"}} -> simpan jawaban sementara (autosave)
// POST {aksi:"kirim", jawaban?}           -> kirim & nilai

import { NextRequest, NextResponse } from "next/server";
import { TOLERANSI_DETIK, bersihkanJawaban, hitungBatas, jenisTesValid, lewatBatas } from "@/lib/sigapTes";
import {
  akunDariRequest,
  dbAdmin,
  finalisasiSesi,
  idKegiatanPelatihan,
  muatSesi,
  muatSoal,
  muatTes,
  pesertaPelatihan,
  susunKeadaan,
  KOLOM_SESI_PUBLIK,
} from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

type Ctx = { params: Promise<{ jenis: string }> };

async function siapkan(req: NextRequest, ctx: Ctx) {
  const db = dbAdmin();
  if (!db) return { err: galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500) } as const;
  const { jenis } = await ctx.params;
  if (!jenisTesValid(jenis)) return { err: galat("Jenis tes tidak dikenal.", 404) } as const;
  const akun = await akunDariRequest(req, db);
  if (!akun) return { err: galat("Sesi berakhir. Silakan masuk kembali.", 401) } as const;
  const kegiatanId = await idKegiatanPelatihan(db);
  if (!kegiatanId) return { err: galat("Kegiatan pelatihan belum dibuat.", 404) } as const;
  const tes = await muatTes(db, kegiatanId, jenis);
  if (!tes || !tes.aktif) return { err: galat("Tes belum tersedia.", 404) } as const;
  const peserta = await pesertaPelatihan(db, akun.id, kegiatanId);
  if (!peserta) return { err: galat("Akun Anda tidak terdaftar sebagai peserta pelatihan ini.", 403) } as const;
  return { db, akun, tes } as const;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const p = await siapkan(req, ctx);
    if ("err" in p) return p.err;
    return NextResponse.json(await susunKeadaan(p.db, p.tes, p.akun.id, new Date()));
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const p = await siapkan(req, ctx);
    if ("err" in p) return p.err;
    const { db, akun, tes } = p;
    const body = await req.json().catch(() => null);
    const aksi = String(body?.aksi ?? "");
    const sekarang = new Date();
    const soal = await muatSoal(db, tes.id);
    let sesi = await muatSesi(db, tes.id, akun.id);

    if (aksi === "mulai") {
      if (sesi) return NextResponse.json(await susunKeadaan(db, tes, akun.id, sekarang)); // lanjutkan
      if (soal.length === 0) return galat("Soal belum tersedia.", 409);
      const t = sekarang.getTime();
      if (t < new Date(tes.buka_at).getTime()) return galat("Tes belum dibuka.", 409);
      if (t >= new Date(tes.tutup_at).getTime()) return galat("Sesi tes sudah ditutup.", 409);
      const batas = hitungBatas(sekarang, tes.durasi_menit, tes.tutup_at);
      const { error } = await db
        .from("sigap_tes_sesi")
        .insert({ tes_id: tes.id, akun_id: akun.id, mulai_at: sekarang.toISOString(), batas_at: batas.toISOString(), jawaban: {} });
      // 23505 = sudah ada (klik ganda / dua perangkat): lanjutkan saja
      if (error && error.code !== "23505") return galat(error.message, 500);
      return NextResponse.json(await susunKeadaan(db, tes, akun.id, sekarang));
    }

    if (aksi === "simpan" || aksi === "kirim") {
      if (!sesi) return galat("Anda belum memulai tes ini.", 409);
      if (sesi.selesai_at) return aksi === "kirim" ? NextResponse.json(await susunKeadaan(db, tes, akun.id, sekarang)) : galat("Tes sudah selesai.", 409);
      const terlambat = lewatBatas(sekarang, sesi.batas_at, TOLERANSI_DETIK);
      if (terlambat) {
        // waktu habis: nilai dari jawaban yang sudah tersimpan
        await finalisasiSesi(db, sesi, soal, new Date(sesi.batas_at));
        return NextResponse.json({ ...(await susunKeadaan(db, tes, akun.id, sekarang)), error: "Waktu pengerjaan sudah habis. Jawaban yang tersimpan dinilai otomatis." }, { status: 409 });
      }
      if (body?.jawaban !== undefined) {
        const bersih = bersihkanJawaban(body.jawaban, soal);
        const { data, error } = await db
          .from("sigap_tes_sesi")
          .update({ jawaban: bersih, diubah_at: sekarang.toISOString() })
          .eq("id", sesi.id)
          .is("selesai_at", null)
          .select(KOLOM_SESI_PUBLIK)
          .maybeSingle();
        if (error) return galat(error.message, 500);
        if (data) sesi = { ...sesi, jawaban: bersih, diubah_at: sekarang.toISOString() };
      }
      if (aksi === "simpan") {
        return NextResponse.json({ ok: true, terjawab: Object.keys(bersihkanJawaban(sesi.jawaban, soal)).length, sekarang: sekarang.toISOString(), batas_at: sesi.batas_at });
      }
      await finalisasiSesi(db, sesi, soal, sekarang);
      return NextResponse.json(await susunKeadaan(db, tes, akun.id, sekarang));
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
