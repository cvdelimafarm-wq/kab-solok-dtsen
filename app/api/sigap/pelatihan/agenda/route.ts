// app/api/sigap/pelatihan/agenda/route.ts
//
// (9 Nov 2026) SIGAP > Pelatihan > Agenda hari H (versi minimal): instruktur kelas memulai dan menyelesaikan pretest/posttest kelasnya.
// Hanya INSTRUKTUR kelas yang bersangkutan (sigap_kuis_instruktur_kelas) yang boleh menekan Mulai/Selesai (putusan Iqbal: murni instruktur, tanpa pengaman admin).
// Akun lain mendapat { ada: false } (kartu tidak tampil). Tabel belum ada atau tidak ada baris agenda = { ada: false }.
//   GET  ?kegiatan=ID                                  -> { ada, sekarang, sesi[{ id, tes_id, jenis, judul, kelas, durasi_menit, jendela_menit, status, mulai_at, tutup_at, jumlah_soal, mulai, selesai }] }
//   POST ?kegiatan=ID { tes_id, aksi: "mulai"|"selesai"|"buka_lagi" } -> GET yang diperbarui
//     mulai: hanya bila belum dimulai (klik ganda aman); selesai: hanya bila berjalan; buka_lagi: hanya bila sudah selesai (jendela baru dari sekarang).
// Peserta yang sudah memulai tetap menyelesaikan waktunya; Selesai hanya menutup jendela bagi yang BELUM mulai.

import { NextRequest, NextResponse } from "next/server";
import type { Db } from "@/lib/sigap";
import { catatAudit } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan, jumlahSoal, muatTesDaftar } from "@/lib/sigapTesDb";
import { muatInstruktur } from "@/lib/sigapInstrukturDb";
import { KOLOM_AGENDA, aksiAgendaSah, statusAgenda, tutupJendela, type BarisAgenda, type StatusAgenda } from "@/lib/sigapAgenda";
import { bacaBarisAgenda } from "@/lib/sigapAgendaDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

type SesiAgenda = {
  id: number;
  tes_id: number;
  jenis: string;
  judul: string;
  kelas: number;
  durasi_menit: number;
  jendela_menit: number;
  status: StatusAgenda;
  mulai_at: string | null;
  tutup_at: string | null;
  jumlah_soal: number;
  /** Jumlah peserta yang sudah memulai / sudah selesai mengerjakan tes ini (semua kelas; pelatihan satu kelas = tepat). */
  mulai: number;
  selesai: number;
};

async function siapkan(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return { err: galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500) } as const;
  const akun = await akunDariRequest(req, db);
  if (!akun) return { err: galat("Sesi berakhir. Silakan masuk kembali.", 401) } as const;
  const kegiatanId = await idKegiatanPelatihan(db, req, akun.id);
  if (!kegiatanId) return { err: galat("Pelatihan tidak ditemukan.", 404) } as const;
  const kelasSaya = (await muatInstruktur(db, kegiatanId)).filter((i) => i.akun_id === akun.id).map((i) => i.kelas);
  return { db: db as Db, akun, kegiatanId, kelasSaya } as const;
}

async function susun(db: Db, kegiatanId: number, kelasSaya: number[], sekarang: Date) {
  if (kelasSaya.length === 0) return { ada: false as const };
  const { data, error } = await db.from("sigap_agenda_sesi").select(KOLOM_AGENDA).eq("kegiatan_id", kegiatanId).in("kelas", kelasSaya);
  if (error || !data || data.length === 0) return { ada: false as const };
  const baris = (data as unknown[]).map(bacaBarisAgenda);
  const tes = await muatTesDaftar(db, kegiatanId);
  const peta = new Map(tes.map((t) => [t.id, t]));
  const ids = baris.map((b) => b.tes_id);
  const soal = await jumlahSoal(db, ids);
  const { data: sesi } = await db.from("sigap_tes_sesi").select("tes_id, selesai_at, batas_at").in("tes_id", ids);
  const hitung = new Map<number, { mulai: number; selesai: number }>();
  for (const s of (sesi ?? []) as { tes_id: number; selesai_at: string | null; batas_at: string }[]) {
    const h = hitung.get(Number(s.tes_id)) ?? { mulai: 0, selesai: 0 };
    h.mulai += 1;
    if (s.selesai_at || sekarang.getTime() >= new Date(s.batas_at).getTime()) h.selesai += 1;
    hitung.set(Number(s.tes_id), h);
  }
  const urutan = (j: string) => (j === "pretest" ? 0 : j === "posttest" ? 1 : 2);
  const daftar: SesiAgenda[] = baris
    .filter((b) => peta.has(b.tes_id))
    .map((b) => {
      const t = peta.get(b.tes_id)!;
      const h = hitung.get(b.tes_id) ?? { mulai: 0, selesai: 0 };
      return {
        id: b.id,
        tes_id: b.tes_id,
        jenis: t.jenis,
        judul: t.judul,
        kelas: b.kelas,
        durasi_menit: t.durasi_menit,
        jendela_menit: b.jendela_menit,
        status: statusAgenda(b, sekarang),
        mulai_at: b.mulai_at,
        tutup_at: tutupJendela(b),
        jumlah_soal: soal.get(b.tes_id) ?? 0,
        mulai: h.mulai,
        selesai: h.selesai,
      };
    })
    .sort((a, b) => a.kelas - b.kelas || urutan(a.jenis) - urutan(b.jenis));
  return { ada: daftar.length > 0, sekarang: sekarang.toISOString(), sesi: daftar };
}

export async function GET(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    return NextResponse.json(await susun(p.db, p.kegiatanId, p.kelasSaya, new Date()));
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const p = await siapkan(req);
    if ("err" in p) return p.err;
    const body = (await req.json().catch(() => null)) as { tes_id?: unknown; aksi?: unknown } | null;
    const tesId = Number(body?.tes_id);
    if (!body || !Number.isInteger(tesId) || tesId <= 0 || !aksiAgendaSah(body.aksi)) return galat("Permintaan tidak valid.");
    if (p.kelasSaya.length === 0) return galat("Hanya instruktur kelas ini yang dapat memulai atau menyelesaikan sesi.", 403);
    const { data } = await p.db.from("sigap_agenda_sesi").select(KOLOM_AGENDA).eq("kegiatan_id", p.kegiatanId).eq("tes_id", tesId).in("kelas", p.kelasSaya).limit(1).maybeSingle();
    if (!data) return galat("Sesi ini bukan milik kelas Anda atau belum dijadwalkan.", 403);
    const baris: BarisAgenda = bacaBarisAgenda(data);
    const sekarang = new Date();
    const iso = sekarang.toISOString();
    const st = statusAgenda(baris, sekarang);

    if (body.aksi === "mulai") {
      if (st === "menunggu") {
        const { error } = await p.db.from("sigap_agenda_sesi").update({ mulai_at: iso, mulai_oleh: p.akun.id, selesai_at: null, diubah_at: iso }).eq("id", baris.id).is("mulai_at", null);
        if (error) return galat(error.message, 500);
        await catatAudit(p.db, p.akun.id, "pelatihan_agenda_mulai", { kegiatan_id: p.kegiatanId, tes_id: tesId, kelas: baris.kelas });
      }
    } else if (body.aksi === "selesai") {
      if (st === "berjalan") {
        const { error } = await p.db.from("sigap_agenda_sesi").update({ selesai_at: iso, diubah_at: iso }).eq("id", baris.id).is("selesai_at", null);
        if (error) return galat(error.message, 500);
        await catatAudit(p.db, p.akun.id, "pelatihan_agenda_selesai", { kegiatan_id: p.kegiatanId, tes_id: tesId, kelas: baris.kelas });
      }
    } else if (st === "selesai") {
      // buka_lagi: jendela baru dari sekarang (sesi peserta yang sudah ada tidak berubah)
      const { error } = await p.db.from("sigap_agenda_sesi").update({ mulai_at: iso, mulai_oleh: p.akun.id, selesai_at: null, diubah_at: iso }).eq("id", baris.id);
      if (error) return galat(error.message, 500);
      await catatAudit(p.db, p.akun.id, "pelatihan_agenda_buka_lagi", { kegiatan_id: p.kegiatanId, tes_id: tesId, kelas: baris.kelas });
    }
    return NextResponse.json(await susun(p.db, p.kegiatanId, p.kelasSaya, new Date()));
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
