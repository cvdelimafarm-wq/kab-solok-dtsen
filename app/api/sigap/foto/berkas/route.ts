// app/api/sigap/foto/berkas/route.ts
//
// (19 Okt 2026) Mengunduh berkas foto ber-cap. Boleh: pemotret, akun yang di-tag, PML pemotret, admin foto.
// GET ?id=<foto_id> (Authorization: Bearer <sesi>) -> image/jpeg. Klien memakai fetch + blob (tag <img> tidak bisa mengirim header).

import { NextRequest, NextResponse } from "next/server";
import { BUCKET_SIGAP } from "@/lib/sigap";
import { bolehPeriksa } from "@/lib/sigapFotoServer";
import { galat, masukFoto } from "@/lib/sigapFotoRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const m = await masukFoto(req);
  if (m instanceof NextResponse) return m;
  const { db, akunId } = m;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return galat("id wajib.");
  const { data: foto } = await db.from("sigap_foto").select("id, akun_pengambil, file_path, file_dihapus_at").eq("id", id).maybeSingle();
  if (!foto) return galat("Foto tidak ditemukan.", 404);
  let boleh = foto.akun_pengambil === akunId;
  if (!boleh) {
    const { data: t } = await db.from("sigap_foto_tag").select("id").eq("foto_id", id).eq("akun_id", akunId).maybeSingle();
    boleh = !!t;
  }
  if (!boleh) boleh = await bolehPeriksa(db, akunId, foto.akun_pengambil as number);
  if (!boleh) return galat("Anda tidak berhak melihat foto ini.", 403);
  if (foto.file_dihapus_at) return galat("Berkas foto ini sudah dihapus atas persetujuan.", 410);
  const { data, error } = await db.storage.from(BUCKET_SIGAP).download(foto.file_path as string);
  if (error || !data) return galat("Berkas tidak ditemukan di penyimpanan.", 404);
  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" },
  });
}
