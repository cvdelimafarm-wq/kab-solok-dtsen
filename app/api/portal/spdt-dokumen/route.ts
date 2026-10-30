// app/api/portal/spdt-dokumen/route.ts
//
// (30 Okt 2026) SPDT NTP: dokumen hasil pemeriksaan (PDF scan) dari PML untuk Supervisor. Tabel: sigap_spdt_dokumen (20261030a).
// Berkas: sigap-files/pemeriksaan/<kegiatan>/<akun PML>/<hash>.pdf. Logika murni ada di lib/dokumenPeriksa.ts.
// Peran memakai peranSpdt (supervisor = izin menu spdt.supervisor, sama dengan Monitoring dan QC SPDT NTP).
//
// GET                -> PML: { dokumen[] } miliknya sendiri, plus { wilayah[] } pilihan Jorong dari KK-nya
// GET ?semua=1       -> Supervisor: { dokumen[] dengan nama PML } seluruh PML SPDT NTP
// GET ?unduh=<id>    -> { url, nama } tautan unduhan 5 menit. Boleh: Supervisor atau PML pemilik dokumen.
// POST multipart     -> PML: bidang berkas (PDF, maks 15 MB), judul, keterangan?, wilayah?, tanggal_periksa? ; isi sama dari PML sama = duplikat (aman diulang)
// POST {aksi:"tarik", id} -> PML menarik dokumennya (dihapus_at; berkas tidak dihapus)
// "Masuk sebagai" hanya boleh melihat. Semua perubahan dicatat di sigap_audit.

import { NextRequest, NextResponse } from "next/server";
import { akunDariSesi, dbPortal } from "@/lib/portal/server";
import { bacaKkSpdt, peranSpdt } from "@/lib/portal/spdt";
import { aktorDariHeader, catatAudit } from "@/lib/sigapAkses";
import { BUCKET_SIGAP, type Db } from "@/lib/sigap";
import { galatServer } from "@/lib/sigapGalat";
import { KEGIATAN_SPDT_ID } from "@/lib/spdtNtp";
import {
  adalahPdf,
  jalurDokumen,
  namaUnduhan,
  periksaIsianDokumen,
  periksaUkuranDokumen,
  type DokumenPeriksa,
  type DokumenPeriksaAdmin,
} from "@/lib/dokumenPeriksa";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAKS_AKTIF_PER_PML = 300;
const TTL_TAUTAN_DETIK = 300;
const TABEL = "sigap_spdt_dokumen";
const KOLOM = "id, kegiatan_id, pml_akun_id, judul, keterangan, wilayah, tanggal_periksa, file_path, nama_asli, ukuran_byte, diunggah_at";

const galat = (pesan: string, status = 400) => NextResponse.json({ error: pesan }, { status });

type Baris = {
  id: number; kegiatan_id: number; pml_akun_id: number; judul: string; keterangan: string | null; wilayah: string | null;
  tanggal_periksa: string | null; file_path: string; nama_asli: string | null; ukuran_byte: number; diunggah_at: string;
};

function keDokumen(b: Baris, oleh: string | null): DokumenPeriksa {
  return {
    id: b.id, kegiatan_id: b.kegiatan_id, pml_id: b.pml_akun_id, judul: b.judul, keterangan: b.keterangan, wilayah: b.wilayah, tanggal_periksa: b.tanggal_periksa,
    nama_asli: b.nama_asli, ukuran_byte: b.ukuran_byte, diunggah_at: b.diunggah_at, diunggah_oleh: oleh,
  };
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function namaAkun(db: Db, ids: number[]): Promise<Map<number, string>> {
  const uniq = Array.from(new Set(ids));
  const peta = new Map<number, string>();
  if (uniq.length === 0) return peta;
  const { data } = await db.from("sigap_akun").select("id, nama").in("id", uniq);
  for (const r of (data ?? []) as { id: number; nama: string }[]) peta.set(Number(r.id), String(r.nama ?? ""));
  return peta;
}

/** Pilihan Jorong milik PML ini: kunci "NAGARI|JORONG" dari KK yang ia awasi. */
async function wilayahPml(db: Db, akunId: number): Promise<string[]> {
  const kk = await bacaKkSpdt(db, akunId, "pml");
  return Array.from(new Set(kk.map((k) => `${k.nagari}|${k.jorong}`))).sort();
}

export async function GET(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  const sp = req.nextUrl.searchParams;
  try {
    const peran = await peranSpdt(db, akun.id);
    if (!peran) return galat("Dokumen pemeriksaan khusus petugas SPDT NTP.", 403);

    const unduh = sp.get("unduh");
    if (unduh) {
      const id = Number(unduh);
      if (!Number.isInteger(id) || id <= 0) return galat("Dokumen tidak ditemukan.", 404);
      const { data: b } = await db.from(TABEL).select(KOLOM).eq("id", id).eq("kegiatan_id", KEGIATAN_SPDT_ID).is("dihapus_at", null).maybeSingle();
      if (!b) return galat("Dokumen tidak ditemukan atau sudah ditarik.", 404);
      const dok = b as Baris;
      const supervisor = peran === "supervisor";
      if (!supervisor && !(peran === "pml" && dok.pml_akun_id === akun.id)) return galat("Tidak berhak mengunduh dokumen ini.", 403);
      const nama = namaUnduhan((await namaAkun(db, [dok.pml_akun_id])).get(dok.pml_akun_id) ?? "", dok.judul);
      const { data: ttd, error } = await db.storage.from(BUCKET_SIGAP).createSignedUrl(dok.file_path, TTL_TAUTAN_DETIK, { download: nama });
      if (error || !ttd?.signedUrl) return galat("Berkas tidak dapat dibuka. Coba lagi sebentar lagi.", 502);
      if (supervisor) await catatAudit(db, akun.id, "spdt.dokumen_unduh", { dokumen_id: dok.id, pml_akun_id: dok.pml_akun_id }).catch(() => undefined);
      return NextResponse.json({ url: ttd.signedUrl, nama });
    }

    if (sp.get("semua") === "1") {
      if (peran !== "supervisor") return galat("Daftar seluruh dokumen khusus Supervisor SPDT NTP.", 403);
      const { data, error } = await db.from(TABEL).select(KOLOM).eq("kegiatan_id", KEGIATAN_SPDT_ID).is("dihapus_at", null).order("diunggah_at", { ascending: false }).limit(1000);
      if (error) throw new Error(error.message);
      const baris = (data ?? []) as Baris[];
      const nama = await namaAkun(db, baris.map((x) => x.pml_akun_id));
      const dokumen: DokumenPeriksaAdmin[] = baris.map((b) => {
        const pml = nama.get(b.pml_akun_id) ?? `PML ${b.pml_akun_id}`;
        return { ...keDokumen(b, pml), pml_nama: pml };
      });
      return NextResponse.json({ sekarang: new Date().toISOString(), dokumen });
    }

    if (peran !== "pml") return galat("Unggah dan daftar dokumen pemeriksaan khusus PML. Supervisor membukanya lewat daftar semua dokumen.", 403);
    const [{ data, error }, wilayah] = await Promise.all([
      db.from(TABEL).select(KOLOM).eq("kegiatan_id", KEGIATAN_SPDT_ID).eq("pml_akun_id", akun.id).is("dihapus_at", null).order("diunggah_at", { ascending: false }).limit(MAKS_AKTIF_PER_PML),
      wilayahPml(db, akun.id),
    ]);
    if (error) throw new Error(error.message);
    return NextResponse.json({ sekarang: new Date().toISOString(), wilayah, dokumen: ((data ?? []) as Baris[]).map((b) => keDokumen(b, akun.nama)) });
  } catch (e) {
    return galatServer("spdt-dokumen GET", e);
  }
}

export async function POST(req: NextRequest) {
  const db = dbPortal();
  if (!db) return galat("SUPABASE_SERVICE_ROLE_KEY belum diset.", 500);
  const akun = await akunDariSesi(db, req.headers);
  if (!akun) return galat("Sesi berakhir. Silakan masuk kembali.", 401);
  if (aktorDariHeader(req.headers)) return galat('Mode "masuk sebagai" hanya untuk melihat tampilan. Kembali ke akun Anda untuk mengunggah.', 403);
  try {
    const peran = await peranSpdt(db, akun.id);
    if (peran !== "pml") return galat("Unggah dokumen pemeriksaan khusus PML SPDT NTP.", 403);

    const tipe = req.headers.get("content-type") ?? "";
    if (!tipe.includes("multipart/form-data")) {
      const b = (await req.json().catch(() => null)) as { aksi?: unknown; id?: unknown } | null;
      if (!b || b.aksi !== "tarik") return galat("Aksi tidak dikenal.");
      const id = Number(b.id);
      if (!Number.isInteger(id) || id <= 0) return galat("Dokumen tidak ditemukan.", 404);
      const { data, error } = await db
        .from(TABEL)
        .update({ dihapus_at: new Date().toISOString(), dihapus_oleh: akun.id })
        .eq("id", id)
        .eq("kegiatan_id", KEGIATAN_SPDT_ID)
        .eq("pml_akun_id", akun.id)
        .is("dihapus_at", null)
        .select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return galat("Dokumen tidak ditemukan atau sudah ditarik.", 404);
      await catatAudit(db, akun.id, "spdt.dokumen_tarik", { dokumen_id: id }).catch(() => undefined);
      return NextResponse.json({ ok: true, id });
    }

    let form: FormData;
    try { form = await req.formData(); } catch { return galat("Isian tidak terbaca."); }
    const berkas = form.get("berkas");
    if (!(berkas instanceof File)) return galat("Berkas PDF wajib dipilih.");
    const salahUkuran = periksaUkuranDokumen(berkas.size);
    if (salahUkuran) return galat(salahUkuran, berkas.size > 0 ? 413 : 400);
    const buf = await berkas.arrayBuffer();
    if (!adalahPdf(new Uint8Array(buf))) return galat("Berkas bukan PDF. Simpan hasil scan sebagai PDF lalu pilih lagi.", 415);
    const isian = periksaIsianDokumen(
      { judul: form.get("judul"), keterangan: form.get("keterangan"), wilayah: form.get("wilayah"), tanggal_periksa: form.get("tanggal_periksa") },
      await wilayahPml(db, akun.id),
      berkas.name || null
    );
    if (!isian.ok) return galat(isian.pesan);

    const sha = await sha256Hex(buf);
    const keg = KEGIATAN_SPDT_ID;
    const { data: ada } = await db.from(TABEL).select(KOLOM).eq("kegiatan_id", keg).eq("pml_akun_id", akun.id).eq("sha256", sha).is("dihapus_at", null).maybeSingle();
    if (ada) return NextResponse.json({ ok: true, duplikat: true, dokumen: keDokumen(ada as Baris, akun.nama) });

    const { count } = await db.from(TABEL).select("id", { count: "exact", head: true }).eq("kegiatan_id", keg).eq("pml_akun_id", akun.id).is("dihapus_at", null);
    if ((count ?? 0) >= MAKS_AKTIF_PER_PML) return galat(`Sudah ada ${MAKS_AKTIF_PER_PML} dokumen aktif. Tarik dokumen yang tidak diperlukan dulu.`, 409);

    const jalur = jalurDokumen(keg, akun.id, sha);
    const { error: eUnggah } = await db.storage.from(BUCKET_SIGAP).upload(jalur, Buffer.from(buf), { contentType: "application/pdf", upsert: true });
    if (eUnggah) return galat("Berkas gagal disimpan. Coba lagi.", 502);

    const { data: baru, error: eSimpan } = await db
      .from(TABEL)
      .insert({
        kegiatan_id: keg, pml_akun_id: akun.id, judul: isian.isi.judul, keterangan: isian.isi.keterangan, wilayah: isian.isi.wilayah,
        tanggal_periksa: isian.isi.tanggal_periksa, file_path: jalur, nama_asli: (berkas.name || "").slice(0, 200) || null, ukuran_byte: berkas.size, sha256: sha,
      })
      .select(KOLOM)
      .single();
    if (eSimpan) {
      // dua kiriman identik bersamaan: yang kedua kalah balapan, anggap duplikat
      if ((eSimpan as { code?: string }).code === "23505") {
        const { data: sama } = await db.from(TABEL).select(KOLOM).eq("kegiatan_id", keg).eq("pml_akun_id", akun.id).eq("sha256", sha).is("dihapus_at", null).maybeSingle();
        if (sama) return NextResponse.json({ ok: true, duplikat: true, dokumen: keDokumen(sama as Baris, akun.nama) });
      }
      throw new Error(eSimpan.message);
    }
    await catatAudit(db, akun.id, "spdt.dokumen_unggah", { dokumen_id: (baru as Baris).id, ukuran: berkas.size, wilayah: isian.isi.wilayah }).catch(() => undefined);
    return NextResponse.json({ ok: true, duplikat: false, dokumen: keDokumen(baru as Baris, akun.nama) });
  } catch (e) {
    return galatServer("spdt-dokumen POST", e);
  }
}
