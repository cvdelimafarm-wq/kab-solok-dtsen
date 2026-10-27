// app/api/portal/qc/kuesioner/admin/route.ts
//
// (27 Okt 2026) Kuesioner Quality Check -- sisi admin (Kelola Pendataan > tab QC > Kuesioner). Izin menu `bencana.admin`:
// "lihat" = melihat kuesioner aktif, riwayat versi, rekap lembar; "kelola" = mengunggah / mengaktifkan versi. Semua perubahan dicatat di sigap_audit.
// Tidak ada penghapusan: unggahan baru membuat VERSI baru dan menonaktifkan versi lama; versi lama bisa diaktifkan lagi.
// GET                                                  -> { boleh_kelola, aktif:{petugas,kk}, riwayat[], rekap[] }
// POST {aksi:"unggah", objek, judul?, berkas?, kuesioner:[[sel]], kriteria:[[sel]]} -> baca & periksa di server (lib/sigapQcKuesioner.ts), simpan sebagai versi baru
// POST {aksi:"aktifkan", id}                           -> jadikan versi itu yang berlaku

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader, boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { GalatQc } from "@/lib/portal/qc";
import { aktifkanVersiKuesioner, dataAdminKuesioner, rekapLembarAdmin, unggahKuesioner } from "@/lib/portal/qcKuesioner";
import { bacaKuesioner } from "@/lib/sigapQcKuesioner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400, ekstra?: object) => NextResponse.json({ error: pesan, ...ekstra }, { status });

function tangani(tag: string, e: unknown): NextResponse {
  if (e instanceof GalatQc) return galat(e.message, e.status);
  return galatServer(tag, e);
}

async function siapkan(req: NextRequest, tulis: boolean) {
  const db = dbPortal();
  if (!db) return { err: galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500) } as const;
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return { err: galat("Sesi berakhir. Silakan masuk kembali.", 401) } as const;
  if (tulis && aktorDariHeader(req.headers)) return { err: galat('Mode "masuk sebagai" hanya untuk melihat tampilan. Kembali ke akun Anda untuk mengubah kuesioner.', 403) } as const;
  const { izin } = await izinAkun(db, akun.id);
  if (!boleh(izin, "bencana.admin", tulis ? "kelola" : "lihat")) return { err: galat("Tidak punya akses admin pendataan.", 403) } as const;
  return { db, akun, bisaKelola: boleh(izin, "bencana.admin", "kelola") } as const;
}

export async function GET(req: NextRequest) {
  try {
    const p = await siapkan(req, false);
    if ("err" in p) return p.err;
    const [data, rekap] = await Promise.all([dataAdminKuesioner(p.db), rekapLembarAdmin(p.db)]);
    return NextResponse.json({ boleh_kelola: p.bisaKelola, ...data, rekap });
  } catch (e) {
    return tangani("[api/portal/qc/kuesioner/admin GET]", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const p = await siapkan(req, true);
    if ("err" in p) return p.err;
    const { db, akun } = p;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const aksi = String(body?.aksi ?? "");

    if (aksi === "unggah") {
      const objek = body?.objek;
      if (objek !== "petugas" && objek !== "kk") return galat("Objek kuesioner harus petugas atau kk.");
      const lembar = (v: unknown): unknown[][] | null => (Array.isArray(v) && v.length <= 1000 && v.every((r) => Array.isArray(r) && r.length <= 30) ? (v as unknown[][]) : null);
      const kues = lembar(body?.kuesioner);
      const krit = lembar(body?.kriteria);
      if (!kues || kues.length === 0 || !krit) return galat("Berkas tidak berisi lembar kuesioner dan kriteria yang bisa dibaca (maksimal 1000 baris).");
      const hasil = bacaKuesioner(kues, krit);
      if (hasil.galat.length > 0) return galat(`Berkas belum benar: ${hasil.galat.slice(0, 3).map((g) => g.pesan).join(" ")}`, 422);
      const judul = typeof body?.judul === "string" ? body.judul.trim() : "";
      const berkas = typeof body?.berkas === "string" ? body.berkas : null;
      const r = await unggahKuesioner(db, objek, judul, berkas, hasil.struktur, akun.nama);
      await catatAudit(db, akun.id, "qc_kuesioner_unggah", { objek, versi: r.versi, aspek: r.aspek, soal: r.soal, berkas });
      return NextResponse.json({ ok: true, ...r });
    }
    if (aksi === "aktifkan") {
      const id = Number(body?.id);
      if (!Number.isInteger(id) || id <= 0) return galat("Permintaan tidak valid.");
      const r = await aktifkanVersiKuesioner(db, id);
      await catatAudit(db, akun.id, "qc_kuesioner_aktifkan", { id, versi: r.versi });
      return NextResponse.json({ ok: true, ...r });
    }
    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return tangani("[api/portal/qc/kuesioner/admin POST]", e);
  }
}
