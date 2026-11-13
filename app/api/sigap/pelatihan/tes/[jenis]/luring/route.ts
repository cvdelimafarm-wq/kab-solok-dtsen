// app/api/sigap/pelatihan/tes/[jenis]/luring/route.ts
//
// (14 Nov 2026, luring 3b-3/3b-4) Terima jawaban tes yang dikerjakan TANPA SINYAL (soal dari paket tersandi, dibuka dengan sandi A).
// POST { tes_id, versi, mulai_hp_ms, selesai_hp_ms, kirim_hp_ms, selisih_ms, jawaban, jejak, ulang? }
//  -> diperiksa kewajarannya (lib/sigapTesLuringPeriksa.ts), lalu dinilai seperti tes biasa memakai jam server hasil terjemahan jam HP.
//  * belum ada sesi            : sesi dibuat dengan mulai/batas dari HP, lalu dinilai.
//  * sesi berjalan (mulai daring lalu sinyal hilang): jawaban HP dipakai, dinilai pada min(selesai HP, batas).
//  * sesi selesai + ulang=true : percobaan baru (aturan mengulang yang sama, mis. wajib 100) dimulai pada jam mulai HP, lalu dinilai.
//  * kiriman yang sama dua kali (jawaban server hilang di jalan): dikembalikan keadaan terakhir tanpa mengubah apa pun.
// Jawaban = keadaan tes terbaru (sama dengan GET tes) sehingga HP langsung menampilkan hasil/pembahasan menurut aturan biasa.

import { NextRequest, NextResponse } from "next/server";
import { TUBUH_GERBANG } from "@/lib/gerbangUndangan";
import { periksaGerbang } from "@/lib/sigapPelatihanBaruDb";
import { bersihkanJawaban, jawabanSoalLain, jenisTesValid } from "@/lib/sigapTes";
import { terapkanAgendaPeserta } from "@/lib/sigapAgendaDb";
import { akunDariRequest, dbAdmin, finalisasiSesi, idKegiatanPelatihan, muatSesi, muatSoal, muatTes, mulaiUlang, pesertaPelatihan, susunKeadaan } from "@/lib/sigapTesDb";
import { versiSoal } from "@/lib/sigapTesLuring";
import { bacaKirimLuring, periksaKirimLuring } from "@/lib/sigapTesLuringPeriksa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
type Ctx = { params: Promise<{ jenis: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
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
    if (!tes) return galat("Tes tidak ditemukan.", 404);
    const peserta = await pesertaPelatihan(db, akun.id, kegiatanId);
    if (!peserta) return galat("Akun Anda tidak terdaftar sebagai peserta pelatihan ini.", 403);
    if ((await periksaGerbang(db, kegiatanId, akun.id)) !== "boleh") return NextResponse.json(TUBUH_GERBANG, { status: 403 });

    const body = await req.json().catch(() => null);
    const k = bacaKirimLuring(body);
    if (!k) return galat("Isi kiriman tidak sah.");
    if (k.tes_id !== tes.id) return galat("Paket soal ini milik tes lain. Muat ulang halaman tes.", 409);
    const ulang = body?.ulang === true;

    const sekarang = new Date();
    const efektif = await terapkanAgendaPeserta(db, tes, peserta.kelas);
    const dimulaiInstruktur = !!efektif.agenda;
    // tes yang dimulai instruktur: jendela bisa sudah ditutup saat jawaban tiba, jadi batas atas memakai jadwal tes asli bila lebih longgar
    const jadwal = dimulaiInstruktur && Date.parse(tes.tutup_at) > Date.parse(efektif.tutup_at) ? { ...efektif, tutup_at: tes.tutup_at } : efektif;
    const h = periksaKirimLuring(k, jadwal, dimulaiInstruktur, sekarang.getTime());
    if (!h.ok) return galat(h.pesan, 409);

    const soal = await muatSoal(db, tes.id);
    const versi = await versiSoal(soal.map((s) => ({ nomor: s.nomor, teks: s.teks, opsi: s.opsi.map((o) => ({ kode: o.kode, teks: o.teks })) })));
    const catatan = [...h.catatan, ...(versi === k.versi ? [] : ["soal diubah panitia sesudah paket diunduh; dinilai dengan soal terbaru"])];
    const cap = {
      mulai_hp_ms: k.mulai_hp_ms,
      selesai_hp_ms: k.selesai_hp_ms,
      kirim_hp_ms: k.kirim_hp_ms,
      selisih_ms: k.selisih_ms,
      ketukan: k.jejak.length,
      versi: k.versi,
      versi_cocok: versi === k.versi,
      catatan,
      diterima_at: sekarang.toISOString(),
    };

    let sesi = await muatSesi(db, tes.id, akun.id);
    // kiriman ganda: sesi sudah memuat cap kiriman yang sama
    if (sesi) {
      const { data: c } = await db.from("sigap_tes_sesi").select("luring_cap").eq("id", sesi.id).maybeSingle();
      const lama = (c as { luring_cap: { mulai_hp_ms?: number } | null } | null)?.luring_cap;
      if (sesi.selesai_at && lama?.mulai_hp_ms === k.mulai_hp_ms) return NextResponse.json(await susunKeadaan(db, efektif, akun.id, sekarang));
    }

    if (!sesi) {
      const { error } = await db.from("sigap_tes_sesi").insert({ tes_id: tes.id, akun_id: akun.id, mulai_at: h.mulai.toISOString(), batas_at: h.batas.toISOString(), jawaban: {} });
      if (error && error.code !== "23505") return galat(error.message, 500);
      sesi = await muatSesi(db, tes.id, akun.id);
      if (!sesi) return galat("Sesi tes gagal dibuat.", 500);
    } else if (sesi.selesai_at) {
      if (!ulang) return galat("Tes ini sudah selesai dikerjakan.", 409);
      const r = await mulaiUlang(db, efektif, sesi, soal, h.mulai);
      if (!r.ok) return galat(r.pesan, r.status);
      sesi = await muatSesi(db, tes.id, akun.id);
      if (!sesi || sesi.selesai_at) return galat("Percobaan baru gagal dibuat.", 500);
      await db.from("sigap_tes_sesi").update({ batas_at: h.batas.toISOString() }).eq("id", sesi.id).is("selesai_at", null);
      sesi = { ...sesi, batas_at: h.batas.toISOString() };
    }

    const jawaban = { ...jawabanSoalLain(sesi.jawaban, soal), ...bersihkanJawaban(k.jawaban, soal) };
    const { error: eTulis } = await db.from("sigap_tes_sesi").update({ jawaban, luring: true, luring_cap: cap, diubah_at: sekarang.toISOString() }).eq("id", sesi.id).is("selesai_at", null);
    if (eTulis && /luring/i.test(eTulis.message)) await db.from("sigap_tes_sesi").update({ jawaban, diubah_at: sekarang.toISOString() }).eq("id", sesi.id).is("selesai_at", null);
    const selesai = new Date(Math.min(h.selesai.getTime(), Date.parse(sesi.batas_at)));
    await finalisasiSesi(db, { ...sesi, jawaban }, soal, selesai);
    return NextResponse.json(await susunKeadaan(db, efektif, akun.id, sekarang));
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
