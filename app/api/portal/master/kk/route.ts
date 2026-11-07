// app/api/portal/master/kk/route.ts
//
// (7 Nov 2026, tahap C3) Master > KK master -- sisi admin Master. Izin `master.wilayah`: 'lihat' membaca ringkasan/riwayat/usulan, 'kelola' mengunggah dan memutuskan.
// GET -> DataMasterKk.  POST { aksi: "pratinjau" | "terapkan", kec, berkas?, baris, nonaktifkan? } (pratinjau tidak menulis apa pun)
//                       | { aksi: "usul", id, putusan: "diterapkan" | "ditolak", catatan? }.
// Isi baris DIPERIKSA ULANG di server (lib/masterKk.ts sahkanBarisKk); pencocokan dan penulisan atomik di fungsi SQL master_kk_terapkan.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { MENU_MASTER_WILAYAH } from "@/lib/masterWilayah";
import { dataMasterKk, putuskanUsulanKk, terapkanUnggahKk } from "@/lib/portal/masterKk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  try {
    const db = dbPortal();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, MENU_MASTER_WILAYAH, "lihat")) return galat("Menu Master hanya untuk admin Master (Ketua).", 403);
    return NextResponse.json(await dataMasterKk(db), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return galatServer("[api/portal/master/kk GET]", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = dbPortal();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, MENU_MASTER_WILAYAH, "kelola")) return galat("Mengubah KK master hanya untuk admin Master (Ketua).", 403);
    if (/^Bearer\s+\S+\.\S+\.\S+\.\S+$/i.test(req.headers.get("authorization") ?? "")) return galat("Mode simulasi tidak boleh mengubah data.", 403);

    let b: Record<string, unknown>;
    try {
      b = (await req.json()) as Record<string, unknown>;
    } catch {
      return galat("Isian tidak terbaca.");
    }

    if (b.aksi === "pratinjau" || b.aksi === "terapkan") {
      const terapkan = b.aksi === "terapkan";
      const h = await terapkanUnggahKk(db, akun.id, { kec: b.kec, berkas: b.berkas, baris: b.baris, nonaktifkan: b.nonaktifkan, terapkan });
      if (!h.ok) return galat(h.pesan, h.status);
      if (terapkan) {
        await catatAudit(db, akun.id, "master.kk.unggah", {
          unggah: h.unggah_id, kec: typeof b.kec === "string" ? b.kec : null, baris: h.baris, baru: h.baru, berubah: h.berubah, nonaktif: h.nonaktif, diaktifkan: h.diaktifkan,
          asal: typeof b.berkas === "string" ? b.berkas.slice(0, 120) : null,
        });
      }
      return NextResponse.json(h, { headers: { "Cache-Control": "no-store" } });
    }

    if (b.aksi === "usul") {
      const h = await putuskanUsulanKk(db, akun.id, b.id, b.putusan, b.catatan);
      if (!h.ok) return galat(h.pesan, h.status);
      await catatAudit(db, akun.id, "master.kk.usul", { ganti: Number(b.id), putusan: b.putusan });
      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galatServer("[api/portal/master/kk POST]", e);
  }
}
