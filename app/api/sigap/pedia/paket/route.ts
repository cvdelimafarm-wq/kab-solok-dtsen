// app/api/sigap/pedia/paket/route.ts
//
// (7 Okt 2026) SIGAP PEDIA -- unduh "Paket Bukti" ZIP utk Inspektorat -- permintaan user.
// GET ?id=<entri>                    -> 1 entri
// GET ?jenis=kegiatan|penugasan|kontrak_paket&ref=<id>  -> semua entri yg tertaut (satu folder per entri)

import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { aksesPedia, audit, galat } from "@/lib/pedia/server";
import { muatDataPaket, namaZip, tambahKeZip } from "@/lib/pedia/paket";
import { slugNomor } from "@/lib/pedia/umum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const s = await aksesPedia(req);
  if ("gagal" in s) return s.gagal;
  if (!s.kelola) return galat("Paket Bukti hanya untuk pengelola.", 403);
  const q = req.nextUrl.searchParams;
  try {
    let ids: number[] = [];
    let nama = "PaketBukti.zip";
    if (q.get("id")) ids = [Number(q.get("id"))];
    else if (q.get("jenis") && q.get("ref")) {
      const { data } = await s.db.from("pedia_tautan").select("entri_id").eq("jenis", q.get("jenis")!).eq("ref_id", Number(q.get("ref")));
      ids = Array.from(new Set((data ?? []).map((x) => x.entri_id as number)));
      nama = `PaketBukti_${q.get("jenis")}_${q.get("ref")}.zip`;
    }
    if (!ids.length) return galat("Tidak ada entri untuk dipaketkan.", 404);
    const zip = new JSZip();
    const nomor: string[] = [];
    for (const id of ids) {
      const d = await muatDataPaket(s.db, id);
      if (!d) continue;
      if (d.entri.status === "dibatalkan" && ids.length > 1) continue;
      nomor.push(String(d.entri.nomor_registrasi));
      await tambahKeZip(zip, s.db, d, ids.length > 1 ? slugNomor(String(d.entri.nomor_registrasi)) : "", s.nama);
      if (ids.length === 1) nama = namaZip(String(d.entri.nomor_registrasi));
      await audit(s, "unduh_paket_bukti", id, null, { mode: ids.length > 1 ? `${q.get("jenis")}#${q.get("ref")}` : "entri" });
    }
    const isi = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
    return new NextResponse(new Uint8Array(isi), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${nama}"; filename*=UTF-8''${encodeURIComponent(nama)}`,
        "Cache-Control": "no-store",
        "X-Entri": nomor.join(","),
      },
    });
  } catch (e) {
    return galat(e instanceof Error ? e.message : String(e), 500);
  }
}
