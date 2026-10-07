// app/api/sigap/pelatihan/instrumen/route.ts
//
// (7 Okt 2026) SIGAP > Pelatihan > Instrumen -- kuesioner, buku pedoman & PPT materi yang dapat diunduh.
// Permintaan user: tab "Instrumen pelatihan". Boleh dibaca peserta pelatihan & akun berizin `pelatihan.kelola`;
// unggah/sembunyikan hanya izin `pelatihan.kelola` (kelola). Berkas bersumber dari folder data/ (bawaan,
// mis. kuesioner) atau bucket storage `sigap-files` (diunggah admin).
//
// GET                -> { boleh_kelola, berkas: [{id, jenis, judul, nama_file, ukuran, diunggah_at}] }
// GET ?unduh=<id>    -> sumber repo: byte berkas; sumber storage: JSON { url } (tautan sementara 5 menit)
// POST multipart {jenis, judul, file}        -> unggah ke storage
// POST json {aksi:"sembunyikan", id}         -> berkas tidak tampil lagi (data tidak dihapus)

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { BUCKET_SIGAP } from "@/lib/sigap";
import { boleh, catatAudit, izinAkun } from "@/lib/sigapAkses";
import { akunDariRequest, catatLangkah, dbAdmin, idKegiatanPelatihan, pesertaPelatihan } from "@/lib/sigapTesDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JENIS = ["kuesioner", "pedoman", "materi"] as const;
const MAKS_BYTE = 100 * 1024 * 1024; // 100 MB
const EKSTENSI = ["pdf", "doc", "docx", "ppt", "pptx", "pps", "ppsx", "xls", "xlsx", "zip"];

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
    const lihatKelola = boleh(izin, "pelatihan.kelola", "lihat", kegiatanId);
    if (!peserta && !lihatKelola) return galat("Instrumen hanya untuk peserta pelatihan.", 403);

    const unduh = Number(req.nextUrl.searchParams.get("unduh")) || null;
    if (unduh) {
      const { data: b } = await db.from("sigap_pelatihan_berkas").select("*").eq("id", unduh).eq("kegiatan_id", kegiatanId).eq("aktif", true).maybeSingle();
      if (!b) return galat("Berkas tidak ditemukan.", 404);
      // (7 Okt 2026) Langkah Pelatihan: peserta yang mengunduh instrumen dicatat "sudah mempelajari instrumen".
      if (peserta) await catatLangkah(db, akun.id, kegiatanId, "instrumen").catch(() => {});
      if (b.sumber === "repo") {
        const dasar = path.resolve(process.cwd(), "data");
        const lengkap = path.resolve(dasar, String(b.path));
        if (!lengkap.startsWith(dasar + path.sep)) return galat("Berkas tidak valid.", 400);
        const isi = await readFile(lengkap);
        return new NextResponse(new Uint8Array(isi), {
          headers: {
            "Content-Type": (b.mime as string) || "application/octet-stream",
            "Content-Disposition": `attachment; filename="${encodeURIComponent(String(b.nama_file))}"`,
            "Cache-Control": "private, no-store",
          },
        });
      }
      const { data: s, error } = await db.storage.from(BUCKET_SIGAP).createSignedUrl(String(b.path), 300, { download: String(b.nama_file) });
      if (error || !s?.signedUrl) return galat("Tautan unduhan gagal dibuat.", 500);
      return NextResponse.json({ url: s.signedUrl });
    }

    const { data } = await db
      .from("sigap_pelatihan_berkas")
      .select("id, jenis, judul, nama_file, ukuran, diunggah_at")
      .eq("kegiatan_id", kegiatanId)
      .eq("aktif", true)
      .order("diunggah_at", { ascending: false })
      .order("id", { ascending: false });
    return NextResponse.json({ boleh_kelola: boleh(izin, "pelatihan.kelola", "kelola", kegiatanId), berkas: data ?? [] });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}

function namaAman(nama: string): string {
  return nama.normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_").slice(-90) || "berkas";
}

export async function POST(req: NextRequest) {
  const db = dbAdmin();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  try {
    const akun = await akunDariRequest(req, db);
    if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
    const kegiatanId = await idKegiatanPelatihan(db);
    if (!kegiatanId) return galat("Kegiatan pelatihan belum dibuat.", 404);
    const { izin } = await izinAkun(db, akun.id);
    if (!boleh(izin, "pelatihan.kelola", "kelola", kegiatanId)) return galat("Tidak punya izin mengelola instrumen pelatihan.", 403);

    const tipe = req.headers.get("content-type") ?? "";
    if (tipe.includes("application/json")) {
      const body = await req.json().catch(() => null);
      if (body?.aksi !== "sembunyikan") return galat("Aksi tidak dikenal.");
      const id = Number(body?.id);
      const { data, error } = await db.from("sigap_pelatihan_berkas").update({ aktif: false }).eq("id", id).eq("kegiatan_id", kegiatanId).select("id, jenis, judul").maybeSingle();
      if (error) return galat(error.message, 500);
      if (!data) return galat("Berkas tidak ditemukan.", 404);
      await catatAudit(db, akun.id, "pelatihan_sembunyikan_berkas", { berkas_id: id, judul: data.judul });
      return NextResponse.json({ ok: true });
    }

    const fd = await req.formData();
    const jenis = String(fd.get("jenis") ?? "");
    const file = fd.get("file");
    if (!(JENIS as readonly string[]).includes(jenis)) return galat("Jenis instrumen tidak dikenal.");
    if (!(file instanceof File) || file.size === 0) return galat("Pilih berkas yang akan diunggah.");
    if (file.size > MAKS_BYTE) return galat("Ukuran berkas maksimal 100 MB.");
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!EKSTENSI.includes(ext)) return galat(`Format .${ext || "?"} tidak diizinkan. Gunakan: ${EKSTENSI.join(", ")}.`);
    const judul = String(fd.get("judul") ?? "").trim().slice(0, 200) || file.name.replace(/\.[^.]+$/, "");
    const lokasi = `pelatihan/${kegiatanId}/${jenis}/${Date.now()}-${namaAman(file.name)}`;
    const { error: eUp } = await db.storage.from(BUCKET_SIGAP).upload(lokasi, new Uint8Array(await file.arrayBuffer()), { contentType: file.type || "application/octet-stream", upsert: false });
    if (eUp) return galat(`Unggah gagal: ${eUp.message}`, 500);
    const { data, error } = await db
      .from("sigap_pelatihan_berkas")
      .insert({ kegiatan_id: kegiatanId, jenis, judul, nama_file: file.name, mime: file.type || null, ukuran: file.size, sumber: "storage", path: lokasi, diunggah_oleh: `${akun.nama} (#${akun.id})` })
      .select("id")
      .single();
    if (error) return galat(error.message, 500);
    await catatAudit(db, akun.id, "pelatihan_unggah_berkas", { berkas_id: data.id, jenis, judul, nama_file: file.name, ukuran: file.size });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    return galat(e instanceof Error ? e.message : "Terjadi kesalahan.", 500);
  }
}
