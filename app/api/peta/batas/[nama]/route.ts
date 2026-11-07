// app/api/peta/batas/[nama]/route.ts
//
// (7 Nov 2026, tahap C2) Alamat /peta/batas/<nama> (dialihkan lewat rewrites `beforeFiles` di next.config.js) melayani versi batas AKTIF dari Storage `peta-batas`
// (diunggah di Master), dan jatuh ke berkas bawaan public/peta/batas bila belum ada versi aktif. Dengan begitu pemuat peta di HP (app/portal/batasOffline.ts,
// app/sigap/pendataan/useBatas.ts) tidak perlu diubah: ia sudah memeriksa manifest tiap kali (no-cache) dan menyimpan berkas per `versi`.
// Terbuka tanpa sesi seperti berkas statis sebelumnya (hanya garis batas sub SLS, tanpa data orang). Hanya nama yang dikenal: manifest.json dan batas-<7 digit>.json.

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { dbPortal } from "@/lib/portal/server";
import { berkasBatasAktif, namaBerkasBatasSah } from "@/lib/portal/batasVersi";
import { folderBatas } from "@/lib/portal/batasServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JSON_HEADER = "application/json; charset=utf-8";

export async function GET(req: NextRequest, { params }: { params: Promise<{ nama: string }> }) {
  const { nama } = await params;
  if (!namaBerkasBatasSah(nama)) return new NextResponse("Tidak ditemukan.", { status: 404 });
  const bolehLama = nama === "manifest.json" ? "no-cache" : "public, max-age=3600";

  // 1) versi aktif dari Storage (galat apa pun -> jatuh ke berkas bawaan, peta tetap tampil)
  try {
    const db = dbPortal();
    if (db) {
      const a = await berkasBatasAktif(db, nama);
      if (a) {
        // berkas kecamatan diminta dengan ?v=<versi>: alamatnya unik per versi, boleh disimpan lama; tanpa ?v= selalu diperiksa ulang
        const unik = nama !== "manifest.json" && req.nextUrl.searchParams.get("v") === a.versi;
        return new NextResponse(a.isi, { headers: { "Content-Type": JSON_HEADER, "Cache-Control": unik ? "public, max-age=31536000, immutable" : "no-cache", "X-Versi-Batas": a.versi } });
      }
    }
  } catch (e) {
    console.error("[api/peta/batas] versi aktif tidak terbaca, memakai berkas bawaan:", e instanceof Error ? e.message : e);
  }

  // 2) berkas bawaan
  try {
    const isi = await fs.readFile(path.join(folderBatas(), nama), "utf8");
    return new NextResponse(isi, { headers: { "Content-Type": JSON_HEADER, "Cache-Control": bolehLama, "X-Versi-Batas": "bawaan" } });
  } catch {
    return new NextResponse("Tidak ditemukan.", { status: 404 });
  }
}
