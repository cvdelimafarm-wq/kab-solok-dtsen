// app/api/portal/tindak-lanjut/route.ts
//
// (11 Nov 2026) Status tindak lanjut masalah di halaman monitoring (Kelola Pendataan). Izin bencana.admin PSP: "lihat" untuk membaca, "kelola" untuk mengubah.
// GET  ?sumber=lapangan|progres                                  -> { baris[], bisa_ubah }
// POST { sumber, kunci, status: "belum"|"proses"|"selesai", catatan?, masalah? } -> { ok, baris | null }   ("belum" menghapus baris)

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { aktorDariHeader, bolehPsp, catatAudit, izinAkun, KEGIATAN_PSP } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { MAKS_CATATAN_TINDAK, sahKunci, sahSumber, type BarisTindak } from "@/lib/tindakLanjut";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });
const KOLOM = "sumber,kunci,status,catatan,masalah,nama_oleh,diubah_pada";

export async function GET(req: NextRequest) {
  try {
    const db = dbPortal();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const { izin } = await izinAkun(db, akun.id);
    if (!bolehPsp(izin, "lihat")) return galat("Anda tidak punya akses ke monitoring ini.", 403);
    const sumber = req.nextUrl.searchParams.get("sumber");
    if (!sahSumber(sumber)) return galat("Sumber tidak sah.");
    const { data, error } = await db.from("sigap_tindak_lanjut").select(KOLOM).eq("kegiatan_id", KEGIATAN_PSP).eq("sumber", sumber).limit(2000);
    if (error) throw new Error(error.message);
    return NextResponse.json({ baris: (data ?? []) as BarisTindak[], bisa_ubah: bolehPsp(izin, "kelola") && !aktorDariHeader(req.headers) });
  } catch (e) {
    return galatServer("[api/portal/tindak-lanjut GET]", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = dbPortal();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    if (aktorDariHeader(req.headers)) return galat('Mode "masuk sebagai" hanya untuk melihat tampilan.', 403);
    const { izin } = await izinAkun(db, akun.id);
    if (!bolehPsp(izin, "kelola")) return galat("Anda tidak punya akses kelola untuk mengubah status.", 403);
    const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!b || !sahSumber(b.sumber) || !sahKunci(b.kunci)) return galat("Permintaan tidak valid.");
    const status = b.status;
    if (status !== "belum" && status !== "proses" && status !== "selesai") return galat("Status tidak sah.");
    const kunci = { kegiatan_id: KEGIATAN_PSP, sumber: b.sumber, kunci: b.kunci };

    if (status === "belum") {
      const { error } = await db.from("sigap_tindak_lanjut").delete().match(kunci);
      if (error) throw new Error(error.message);
      await catatAudit(db, akun.id, "tindak_lanjut_ubah", { ...kunci, status });
      return NextResponse.json({ ok: true, baris: null });
    }
    const catatan = typeof b.catatan === "string" ? b.catatan.trim().slice(0, MAKS_CATATAN_TINDAK) || null : null;
    const masalah = typeof b.masalah === "string" ? b.masalah.slice(0, 600) : null;
    const { data, error } = await db
      .from("sigap_tindak_lanjut")
      .upsert({ ...kunci, status, catatan, masalah, diubah_oleh: akun.id, nama_oleh: akun.nama, diubah_pada: new Date().toISOString() }, { onConflict: "kegiatan_id,sumber,kunci" })
      .select(KOLOM)
      .single();
    if (error) throw new Error(error.message);
    await catatAudit(db, akun.id, "tindak_lanjut_ubah", { ...kunci, status });
    return NextResponse.json({ ok: true, baris: data as BarisTindak });
  } catch (e) {
    return galatServer("[api/portal/tindak-lanjut POST]", e);
  }
}
