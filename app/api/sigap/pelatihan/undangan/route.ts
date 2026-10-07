// app/api/sigap/pelatihan/undangan/route.ts
//
// (7 Okt 2026) SIGAP > Pelatihan -- unduh PDF Undangan (B-409/13030/VS.230/2026). Berkas disimpan di
// data/ (BUKAN public/) karena lampirannya memuat daftar nama peserta; hanya peserta pelatihan atau
// pengelola pelatihan yang sudah masuk SIGAP yang boleh mengunduh.

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { boleh, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, dbAdmin, idKegiatanPelatihan, pesertaPelatihan } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

export async function GET(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const [peserta, { izin }] = await Promise.all([pesertaPelatihan(db, akun.id, kegiatanId), izinAkun(db, akun.id)]);
    if (!peserta && !boleh(izin, "pelatihan.kelola", "lihat", kegiatanId)) return galat("Undangan hanya untuk peserta pelatihan.", 403);
    const berkas = await readFile(path.join(process.cwd(), "data", "undangan-pelatihan-8okt2026.pdf"));
    return new NextResponse(new Uint8Array(berkas), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="Undangan_Pelatihan_PSP_Pascabencana_8Okt2026.pdf"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
