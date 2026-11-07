// app/api/portal/master/batas/route.ts
//
// (7 Nov 2026, tahap C2) Master > Batas wilayah (shapefile) -- sisi admin Master. Izin `master.wilayah`: 'lihat' untuk membaca riwayat versi, 'kelola' untuk menyimpan
// versi baru dan mengaktifkan/mengembalikan. Pemeriksaan isi dilakukan ULANG di server (lib/portal/batasVersi.ts), apa pun yang dikirim browser.
// GET -> { siap, aktif, versi[], bawaan }.  POST { aksi: "simpan", fitur, namaAsal?, catatan?, ringkas? } | { aksi: "aktifkan", versi: "<tanda>" | null }.
// Mode "masuk sebagai" (simulasi) tidak boleh menulis: middleware sudah menjawab tiruan; di sini ditolak juga bila sesi 4 bagian lolos.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { galatServer } from "@/lib/sigapGalat";
import { MENU_MASTER_WILAYAH } from "@/lib/masterWilayah";
import { aktifkanVersiBatas, daftarVersiBatas, simpanVersiBatas } from "@/lib/portal/batasVersi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  try {
    const db = dbPortal();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, MENU_MASTER_WILAYAH, "lihat")) return galat("Menu Master hanya untuk admin Master (Ketua).", 403);
    return NextResponse.json(await daftarVersiBatas(db), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return galatServer("[api/portal/master/batas GET]", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = dbPortal();
    if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
    const akun = await akunDariSesi(db, req.headers);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, MENU_MASTER_WILAYAH, "kelola")) return galat("Mengubah batas wilayah hanya untuk admin Master (Ketua).", 403);
    if (/^Bearer\s+\S+\.\S+\.\S+\.\S+$/i.test(req.headers.get("authorization") ?? "")) return galat("Mode simulasi tidak boleh mengubah data.", 403);

    let b: Record<string, unknown>;
    try {
      b = (await req.json()) as Record<string, unknown>;
    } catch {
      return galat("Isian tidak terbaca.");
    }

    if (b.aksi === "simpan") {
      const h = await simpanVersiBatas(db, akun.id, { fitur: b.fitur, namaAsal: b.namaAsal, catatan: b.catatan, ringkas: b.ringkas });
      if (!h.ok) return galat(h.pesan, h.status);
      await catatAudit(db, akun.id, "master.batas.simpan", { versi: h.versi, subsls: h.jumlah_subsls, kecamatan: h.jumlah_kec, ukuran: h.ukuran_byte, asal: typeof b.namaAsal === "string" ? b.namaAsal.slice(0, 120) : null });
      return NextResponse.json(h, { headers: { "Cache-Control": "no-store" } });
    }

    if (b.aksi === "aktifkan") {
      const versi = typeof b.versi === "string" && b.versi ? b.versi : null;
      const h = await aktifkanVersiBatas(db, akun.id, versi);
      if (!h.ok) return galat(h.pesan, h.status);
      await catatAudit(db, akun.id, versi ? "master.batas.aktifkan" : "master.batas.kembali_bawaan", { versi });
      return NextResponse.json(h, { headers: { "Cache-Control": "no-store" } });
    }

    return galat("Aksi tidak dikenal.");
  } catch (e) {
    return galatServer("[api/portal/master/batas POST]", e);
  }
}
