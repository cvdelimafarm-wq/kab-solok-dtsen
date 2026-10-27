// app/api/sigap/foto/berkas/route.ts
//
// (19 Okt 2026) Mengunduh berkas foto ber-cap. Boleh: pemotret, akun yang di-tag, PML pemotret, admin foto.
// GET ?id=<foto_id>[&u=mini|kecil] (Authorization: Bearer <sesi>) -> image/jpeg. Klien memakai fetch + blob (tag <img> tidak bisa mengirim header).
// (28 Okt 2026) ?u=mini (±360 px, kisi) dan ?u=kecil (±900 px, pratinjau) dibuat dari berkas ber-cap saat diminta dan ditahan di memori server
// (tidak disimpan ke penyimpanan, jadi tak ada berkas kecil yatim bila berkas asli dihapus). Tanpa ?u = foto asli seperti semula.

import { NextRequest, NextResponse } from "next/server";
import { BUCKET_SIGAP } from "@/lib/sigap";
import { bolehPeriksa } from "@/lib/sigapFotoServer";
import { galat, masukFoto } from "@/lib/sigapFotoRoute";
import { buatFotoKecil } from "@/lib/sigapFotoKecil";
import { SimpananBerat, UKURAN_BERKAS, ukuranBerkasDariParam } from "@/lib/sigapCacheFoto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// foto kecil di memori server: ±40 MB (mini ±25 KB, kecil ±100 KB). Kunci memuat jalur berkas, jadi berkas yang diganti tak memakai entri lama.
const simpananKecil = new SimpananBerat<Buffer>(40 * 1024 * 1024);

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
  const ukuran = ukuranBerkasDariParam(req.nextUrl.searchParams.get("u"));
  const kunciKecil = `${foto.id}|${foto.file_path}|${ukuran}`;
  let isi = ukuran === "penuh" ? undefined : simpananKecil.ambil(kunciKecil);
  if (!isi) {
    const { data, error } = await db.storage.from(BUCKET_SIGAP).download(foto.file_path as string);
    if (error || !data) return galat("Berkas tidak ditemukan di penyimpanan.", 404);
    const asli = Buffer.from(await data.arrayBuffer());
    if (ukuran === "penuh") isi = asli;
    else {
      try {
        isi = await buatFotoKecil(asli, UKURAN_BERKAS[ukuran].lebar, UKURAN_BERKAS[ukuran].kualitas);
        simpananKecil.simpan(kunciKecil, isi, isi.length);
      } catch {
        isi = asli; // gambar tak bisa diperkecil: kirim asli, jangan gagal
      }
    }
  }
  return new NextResponse(new Uint8Array(isi), {
    // (27 Okt 2026) Berkas ber-cap tidak pernah berubah (nama berkas = kode acak), jadi boleh disimpan lama di HP; Vary: Authorization supaya simpanan
    // tidak dipakai bersama antar-akun di HP yang sama. Dulu hanya 5 menit sehingga membuka foto yang sama berulang kali mengunduh ulang.
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400, immutable", Vary: "Authorization" },
  });
}
