// app/api/portal/qc/kuesioner/route.ts
//
// (27 Okt 2026) Lembar Supervisi > Lembar Quality Check. Akses: kortim (korwil) mengisi lembar untuk KELOMPOKNYA sendiri;
// pemegang bencana.admin (lihat) boleh melihat kelompok mana pun, dan (kelola) mengisi untuk kelompok mana pun. PML tidak mengisi.
// GET [?kelompok=n][&ppl=<akun PPL>]  -> DataLembar + pilihan kelompok + bisa_isi + saya_akun_id (+ kk[] bila ppl diberikan: KK yang sudah didata PPL itu)
// POST {kelompok, objek, tanggal, subjek_akun_id, kk_id?, jawaban:{diperiksa:{QC-1:true}, jawab:{"1.1":"Semua"}}, identitas?, catatan?, tindak_lanjut?, tenggat?}  -> simpan/ubah satu lembar

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader, boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { GalatQc } from "@/lib/portal/qc";
import { daftarKelompok, daftarKelompokKortim } from "@/lib/portal/korwilMonitor";
import { pilihanKelompokUntuk, tentukanKelompok } from "@/lib/korwilMonitor";
import { GalatJawaban, daftarKkPpl, dataLembar, simpanLembar } from "@/lib/portal/qcKuesioner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400, ekstra?: object) => NextResponse.json({ error: pesan, ...ekstra }, { status });
const TOLAK = "Halaman ini untuk korwil (kortim) kelompok pendataan.";

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  try {
    const [saya, { izin }] = await Promise.all([daftarKelompokKortim(db, akun.id), izinAkun(db, akun.id)]);
    const admin = boleh(izin, "bencana.admin", "lihat");
    if (saya.length === 0 && !admin) return galat(TOLAK, 403);
    const semua = admin || saya.length > 1 ? await daftarKelompok(db) : [];
    const pilihan = pilihanKelompokUntuk({ admin, saya, semua });
    const kelompok = tentukanKelompok({ admin, saya, semua: semua.map((x) => x.kelompok), minta: Number(req.nextUrl.searchParams.get("kelompok")) });
    if (kelompok == null) return galat(TOLAK, 403);
    const d = await dataLembar(db, kelompok);
    if (!d) return galat(`Kelompok ${kelompok} tidak ditemukan.`, 404);
    const bisaIsi = saya.includes(kelompok) || boleh(izin, "bencana.admin", "kelola");

    const ppl = Number(req.nextUrl.searchParams.get("ppl"));
    let kk: Awaited<ReturnType<typeof daftarKkPpl>> | undefined;
    if (Number.isInteger(ppl) && ppl > 0) {
      if (!d.anggota.some((a) => a.akun_id === ppl && a.peran === "ppl")) return galat("PPL itu bukan anggota kelompok ini.", 400);
      kk = await daftarKkPpl(db, ppl);
    }
    return NextResponse.json({ ...d, pilihan, bisa_isi: bisaIsi, saya_akun_id: akun.id, ...(kk ? { kk } : {}) });
  } catch (e) {
    if (e instanceof GalatQc) return galat(e.message, e.status);
    return galatServer("[api/portal/qc/kuesioner GET]", e);
  }
}

export async function POST(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  if (aktorDariHeader(req.headers)) return galat('Mode "masuk sebagai" hanya untuk melihat tampilan. Kembali ke akun Anda untuk mengisi lembar.', 403);
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const kelompok = Number(body?.kelompok);
    const objek = body?.objek;
    const subjek = Number(body?.subjek_akun_id);
    if (!Number.isInteger(kelompok) || kelompok <= 0 || (objek !== "petugas" && objek !== "kk") || !Number.isInteger(subjek) || subjek <= 0) return galat("Permintaan tidak valid.");
    const kkId = body?.kk_id == null ? null : Number(body.kk_id);
    if (objek === "kk" && (kkId == null || !Number.isInteger(kkId) || kkId <= 0)) return galat("Pilih KK yang diperiksa.");

    const [saya, { izin }] = await Promise.all([daftarKelompokKortim(db, akun.id), izinAkun(db, akun.id)]);
    if (!saya.includes(kelompok) && !boleh(izin, "bencana.admin", "kelola")) return galat("Anda tidak punya akses mengisi lembar untuk kelompok ini.", 403);

    const r = await simpanLembar(db, akun.id, { kelompok, objek, tanggal: body?.tanggal, subjekAkunId: subjek, kkId, jawaban: body?.jawaban, identitas: body?.identitas, catatan: body?.catatan, tindakLanjut: body?.tindak_lanjut, tenggat: body?.tenggat });
    await catatAudit(db, akun.id, "qc_lembar_simpan", { id: r.id, kelompok, objek, subjek, kk: kkId, tanggal: body?.tanggal });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof GalatJawaban) return galat(e.message, e.status, { galat_jawaban: e.galat });
    if (e instanceof GalatQc) return galat(e.message, e.status);
    return galatServer("[api/portal/qc/kuesioner POST]", e);
  }
}
