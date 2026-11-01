// app/api/sigap/vanguard/sertifikasi/route.ts
//
// (1 Nov 2026) VANGUARD V7d: Ujian Sertifikasi kemampuan petugas (15 butir acak dan berimbang; angka tiap butir acak per benih; dinilai di SERVER; kunci tidak pernah dikirim).
// Sertifikasi BELUM berdampak ke mana pun: hanya disimpan sebagai kepemilikan petugas (tabel sigap_vanguard_ujian dan sigap_vanguard_ujian_butir; SQL 20261101z).
//   GET                         -> { status, berjalan, riwayat[], sertifikat:{terbaru,tertinggi} }
//   GET ?ujian=ID               -> { ujian, butir:[{urut, kode, jenis, judul, terjawab, ...}] }  (hasil dan rincian hanya setelah ujian selesai, atau pada latihan)
//   GET ?ujian=ID&butir=URUT    -> { soal: { jenis, kode, benih, judul, data } }  (bahan soal tanpa kunci)
//   POST { aksi:"mulai", jenis:"sertifikasi"|"latihan" }                   -> { ujian, jumlah } (atau dilanjutkan bila masih ada ujian berjalan)
//   POST { aksi:"jawab", ujian, urut, isian, durasiDtk? }                  -> { benar, poin, [rincian pada latihan], semuaTerjawab }
//   POST { aksi:"selesai", ujian, menyerah? }                              -> { hasil:{skor, tingkat, nama, butirFatal}, review[] }
// Aturan jeda: lib/vanguard/sertifikasi/jeda.ts. Mode lihat (masuk sebagai) tidak boleh menulis.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseServer";
import { aktorDariHeader, sesiDariHeader } from "@/lib/sigapAkses";
import { benihBaru } from "@/lib/vanguard/kuesioner/templat";
import { KEDALUWARSA_JAM, statusUjian, type RiwayatUjian } from "@/lib/vanguard/sertifikasi/jeda";
import { KOLAM, nilaiButir, sajikanButir } from "@/lib/vanguard/sertifikasi/nilai";
import { hitungUjian, JUMLAH_BUTIR_UJIAN, VERSI_UJIAN } from "@/lib/vanguard/sertifikasi/skor";
import { susunUjian } from "@/lib/vanguard/sertifikasi/ujian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400, ekstra: Record<string, unknown> = {}) => NextResponse.json({ error: pesan, ...ekstra }, { status });

function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

type UjianRow = { id: number; akun_id: number; jenis: "sertifikasi" | "latihan"; benih: number; jumlah: number; mulai_at: string; selesai_at: string | null; skor: number | null; tingkat: number | null; butir_fatal: number | null };
type ButirRow = { id: number; ujian_id: number; urut: number; kasus: string; jenis: "k" | "v1"; benih: number; jawab_at: string | null; benar: boolean | null; poin: number | null; jml_fatal: number | null; jml_berat: number | null; jml_ringan: number | null; rincian: { jenis: string; tingkat: string; pesan: string; sel: string | null }[] | null };

const id = (x: unknown): number | null => (typeof x === "number" && Number.isInteger(x) && x > 0 ? x : typeof x === "string" && /^\d{1,12}$/.test(x) && Number(x) > 0 ? Number(x) : null);
const kedaluwarsa = (u: { mulai_at: string }) => Date.now() - new Date(u.mulai_at).getTime() >= KEDALUWARSA_JAM * 3_600_000;

async function riwayatAkun(db: NonNullable<ReturnType<typeof supabaseAdmin>>, akun: number): Promise<UjianRow[]> {
  const { data, error } = await db.from("sigap_vanguard_ujian").select("id, akun_id, jenis, benih, jumlah, mulai_at, selesai_at, skor, tingkat, butir_fatal").eq("akun_id", akun).order("mulai_at", { ascending: false }).limit(200);
  if (error) throw new Error("riwayat");
  return (data ?? []) as unknown as UjianRow[];
}
async function ujianMilik(db: NonNullable<ReturnType<typeof supabaseAdmin>>, akun: number, ujian: number): Promise<UjianRow | null> {
  const { data, error } = await db.from("sigap_vanguard_ujian").select("id, akun_id, jenis, benih, jumlah, mulai_at, selesai_at, skor, tingkat, butir_fatal").eq("id", ujian).eq("akun_id", akun).limit(1);
  if (error) throw new Error("ujian");
  return ((data ?? []) as unknown as UjianRow[])[0] ?? null;
}
async function butirUjian(db: NonNullable<ReturnType<typeof supabaseAdmin>>, ujian: number): Promise<ButirRow[]> {
  const { data, error } = await db.from("sigap_vanguard_ujian_butir").select("id, ujian_id, urut, kasus, jenis, benih, jawab_at, benar, poin, jml_fatal, jml_berat, jml_ringan, rincian").eq("ujian_id", ujian).order("urut", { ascending: true }).limit(100);
  if (error) throw new Error("butir");
  return (data ?? []) as unknown as ButirRow[];
}
const judulButir = (b: { kasus: string; benih: number }) => sajikanButir(b.kasus, b.benih)?.judul ?? b.kasus;

export async function GET(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = sesiDariHeader(req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const p = req.nextUrl.searchParams;
    if (!p.has("ujian")) {
      const r = await riwayatAkun(db, akun);
      const status = statusUjian(r as RiwayatUjian[], new Date());
      const selesai = r.filter((u) => u.jenis === "sertifikasi" && !!u.selesai_at && u.tingkat != null);
      const terbaru = selesai[0] ?? null; // urut mulai terbaru
      const tertinggi = selesai.reduce<UjianRow | null>((a, b) => (!a || (b.tingkat as number) > (a.tingkat as number) || ((b.tingkat as number) === (a.tingkat as number) && (b.skor ?? 0) > (a.skor ?? 0)) ? b : a), null);
      const ringkas = (u: UjianRow | null) => (u ? { ujian: u.id, tingkat: u.tingkat, skor: u.skor, selesai_at: u.selesai_at } : null);
      return NextResponse.json({
        status: { sertifikasiBoleh: status.sertifikasiBoleh, alasan: status.alasan, bukaLagi: status.bukaLagi, sudahBersertifikat: status.sudahBersertifikat },
        berjalan: status.berjalan ? status.berjalan.id : null,
        jumlahButir: Math.min(JUMLAH_BUTIR_UJIAN, KOLAM.length),
        riwayat: r.slice(0, 20).map((u) => ({ ujian: u.id, jenis: u.jenis, mulai_at: u.mulai_at, selesai_at: u.selesai_at, skor: u.skor, tingkat: u.tingkat })),
        sertifikat: { terbaru: ringkas(terbaru), tertinggi: ringkas(tertinggi) },
      });
    }
    const ujianId = id(p.get("ujian"));
    if (!ujianId) return galat("Ujian tidak sah.");
    const u = await ujianMilik(db, akun, ujianId);
    if (!u) return galat("Ujian tidak ditemukan.", 404);
    const butir = await butirUjian(db, ujianId);
    if (p.has("butir")) {
      const urut = id(p.get("butir"));
      const b = butir.find((x) => x.urut === urut);
      if (!b) return galat("Butir tidak ditemukan.", 404);
      const soal = sajikanButir(b.kasus, b.benih);
      if (!soal) return galat("Butir tidak ditemukan.", 404);
      return NextResponse.json({ soal, terjawab: !!b.jawab_at });
    }
    const buka = !!u.selesai_at || u.jenis === "latihan"; // rincian terbuka setelah selesai, dan pada latihan
    return NextResponse.json({
      ujian: { id: u.id, jenis: u.jenis, jumlah: u.jumlah, mulai_at: u.mulai_at, selesai_at: u.selesai_at, skor: u.skor, tingkat: u.tingkat, kedaluwarsa: !u.selesai_at && kedaluwarsa(u) },
      butir: butir.map((b) => ({
        urut: b.urut, kode: b.kasus, jenis: b.jenis, judul: judulButir(b), terjawab: !!b.jawab_at,
        ...(buka && !!b.jawab_at ? { benar: b.benar, poin: b.poin, rincian: b.rincian ?? [] } : {}),
      })),
    });
  } catch {
    return galat("Gagal memuat sertifikasi.", 500);
  }
}

export async function POST(req: NextRequest) {
  const db = supabaseAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = sesiDariHeader(req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers)) return galat("Mode lihat (masuk sebagai) tidak dapat mengikuti ujian.", 403);
    let b: Record<string, unknown>;
    try { const x = await req.json(); if (!x || typeof x !== "object" || Array.isArray(x)) return galat("Permintaan tidak sah."); b = x as Record<string, unknown>; } catch { return galat("Permintaan tidak sah."); }

    if (b.aksi === "mulai") {
      const jenis = b.jenis === "latihan" ? "latihan" : b.jenis === "sertifikasi" ? "sertifikasi" : null;
      if (!jenis) return galat("Jenis ujian tidak sah.");
      const r = await riwayatAkun(db, akun);
      const st = statusUjian(r as RiwayatUjian[], new Date());
      if (st.berjalan) return NextResponse.json({ ujian: st.berjalan.id, jenis: st.berjalan.jenis, jumlah: r.find((x) => x.id === st.berjalan!.id)?.jumlah ?? 0, dilanjutkan: true });
      if (jenis === "sertifikasi" && !st.sertifikasiBoleh) return galat(st.alasan ?? "Sertifikasi belum dapat dimulai.", 403, { bukaLagi: st.bukaLagi });
      const benih = benihBaru();
      const daftar = susunUjian(benih, KOLAM, JUMLAH_BUTIR_UJIAN);
      if (daftar.length === 0) return galat("Belum ada butir ujian.", 500);
      const { data: baru, error } = await db.from("sigap_vanguard_ujian").insert({ akun_id: akun, jenis, versi: VERSI_UJIAN, benih, jumlah: daftar.length, mulai_at: new Date().toISOString() }).select("id").single();
      if (error || !baru) return galat("Gagal memulai ujian.", 500);
      const ujian = (baru as { id: number }).id;
      const { error: eB } = await db.from("sigap_vanguard_ujian_butir").insert(daftar.map((x) => ({ ujian_id: ujian, urut: x.urut, kasus: x.kode, jenis: x.jenis, benih: x.benih })));
      if (eB) return galat("Gagal menyiapkan butir ujian.", 500);
      return NextResponse.json({ ujian, jenis, jumlah: daftar.length });
    }

    const ujianId = id(b.ujian);
    if (!ujianId) return galat("Ujian tidak sah.");
    const u = await ujianMilik(db, akun, ujianId);
    if (!u) return galat("Ujian tidak ditemukan.", 404);
    if (u.selesai_at) return galat("Ujian ini sudah selesai.", 409);
    if (kedaluwarsa(u)) return galat(`Ujian kedaluwarsa (lebih dari ${KEDALUWARSA_JAM} jam). Mulai ujian baru.`, 410);
    const butir = await butirUjian(db, ujianId);

    if (b.aksi === "jawab") {
      const urut = id(b.urut);
      const row = butir.find((x) => x.urut === urut);
      if (!row) return galat("Butir tidak ditemukan.", 404);
      if (row.jawab_at) return galat("Butir ini sudah dijawab.", 409);
      const h = nilaiButir(row.kasus, row.benih, b.isian);
      if ("galat" in h) return galat(h.galat);
      const durasi = typeof b.durasiDtk === "number" && Number.isFinite(b.durasiDtk) ? Math.min(86400, Math.max(0, Math.round(b.durasiDtk))) : 0;
      const { error } = await db.from("sigap_vanguard_ujian_butir").update({ jawab_at: new Date().toISOString(), benar: h.benar, poin: h.poin, jml_fatal: h.fatal, jml_berat: h.berat, jml_ringan: h.ringan, rincian: h.rincian, isian: h.isianBersih, durasi_dtk: durasi }).eq("id", row.id);
      if (error) return galat("Gagal menyimpan jawaban.", 500);
      const semuaTerjawab = butir.filter((x) => x.id !== row.id).every((x) => !!x.jawab_at);
      return NextResponse.json({ benar: h.benar, poin: h.poin, semuaTerjawab, ...(u.jenis === "latihan" ? { rincian: h.rincian } : {}) });
    }

    if (b.aksi === "selesai") {
      const belum = butir.filter((x) => !x.jawab_at).length;
      if (belum > 0 && b.menyerah !== true) return galat(`Masih ada ${belum} butir belum dijawab.`, 400, { belum });
      const hasil = hitungUjian(butir.map((x) => ({ poin: x.poin, fatal: x.jml_fatal ?? 0 })), u.jumlah);
      const { error } = await db.from("sigap_vanguard_ujian").update({ selesai_at: new Date().toISOString(), skor: hasil.skor, tingkat: hasil.tingkat, butir_fatal: hasil.butirFatal }).eq("id", u.id);
      if (error) return galat("Gagal menyelesaikan ujian.", 500);
      return NextResponse.json({
        hasil, jenis: u.jenis,
        review: butir.map((x) => ({ urut: x.urut, kode: x.kasus, judul: judulButir(x), terjawab: !!x.jawab_at, benar: x.benar ?? null, poin: x.poin ?? 0, rincian: x.rincian ?? [] })),
      });
    }
    return galat("Aksi tidak dikenal.");
  } catch {
    return galat("Gagal memproses sertifikasi.", 500);
  }
}
