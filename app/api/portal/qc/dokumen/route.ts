// app/api/portal/qc/dokumen/route.ts
//
// (30 Okt 2026) Daftar unduh dokumen hasil pemeriksaan (PDF scan dari PML) di tab QC Kelola Pendataan, untuk kegiatan apa pun yang punya unggahan.
// Izin menu `bencana.admin` (lihat), sama dengan QC Pemahaman admin. Hanya MEMBACA dan MENGUNDUH; unggah/tarik tetap oleh PML di tab Dokumen kegiatannya.
// Kegiatan yang belum punya fitur unggah (tabelDokumenKegiatan = null) dan tabel yang belum ada dijawab dengan daftar kosong, bukan galat:
// layar menyembunyikan kartu bila tidak ada data masuk.
//
// GET ?k=<kegiatan>             -> { dokumen: DokumenPeriksaAdmin[] } (terbaru dulu; yang ditarik PML tidak ikut)
// GET ?k=<kegiatan>&unduh=<id>  -> { url, nama } tautan unduhan 5 menit; setiap unduhan dicatat di sigap_audit.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { BUCKET_SIGAP, type Db } from "@/lib/sigap";
import { galatServer } from "@/lib/sigapGalat";
import { namaUnduhan, tabelDokumenKegiatan, type DokumenPeriksaAdmin } from "@/lib/dokumenPeriksa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_TAUTAN_DETIK = 300;
const KOLOM = "id, kegiatan_id, pml_akun_id, judul, keterangan, wilayah, tanggal_periksa, file_path, nama_asli, ukuran_byte, diunggah_at";
const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

type Baris = {
  id: number; kegiatan_id: number; pml_akun_id: number; judul: string; keterangan: string | null; wilayah: string | null;
  tanggal_periksa: string | null; file_path: string; nama_asli: string | null; ukuran_byte: number; diunggah_at: string;
};

async function namaAkun(db: Db, ids: number[]): Promise<Map<number, string>> {
  const uniq = Array.from(new Set(ids));
  const peta = new Map<number, string>();
  if (uniq.length === 0) return peta;
  const { data } = await db.from("sigap_akun").select("id, nama").in("id", uniq);
  for (const r of (data ?? []) as { id: number; nama: string }[]) peta.set(Number(r.id), String(r.nama ?? ""));
  return peta;
}

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  try {
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, "bencana.admin", "lihat")) return galat("Tidak punya akses admin pendataan.", 403);
    const sp = req.nextUrl.searchParams;
    const keg = Number(sp.get("k"));
    if (!Number.isInteger(keg) || keg < 1 || keg > 1_000_000) return galat("Kegiatan tidak sah.");
    const tabel = tabelDokumenKegiatan(keg);
    if (!tabel) return NextResponse.json({ dokumen: [] });

    const unduh = sp.get("unduh");
    if (unduh) {
      const id = Number(unduh);
      if (!Number.isInteger(id) || id <= 0) return galat("Dokumen tidak ditemukan.", 404);
      const { data: b } = await db.from(tabel).select(KOLOM).eq("id", id).eq("kegiatan_id", keg).is("dihapus_at", null).maybeSingle();
      if (!b) return galat("Dokumen tidak ditemukan atau sudah ditarik.", 404);
      const dok = b as Baris;
      const nama = namaUnduhan((await namaAkun(db, [dok.pml_akun_id])).get(dok.pml_akun_id) ?? "", dok.judul);
      const { data: ttd, error } = await db.storage.from(BUCKET_SIGAP).createSignedUrl(dok.file_path, TTL_TAUTAN_DETIK, { download: nama });
      if (error || !ttd?.signedUrl) return galat("Berkas tidak dapat dibuka. Coba lagi sebentar lagi.", 502);
      await catatAudit(db, akun.id, "qc.dokumen_unduh", { kegiatan: keg, dokumen_id: dok.id, pml_akun_id: dok.pml_akun_id }).catch(() => undefined);
      return NextResponse.json({ url: ttd.signedUrl, nama });
    }

    const { data, error } = await db.from(tabel).select(KOLOM).eq("kegiatan_id", keg).is("dihapus_at", null).order("diunggah_at", { ascending: false }).limit(1000);
    if (error) {
      // tabel belum dibuat (migrasi belum dijalankan) = belum ada data masuk
      if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message)) return NextResponse.json({ dokumen: [] });
      throw new Error(error.message);
    }
    const baris = (data ?? []) as Baris[];
    const nama = await namaAkun(db, baris.map((x) => x.pml_akun_id));
    const dokumen: DokumenPeriksaAdmin[] = baris.map((b) => {
      const pml = nama.get(b.pml_akun_id) ?? `PML ${b.pml_akun_id}`;
      return {
        id: b.id, kegiatan_id: b.kegiatan_id, pml_id: b.pml_akun_id, judul: b.judul, keterangan: b.keterangan, wilayah: b.wilayah, tanggal_periksa: b.tanggal_periksa,
        nama_asli: b.nama_asli, ukuran_byte: b.ukuran_byte, diunggah_at: b.diunggah_at, diunggah_oleh: pml, pml_nama: pml,
      };
    });
    return NextResponse.json({ dokumen });
  } catch (e) {
    return galatServer("qc/dokumen GET", e);
  }
}
